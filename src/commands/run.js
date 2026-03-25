/**
 * sentix run "요청" — Governor 파이프라인 실행
 *
 * Claude Code를 spawn으로 안전하게 호출하고, governor-state.json 기록, pattern-log.jsonl 기록.
 */

import { spawnSync } from 'node:child_process';
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

    // ── Check Claude Code is available ──────────────
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claudeCheck.error) {
      ctx.error('Claude Code CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code');
      return;
    }

    // ── Check for concurrent execution ──────────────
    if (ctx.exists('tasks/governor-state.json')) {
      try {
        const existing = await ctx.readJSON('tasks/governor-state.json');
        if (existing.status === 'in_progress') {
          ctx.error(`Another pipeline is running: ${existing.cycle_id}`);
          ctx.log('  Wait for it to complete, or delete tasks/governor-state.json to force.');
          return;
        }
      } catch {
        // Malformed file — safe to overwrite
      }
    }

    // ── Create governor state ───────────────────────
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;

    const state = {
      schema_version: 1,
      cycle_id: cycleId,
      request,
      status: 'in_progress',
      current_phase: 'governor',
      plan: [],
      retries: {},
      cross_judgments: [],
      started_at: new Date().toISOString(),
      completed_at: null,
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

    // ── Invoke Claude Code (safe spawn, no shell) ───
    ctx.log('Invoking Claude Code Governor...');
    ctx.log('');

    const prompt = [
      'Read CLAUDE.md and FRAMEWORK.md first.',
      'Execute the following request through the 7-step Governor pipeline:',
      `"${request}"`,
      '',
      'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
    ].join('\n');

    const result = spawnSync('claude', ['-p', prompt], {
      cwd: ctx.cwd,
      stdio: 'inherit',
      timeout: 600_000, // 10 minutes
    });

    if (result.error) {
      state.status = 'failed';
      state.error = result.error.message;
      await ctx.writeJSON('tasks/governor-state.json', state);

      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-failed',
        cycle_id: cycleId,
        error: result.error.message,
      });

      if (result.error.code === 'ETIMEDOUT') {
        ctx.error('Pipeline timed out after 10 minutes.');
      } else {
        ctx.error(`Pipeline failed: ${result.error.message}`);
      }
      return;
    }

    if (result.status !== 0) {
      state.status = 'failed';
      state.error = `Exit code ${result.status}`;
      await ctx.writeJSON('tasks/governor-state.json', state);

      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-failed',
        cycle_id: cycleId,
        error: `Exit code ${result.status}`,
      });

      ctx.error(`Pipeline exited with code ${result.status}`);
      return;
    }

    // ── Update state on completion ──────────────────
    state.status = 'completed';
    state.completed_at = new Date().toISOString();
    await ctx.writeJSON('tasks/governor-state.json', state);

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'pipeline-complete',
      cycle_id: cycleId,
    });

    ctx.success('Pipeline completed.');
  },
});
