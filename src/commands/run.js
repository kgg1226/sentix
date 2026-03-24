/**
 * sentix run "요청" — Governor 파이프라인 실행
 *
 * Claude Code를 호출하고, governor-state.json 기록, pattern-log.jsonl 기록.
 */

import { execSync } from 'node:child_process';
import { registerCommand } from '../registry.js';

registerCommand('run', {
  description: 'Run a request through the Governor pipeline',
  usage: 'sentix run "요청 내용"',

  async run(args, ctx) {
    const request = args.join(' ').trim();

    if (!request) {
      ctx.error('Usage: sentix run "요청 내용"');
      ctx.log('  Example: sentix run "인증에 세션 만료 추가해줘"');
      return;
    }

    // ── Preflight checks ────────────────────────────
    if (!ctx.exists('CLAUDE.md')) {
      ctx.error('CLAUDE.md not found. Run: sentix init');
      return;
    }

    // ── Create governor state ───────────────────────
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;

    const state = {
      cycle_id: cycleId,
      request,
      status: 'in_progress',
      current_phase: 'governor',
      plan: [],
      retries: {},
      cross_judgments: [],
      started_at: new Date().toISOString(),
      human_intervention_requested: false,
    };

    await ctx.writeJSON('tasks/governor-state.json', state);
    ctx.success(`Cycle ${cycleId} started`);
    ctx.log(`Request: "${request}"`);
    ctx.log('');

    // ── Log to pattern-log.jsonl ────────────────────
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'request',
      input: request,
      cycle_id: cycleId,
    });

    // ── Invoke Claude Code ──────────────────────────
    ctx.log('Invoking Claude Code Governor...');
    ctx.log('');

    const prompt = [
      'Read CLAUDE.md and FRAMEWORK.md first.',
      `Execute the following request through the 7-step Governor pipeline:`,
      `"${request}"`,
      '',
      'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
    ].join('\n');

    try {
      execSync(`claude -p "${prompt.replace(/"/g, '\\"')}"`, {
        cwd: ctx.cwd,
        stdio: 'inherit',
        timeout: 600_000, // 10 minutes
      });

      // ── Update state on completion ────────────────
      state.status = 'completed';
      state.completed_at = new Date().toISOString();
      await ctx.writeJSON('tasks/governor-state.json', state);

      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-complete',
        cycle_id: cycleId,
      });

      ctx.success('Pipeline completed.');
    } catch (err) {
      state.status = 'failed';
      state.error = err.message;
      await ctx.writeJSON('tasks/governor-state.json', state);

      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-failed',
        cycle_id: cycleId,
        error: err.message,
      });

      ctx.error(`Pipeline failed: ${err.message}`);
    }
  },
});
