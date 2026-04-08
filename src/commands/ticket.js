/**
 * sentix ticket — 버그/이슈 티켓 관리
 *
 * sentix ticket create "설명" [--severity critical|warning|suggestion]
 * sentix ticket list [--status open] [--severity critical]
 * sentix ticket debug <ticket-id>
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import {
  loadIndex, addTicket, updateTicket, findTicket,
  nextTicketId, classifySeverity, sortBySeverity, createTicketEntry,
} from '../lib/ticket-index.js';
import { findBestMatch } from '../lib/similarity.js';
import { colors, makeBorders, cardLine, cardTitle, visualWidth } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('ticket', {
  description: 'Manage bug/issue tickets (create | list | debug)',
  usage: 'sentix ticket <create|list|debug> [args...] [--severity critical|warning|suggestion]',

  async run(args, ctx) {
    const subcommand = args[0];

    if (subcommand === 'create') {
      await createTicket(args.slice(1), ctx);
    } else if (!subcommand || subcommand === 'list') {
      await listTickets(args.slice(1), ctx);
    } else if (subcommand === 'debug') {
      const ticketId = args[1];
      if (!ticketId) {
        ctx.error('Usage: sentix ticket debug <ticket-id>');
        return;
      }
      await debugTicket(ticketId, ctx);
    } else {
      ctx.error(`Unknown subcommand: ${subcommand}`);
      ctx.log('Usage: sentix ticket <create|list|debug> [args...]');
    }
  },
});

// ── sentix ticket create ──────────────────────────────

async function createTicket(args, ctx) {
  // Parse --severity flag
  let severity = null;
  const flagIdx = args.indexOf('--severity');
  if (flagIdx !== -1) {
    severity = args[flagIdx + 1];
    if (!['critical', 'warning', 'suggestion'].includes(severity)) {
      ctx.error(`Invalid severity: ${severity} (use critical|warning|suggestion)`);
      return;
    }
    args.splice(flagIdx, 2);
  }

  const description = args.join(' ').trim();
  if (!description) {
    ctx.error('Usage: sentix ticket create "bug description" [--severity critical|warning|suggestion]');
    return;
  }

  // Auto-classify severity if not specified
  let autoClassified = false;
  if (!severity) {
    severity = classifySeverity(description);
    autoClassified = true;
  }

  // Duplicate detection
  await checkDuplicates(description, ctx);

  // Create ticket
  const id = await nextTicketId(ctx, 'bug');
  const title = description.length > 80 ? description.slice(0, 77) + '...' : description;

  const entry = createTicketEntry({
    id,
    type: 'bug',
    title,
    severity,
    description,
  });

  // Generate markdown file
  const md = `# ${id}: ${title}

- **Status:** open
- **Severity:** ${severity}
- **Created:** ${entry.created_at}
- **Related lessons:** ${await findRelatedLessons(description, ctx)}

## Description

${description}

## Root Cause Analysis

<!-- Populated after sentix ticket debug -->

## Resolution

<!-- Populated after fix -->
`;

  await ctx.writeFile(entry.file_path, md);
  await addTicket(ctx, entry);

  // Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'ticket:create',
    id,
    severity,
    title,
  });

  ctx.log('');
  ctx.log(`  ${green('●')} ${bold('티켓 생성')}  ${cyan(id)}`);
  ctx.log(`  ${dim('제목')}      ${title}`);
  ctx.log(`  ${dim('심각도')}    ${severityBadge(severity)}${autoClassified ? '  ' + dim('(자동 분류)') : ''}`);
  ctx.log(`  ${dim('파일')}      ${dim(entry.file_path)}`);
  ctx.log('');
}

function severityBadge(severity) {
  if (severity === 'critical')   return red(severity);
  if (severity === 'warning')    return yellow(severity);
  if (severity === 'suggestion') return cyan(severity);
  return dim(severity || '-');
}

// ── sentix ticket list ────────────────────────────────

async function listTickets(args, ctx) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Tickets')) + dim('  ·  버그/이슈 티켓'));
  ctx.log('');

  let entries = await loadIndex(ctx);
  const totalAll = entries.length;

  // Parse filters
  const statusIdx = args.indexOf('--status');
  let statusFilter = null;
  if (statusIdx !== -1 && args[statusIdx + 1]) {
    statusFilter = args[statusIdx + 1];
    entries = entries.filter((e) => e.status === statusFilter);
  }

  const sevIdx = args.indexOf('--severity');
  let severityFilter = null;
  if (sevIdx !== -1 && args[sevIdx + 1]) {
    severityFilter = args[sevIdx + 1];
    entries = entries.filter((e) => e.severity === severityFilter);
  }

  // ── 빈 상태 ────────────────────────────────────────
  if (totalAll === 0) {
    ctx.log(`  ${dim('상태')}  ${yellow('없음')}`);
    ctx.log('');
    ctx.log(borders.top);
    ctx.log(cardTitle('TICKETS'));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${dim('· 아직 생성된 티켓이 없습니다')}`));
    ctx.log(cardLine(`  ${dim('└')} ${dim('sentix ticket create "<설명>"')}`));
    ctx.log(borders.bottom);
    ctx.log('');
    return;
  }

  if (entries.length === 0) {
    ctx.log(`  ${dim('필터')}  ${dim((statusFilter || '') + ' ' + (severityFilter || ''))}`);
    ctx.log(`  ${dim('결과')}  ${yellow('일치하는 티켓 없음')} ${dim(`(전체 ${totalAll}개)`)}`);
    ctx.log('');
    return;
  }

  entries = sortBySeverity(entries);

  // ── 통계 요약 ─────────────────────────────────────
  const counts = { open: 0, in_progress: 0, closed: 0, other: 0 };
  for (const e of entries) {
    if (counts[e.status] !== undefined) counts[e.status]++;
    else counts.other++;
  }
  const sevCounts = { critical: 0, warning: 0, suggestion: 0, other: 0 };
  for (const e of entries) {
    if (sevCounts[e.severity] !== undefined) sevCounts[e.severity]++;
    else sevCounts.other++;
  }

  ctx.log(`  ${dim('총   ')}  ${entries.length}${entries.length < totalAll ? dim(` / ${totalAll} (필터됨)`) : ''}`);
  const statusLine = [
    counts.open        > 0 ? `${yellow('open')} ${counts.open}` : null,
    counts.in_progress > 0 ? `${cyan('in_progress')} ${counts.in_progress}` : null,
    counts.closed      > 0 ? `${dim('closed')} ${counts.closed}` : null,
  ].filter(Boolean).join('  ');
  if (statusLine) ctx.log(`  ${dim('상태 ')}  ${statusLine}`);
  const sevLine = [
    sevCounts.critical   > 0 ? `${red('critical')} ${sevCounts.critical}` : null,
    sevCounts.warning    > 0 ? `${yellow('warning')} ${sevCounts.warning}` : null,
    sevCounts.suggestion > 0 ? `${cyan('suggestion')} ${sevCounts.suggestion}` : null,
  ].filter(Boolean).join('  ');
  if (sevLine) ctx.log(`  ${dim('심각도')} ${sevLine}`);
  ctx.log('');

  // ── 카드: 티켓 리스트 ─────────────────────────────
  ctx.log(borders.top);
  ctx.log(cardTitle('TICKETS', dim(`${entries.length}`)));
  ctx.log(borders.mid);

  // 가장 긴 ID 측정
  const idWidth = Math.max(8, ...entries.map((e) => e.id.length));

  for (const e of entries) {
    const id = e.id.padEnd(idWidth);
    const sev = severityBadge(e.severity);
    const sevPad = ' '.repeat(Math.max(0, 11 - (e.severity?.length || 1)));
    const status = statusBadge(e.status);
    const statusPad = ' '.repeat(Math.max(0, 13 - (e.status?.length || 1)));

    // 제목은 남는 공간에 절단
    ctx.log(cardLine(`${cyan(id)}  ${sev}${sevPad} ${status}${statusPad} ${e.title}`));
  }

  ctx.log(borders.bottom);
  ctx.log('');
  ctx.log(`  ${dim('상세:')} ${dim('sentix ticket debug <id>')}`);
  ctx.log('');
}

function statusBadge(status) {
  if (status === 'open')        return yellow(status);
  if (status === 'in_progress') return cyan(status);
  if (status === 'closed')      return dim(status);
  return dim(status || '-');
}

// ── sentix ticket debug ───────────────────────────────

async function debugTicket(ticketId, ctx) {
  // 1. Find ticket
  const ticket = await findTicket(ctx, ticketId);
  if (!ticket) {
    ctx.error(`Ticket not found: ${ticketId}`);
    return;
  }

  if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
    ctx.error(`Ticket ${ticketId} is ${ticket.status} — only open or in_progress tickets can be debugged`);
    return;
  }

  // 2. Check Claude Code
  const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  if (claudeCheck.error) {
    ctx.error('Claude Code CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code');
    return;
  }

  // 3. Check for concurrent pipeline
  if (ctx.exists('tasks/governor-state.json')) {
    try {
      const existing = await ctx.readJSON('tasks/governor-state.json');
      if (existing.status === 'in_progress') {
        ctx.error(`Another pipeline is running: ${existing.cycle_id}`);
        return;
      }
    } catch { /* safe to proceed */ }
  }

  // 4. Update ticket status
  await updateTicket(ctx, ticketId, { status: 'in_progress' });
  ctx.log('');
  ctx.log(` ${bold(cyan('Sentix Debug'))}  ${dim('·')}  ${dim('티켓 디버깅')}`);
  ctx.log('');
  ctx.log(`  ${dim('티켓  ')}  ${cyan(ticketId)}  ${dim('— ' + ticket.title)}`);
  ctx.log(`  ${dim('심각도')}  ${severityBadge(ticket.severity)}`);
  ctx.log('');

  // 5. Read ticket markdown
  let ticketContent = '';
  if (ctx.exists(ticket.file_path)) {
    ticketContent = await ctx.readFile(ticket.file_path);
  }

  // 6. Read lessons for context
  let lessons = '';
  if (ctx.exists('tasks/lessons.md')) {
    lessons = await ctx.readFile('tasks/lessons.md');
  }

  // 7. Determine retry limit by severity
  const retryLimits = { critical: 3, warning: 10, suggestion: 0 };
  const retryLimit = retryLimits[ticket.severity] || 3;

  // 8. Create governor state
  const cycleId = `debug-${ticketId}-${String(Date.now()).slice(-3)}`;
  const state = {
    schema_version: 1,
    cycle_id: cycleId,
    request: `DEBUG: ${ticket.title}`,
    status: 'in_progress',
    current_phase: 'dev-fix',
    plan: [{ agent: 'dev-fix', status: 'running', result_ref: null }],
    retries: { 'dev-fix': 0 },
    cross_judgments: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    human_intervention_requested: false,
    ticket_id: ticketId,
    ticket_type: 'bug',
  };
  await ctx.writeJSON('tasks/governor-state.json', state);

  // 9. Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'ticket:debug',
    id: ticketId,
    severity: ticket.severity,
    cycle_id: cycleId,
  });

  // 10. Invoke Claude Code with debug prompt
  const prompt = [
    'Read CLAUDE.md and FRAMEWORK.md first.',
    '',
    `DEBUG MODE — Ticket: ${ticketId}`,
    '',
    '## Ticket Content',
    ticketContent,
    '',
    '## Known Lessons',
    lessons.slice(0, 2000),
    '',
    '## Instructions',
    '1. Analyze the bug described in the ticket',
    '2. Identify root cause',
    '3. Implement fix within SCOPE (respect hard rules)',
    '4. Run tests to verify fix',
    '5. Generate LESSON_LEARNED and append to tasks/lessons.md',
    `6. Update ${ticket.file_path} with root cause analysis`,
    '7. Update tasks/governor-state.json at each phase',
    '',
    `Severity: ${ticket.severity} (retry limit: ${retryLimit})`,
  ].join('\n');

  ctx.log(`  ${dim('Claude Code 호출 중...')}`);
  ctx.log('');

  const result = spawnSync('claude', ['-p', prompt], {
    cwd: ctx.cwd,
    stdio: 'inherit',
    timeout: 600_000,
  });

  // 11. Handle result
  if (result.error || result.status !== 0) {
    state.status = 'failed';
    state.error = result.error?.message || `Exit code ${result.status}`;
    await ctx.writeJSON('tasks/governor-state.json', state);

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'ticket:debug:failed',
      id: ticketId,
      cycle_id: cycleId,
      error: state.error,
    });

    // Escalate critical failures to roadmap
    if (ticket.severity === 'critical') {
      ctx.warn('Critical ticket debug failed — escalating to roadmap');
      if (ctx.exists('tasks/roadmap.md')) {
        const roadmap = await ctx.readFile('tasks/roadmap.md');
        const escalation = `\n- **[ESCALATED]** ${ticketId}: ${ticket.title} (debug failed, needs manual review)\n`;
        await ctx.writeFile('tasks/roadmap.md', roadmap + escalation);
      }
    }

    await updateTicket(ctx, ticketId, { status: 'open' });
    ctx.error(`Debug failed for ${ticketId}`);
    return;
  }

  // 12. Success
  state.status = 'completed';
  state.completed_at = new Date().toISOString();
  state.plan[0].status = 'done';
  await ctx.writeJSON('tasks/governor-state.json', state);

  await updateTicket(ctx, ticketId, {
    status: 'review',
    related_cycle: cycleId,
  });

  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'ticket:debug:complete',
    id: ticketId,
    cycle_id: cycleId,
  });

  ctx.success(`Debug completed for ${ticketId} — status: review`);
}

// ── Helpers ───────────────────────────────────────────

async function checkDuplicates(description, ctx) {
  const candidates = [];

  // Collect from lessons.md
  if (ctx.exists('tasks/lessons.md')) {
    const lessons = await ctx.readFile('tasks/lessons.md');
    const lines = lessons.split('\n').filter(l => l.startsWith('- '));
    for (const line of lines) {
      candidates.push(line.replace(/^-\s*/, ''));
    }
  }

  // Collect from existing tickets
  const entries = await loadIndex(ctx);
  for (const e of entries) {
    candidates.push(e.title);
  }

  const match = findBestMatch(description, candidates);
  if (match) {
    ctx.warn(`Possible duplicate (${(match.score * 100).toFixed(0)}% similar):`);
    ctx.warn(`  "${match.text}"`);
  }
}

async function findRelatedLessons(description, ctx) {
  if (!ctx.exists('tasks/lessons.md')) return '(none)';

  const lessons = await ctx.readFile('tasks/lessons.md');
  const lines = lessons.split('\n').filter(l => l.startsWith('- '));

  const match = findBestMatch(description, lines.map(l => l.replace(/^-\s*/, '')));
  if (match) return match.text;
  return '(none)';
}
