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
import { colors } from '../lib/ui-box.js';
import { runTicketDebug } from '../lib/ticket-debug.js';
import {
  severityBadge,
  statusBadge,
  computeTicketStats,
  renderEmptyTickets,
  renderNoMatch,
  renderTicketSummary,
  renderTicketTable,
} from '../lib/ticket-render.js';

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

// ── sentix ticket list ────────────────────────────────

async function listTickets(args, ctx) {
  ctx.log('');
  ctx.log(bold(cyan(' Sentix Tickets')) + dim('  ·  버그/이슈 티켓'));
  ctx.log('');

  let entries = await loadIndex(ctx);
  const totalAll = entries.length;

  // Parse filters
  const statusIdx = args.indexOf('--status');
  const statusFilter = statusIdx !== -1 ? args[statusIdx + 1] : null;
  if (statusFilter) entries = entries.filter((e) => e.status === statusFilter);

  const sevIdx = args.indexOf('--severity');
  const severityFilter = sevIdx !== -1 ? args[sevIdx + 1] : null;
  if (severityFilter) entries = entries.filter((e) => e.severity === severityFilter);

  if (totalAll === 0) {
    renderEmptyTickets(ctx);
    return;
  }

  if (entries.length === 0) {
    renderNoMatch(ctx, { statusFilter, severityFilter, totalAll });
    return;
  }

  entries = sortBySeverity(entries);
  const stats = computeTicketStats(entries);

  renderTicketSummary(ctx, { entries, totalAll, stats });
  renderTicketTable(ctx, entries);
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

  // 4. Delegate to lib
  await runTicketDebug(ticket, ctx);
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
