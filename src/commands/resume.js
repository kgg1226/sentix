/**
 * sentix resume — 중단된 파이프라인 재개
 *
 * governor-state.json에서 마지막 완료 phase를 찾아
 * 다음 phase부터 파이프라인을 재개한다.
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { runGates } from '../lib/verify-gates.js';
import { isConfigured } from '../lib/safety.js';

const STATE_PATH = 'tasks/governor-state.json';

registerCommand('resume', {
  description: 'Resume a failed or interrupted pipeline',
  usage: 'sentix resume [cycle-id]',

  async run(args, ctx) {
    // ── Load state ──────────────────────────────────
    if (!ctx.exists(STATE_PATH)) {
      ctx.error('No pipeline to resume. (tasks/governor-state.json not found)');
      ctx.log('  Start a new pipeline with: sentix run "요청"');
      return;
    }

    let state;
    try {
      state = await ctx.readJSON(STATE_PATH);
    } catch {
      ctx.error('governor-state.json is corrupted. Start a new pipeline with: sentix run "요청"');
      return;
    }

    // ── Validate state ──────────────────────────────
    const targetCycle = args[0];
    if (targetCycle && state.cycle_id !== targetCycle) {
      ctx.error(`Cycle mismatch: state has ${state.cycle_id}, requested ${targetCycle}`);
      return;
    }

    if (state.status === 'completed') {
      ctx.warn('Pipeline already completed. Nothing to resume.');
      ctx.log(`  Cycle: ${state.cycle_id}`);
      ctx.log(`  Completed at: ${state.completed_at}`);
      return;
    }

    if (state.status !== 'in_progress' && state.status !== 'failed' && state.status !== 'gate-warning') {
      ctx.error(`Cannot resume pipeline with status: ${state.status}`);
      return;
    }

    // ── Analyze progress ────────────────────────────
    const plan = state.plan || [];
    const donePhases = plan.filter(s => s.status === 'done');
    const pendingPhases = plan.filter(s => s.status === 'pending' || s.status === 'running');

    ctx.log('=== Pipeline Resume ===\n');
    ctx.log(`  Cycle: ${state.cycle_id}`);
    ctx.log(`  Request: "${state.request}"`);
    ctx.log(`  Status: ${state.status}`);
    ctx.log(`  Last phase: ${state.current_phase}`);
    ctx.log('');

    if (donePhases.length > 0) {
      ctx.log('  Completed phases:');
      for (const p of donePhases) {
        ctx.success(`    ✓ ${p.agent}${p.result ? ` (${p.result})` : ''}`);
      }
    }

    if (pendingPhases.length > 0) {
      ctx.log('  Remaining phases:');
      for (const p of pendingPhases) {
        ctx.log(`    ○ ${p.agent} — ${p.status}`);
      }
    }

    ctx.log('');

    // ── Check Claude Code ───────────────────────────
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claudeCheck.error) {
      ctx.error('Claude Code CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code');
      return;
    }

    // ── Build resume prompt ─────────────────────────
    const completedSummary = donePhases.length > 0
      ? donePhases.map(p => `  - ${p.agent}: ${p.status}${p.result ? ` (${p.result})` : ''}${p.result_ref ? ` → ${p.result_ref}` : ''}`).join('\n')
      : '  (none)';

    const resumeFrom = pendingPhases.length > 0
      ? pendingPhases[0].agent
      : state.current_phase;

    const safetyDirective = await isConfigured(ctx)
      ? 'SAFETY WORD is configured. For dangerous operations, verify with: node bin/sentix.js safety verify <word>.'
      : '';

    const prompt = [
      'Read CLAUDE.md first. Refer to FRAMEWORK.md and docs/ only when needed.',
      safetyDirective,
      '',
      `RESUME MODE — Continuing interrupted cycle: ${state.cycle_id}`,
      `Original request: "${state.request}"`,
      '',
      'Completed phases:',
      completedSummary,
      '',
      `Resume from: ${resumeFrom}`,
      '',
      'Continue the Governor pipeline from this point.',
      'Do NOT re-execute completed phases — their results are preserved.',
      'Update tasks/governor-state.json at each phase.',
    ].filter(s => s !== undefined).join('\n');

    ctx.log('Resuming pipeline...');
    ctx.log('');

    // ── Update state ────────────────────────────────
    state.status = 'in_progress';
    state.resumed_at = new Date().toISOString();
    await ctx.writeJSON(STATE_PATH, state);

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'pipeline-resume',
      cycle_id: state.cycle_id,
      resume_from: resumeFrom,
      completed_phases: donePhases.length,
    });

    // ── Invoke Claude Code ──────────────────────────
    const result = spawnSync('claude', ['-p', prompt], {
      cwd: ctx.cwd,
      stdio: 'inherit',
      timeout: 600_000,
    });

    if (result.error) {
      state.status = 'failed';
      state.error = result.error.message;
      await ctx.writeJSON(STATE_PATH, state);
      ctx.error(`Resume failed: ${result.error.message}`);
      return;
    }

    if (result.status !== 0) {
      state.status = 'failed';
      state.error = `Exit code ${result.status}`;
      await ctx.writeJSON(STATE_PATH, state);
      ctx.error(`Resume exited with code ${result.status}`);
      return;
    }

    // ── Verification gates ──────────────────────────
    ctx.log('');
    ctx.log('--- Verification Gates ---');

    const gateResults = runGates(ctx.cwd);

    for (const check of gateResults.checks) {
      if (check.passed) {
        ctx.success(`[${check.rule}] ${check.detail}`);
      } else {
        ctx.warn(`[${check.rule}] ${check.detail}`);
        for (const v of check.violations) {
          ctx.warn(`  → ${v.message}`);
        }
      }
    }

    ctx.log('');

    // ── Update state on completion ──────────────────
    state.status = gateResults.passed ? 'completed' : 'gate-warning';
    state.completed_at = new Date().toISOString();
    state.verification = gateResults;
    await ctx.writeJSON(STATE_PATH, state);

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: gateResults.passed ? 'pipeline-complete' : 'pipeline-gate-warning',
      cycle_id: state.cycle_id,
      resumed: true,
    });

    if (gateResults.passed) {
      ctx.success('Resumed pipeline completed — all gates passed.');
    } else {
      ctx.warn(`Resumed pipeline completed with ${gateResults.violations.length} gate warning(s).`);
    }
  },
});
