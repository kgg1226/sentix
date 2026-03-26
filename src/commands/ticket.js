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
  if (!severity) {
    severity = classifySeverity(description);
    ctx.log(`Auto-classified severity: ${severity}`);
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

  ctx.success(`Created ${id}: ${title}`);
  ctx.log(`  Severity: ${severity}`);
  ctx.log(`  File:     ${entry.file_path}`);
}

// ── sentix ticket list ────────────────────────────────

async function listTickets(args, ctx) {
  ctx.log('=== Tickets ===\n');

  let entries = await loadIndex(ctx);

  if (entries.length === 0) {
    ctx.log('  (no tickets)');
    ctx.log('\n  Create one: sentix ticket create "description"');
    return;
  }

  // Parse filters
  const statusIdx = args.indexOf('--status');
  if (statusIdx !== -1 && args[statusIdx + 1]) {
    const status = args[statusIdx + 1];
    entries = entries.filter(e => e.status === status);
  }

  const sevIdx = args.indexOf('--severity');
  if (sevIdx !== -1 && args[sevIdx + 1]) {
    const sev = args[sevIdx + 1];
    entries = entries.filter(e => e.severity === sev);
  }

  entries = sortBySeverity(entries);

  // Table header
  ctx.log(`  ${'ID'.padEnd(12)} ${'SEVERITY'.padEnd(12)} ${'STATUS'.padEnd(14)} TITLE`);
  ctx.log(`  ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(14)} ${'─'.repeat(30)}`);

  for (const e of entries) {
    const sev = e.severity ? e.severity.padEnd(12) : '-'.padEnd(12);
    ctx.log(`  ${e.id.padEnd(12)} ${sev} ${e.status.padEnd(14)} ${e.title}`);
  }

  ctx.log(`\n  Total: ${entries.length} ticket(s)`);
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
  ctx.log(`Debugging ${ticketId}: ${ticket.title}`);
  ctx.log(`Severity: ${ticket.severity}\n`);

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

  ctx.log('Invoking Claude Code for debugging...\n');

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
