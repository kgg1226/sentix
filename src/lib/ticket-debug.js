/**
 * Ticket debug workflow — Claude Code invocation for bug ticket debugging.
 *
 * ticket.js 의 debugTicket 함수를 분리. 순수하게 lib 함수로 호출 가능하며
 * ticket.js 는 preflight + 렌더링 → runTicketDebug 호출만 담당.
 */

import { spawnSync } from 'node:child_process';
import { updateTicket } from './ticket-index.js';
import { colors } from './ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

function severityBadge(severity) {
  if (severity === 'critical')   return red(severity);
  if (severity === 'warning')    return yellow(severity);
  if (severity === 'suggestion') return cyan(severity);
  return dim(severity || '-');
}

/**
 * 디버그 프롬프트 생성.
 * @param {object} ticket
 * @param {string} ticketContent
 * @param {string} lessons
 * @param {number} retryLimit
 * @returns {string}
 */
export function buildDebugPrompt(ticket, ticketContent, lessons, retryLimit) {
  return [
    'Read CLAUDE.md and FRAMEWORK.md first.',
    '',
    `DEBUG MODE — Ticket: ${ticket.id}`,
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
}

/**
 * Governor state 객체 생성 (debug cycle).
 */
export function buildDebugState(ticket, cycleId) {
  return {
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
    ticket_id: ticket.id,
    ticket_type: 'bug',
  };
}

/**
 * 디버그 사이클 실행 — 시작 배너 출력, state/prompt 생성, claude spawn,
 * 결과에 따라 상태 업데이트 + escalation.
 *
 * @returns {Promise<{ok: boolean, cycleId: string, error?: string}>}
 */
export async function runTicketDebug(ticket, ctx) {
  const ticketId = ticket.id;

  // 1. 상태 업데이트 + 시작 배너
  await updateTicket(ctx, ticketId, { status: 'in_progress' });
  ctx.log('');
  ctx.log(` ${bold(cyan('Sentix Debug'))}  ${dim('·')}  ${dim('티켓 디버깅')}`);
  ctx.log('');
  ctx.log(`  ${dim('티켓  ')}  ${cyan(ticketId)}  ${dim('— ' + ticket.title)}`);
  ctx.log(`  ${dim('심각도')}  ${severityBadge(ticket.severity)}`);
  ctx.log('');

  // 2. 컨텍스트 수집
  let ticketContent = '';
  if (ctx.exists(ticket.file_path)) {
    ticketContent = await ctx.readFile(ticket.file_path);
  }

  let lessons = '';
  if (ctx.exists('tasks/lessons.md')) {
    lessons = await ctx.readFile('tasks/lessons.md');
  }

  const retryLimits = { critical: 3, warning: 10, suggestion: 0 };
  const retryLimit = retryLimits[ticket.severity] || 3;

  // 3. Governor state + log
  const cycleId = `debug-${ticketId}-${String(Date.now()).slice(-3)}`;
  const state = buildDebugState(ticket, cycleId);
  await ctx.writeJSON('tasks/governor-state.json', state);

  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'ticket:debug',
    id: ticketId,
    severity: ticket.severity,
    cycle_id: cycleId,
  });

  // 4. Claude Code 호출
  ctx.log(`  ${dim('Claude Code 호출 중...')}`);
  ctx.log('');

  const prompt = buildDebugPrompt(ticket, ticketContent, lessons, retryLimit);
  const result = spawnSync('claude', ['-p', prompt], {
    cwd: ctx.cwd,
    stdio: 'inherit',
    timeout: 600_000,
  });

  // 5. 결과 처리
  if (result.error || result.status !== 0) {
    const error = result.error?.message || `Exit code ${result.status}`;
    state.status = 'failed';
    state.error = error;
    await ctx.writeJSON('tasks/governor-state.json', state);

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'ticket:debug:failed',
      id: ticketId,
      cycle_id: cycleId,
      error,
    });

    // critical failures 를 roadmap 으로 에스컬레이션
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
    return { ok: false, cycleId, error };
  }

  // 6. 성공
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

  ctx.log('');
  ctx.log(`  ${green('●')} ${bold('디버그 완료')}  ${cyan(ticketId)}  ${dim('→ status: review')}`);
  ctx.log('');
  return { ok: true, cycleId };
}
