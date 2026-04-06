/**
 * sentix run "요청" — Governor 파이프라인 실행
 *
 * Claude Code를 spawn으로 안전하게 호출하고, governor-state.json 기록, pattern-log.jsonl 기록.
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { runGates, runPreGates } from '../lib/verify-gates.js';
import { detectDangerousRequest, verifyWord, isConfigured } from '../lib/safety.js';

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

    // ── Safety word gate ───────────────────────────
    const dangerMatch = detectDangerousRequest(request);
    if (dangerMatch) {
      const hasSafety = await isConfigured(ctx);

      if (hasSafety) {
        // Find --safety-word flag in original args
        const swIdx = args.indexOf('--safety-word');
        const safetyInput = swIdx !== -1 ? args[swIdx + 1] : null;

        if (!safetyInput) {
          ctx.error('[SENTIX:SAFETY] 위험 요청이 감지되었습니다.');
          ctx.log(`  패턴: ${dangerMatch}`);
          ctx.log('');
          ctx.log('  이 요청을 실행하려면 안전어를 입력하세요:');
          ctx.log('  sentix run "요청" --safety-word <안전어>');
          return;
        }

        const verified = await verifyWord(ctx, safetyInput);
        if (!verified) {
          ctx.error('[SENTIX:SAFETY] DENIED — 안전어가 일치하지 않습니다.');
          await ctx.appendJSONL('tasks/pattern-log.jsonl', {
            ts: new Date().toISOString(),
            event: 'safety-denied',
            input: request,
            pattern: dangerMatch,
          });
          return;
        }

        ctx.success('[SENTIX:SAFETY] VERIFIED — 진행합니다.');
      } else {
        ctx.warn('[SENTIX:SAFETY] 위험 요청이 감지되었습니다.');
        ctx.log(`  패턴: ${dangerMatch}`);
        ctx.log('');
        ctx.warn('  안전어가 설정되지 않아 추가 검증 없이 진행합니다.');
        ctx.warn('  보안 강화를 위해 설정을 권장합니다: sentix safety set <안전어>');
        ctx.log('');
      }
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

    // ── Pre-execution gates ──────────────────────────
    const mode = detectMode(request);

    ctx.log('--- Pre-execution Gates ---');
    const preGateResults = runPreGates(ctx.cwd, {
      skipTicketCheck: mode === 'hotfix',
    });

    for (const check of preGateResults.checks) {
      if (check.passed) {
        ctx.success(`[PRE:${check.rule}] ${check.detail}`);
      } else {
        ctx.warn(`[PRE:${check.rule}] ${check.detail}`);
        for (const v of check.violations) {
          ctx.warn(`  → ${v.message}`);
        }
      }
    }
    ctx.log('');

    // ── Check Claude Code is available ──────────────
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claudeCheck.error) {
      ctx.error('Claude Code CLI not found. Install: https://docs.anthropic.com/en/docs/claude-code');
      return;
    }

    // ── Create governor state ───────────────────────
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;

    const state = {
      schema_version: 1,
      cycle_id: cycleId,
      request,
      mode,
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
    ctx.log(`Mode: ${mode === 'hotfix' ? '핫픽스 (단축 파이프라인)' : '표준'}`);
    ctx.log('');

    // ── Log to pattern-log.jsonl ────────────────────
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'request',
      input: request,
      cycle_id: cycleId,
      mode,
    });

    // ── Invoke Claude Code (safe spawn, no shell) ───
    ctx.log('Invoking Claude Code Governor...');
    ctx.log('');

    const safetyDirective = await isConfigured(ctx)
      ? 'SAFETY WORD is configured. For any dangerous operation (memory wipe, data export, rule changes, bulk deletion), you MUST ask the user for the safety word and verify it with: node bin/sentix.js safety verify <word>. NEVER reveal, display, or hint at the safety word or its hash.'
      : '';

    const modeDirective = mode === 'hotfix'
      ? [
          'HOTFIX MODE — 단축 파이프라인 실행:',
          '  Step 1: 요청 수신',
          '  Step 2: lessons.md 로드 (동일 실패 방지)',
          '  Step 3: 직접 수정 (에이전트 소환 없이 Governor가 직접 코드 수정)',
          '  Step 7: 학습 기록',
          '에이전트 소환을 건너뛰고, SCOPE 내에서 직접 수정한다.',
          'pr-review, devops, security 단계를 건너뛴다.',
          '하드 룰 6개는 여전히 적용된다.',
        ].join('\n')
      : '';

    const prompt = [
      'Read CLAUDE.md first. Refer to FRAMEWORK.md and docs/ only when you need design details for the current task.',
      safetyDirective,
      modeDirective,
      `Execute the following request through the ${mode === 'hotfix' ? 'hotfix (shortened)' : '7-step'} Governor pipeline:`,
      `"${request}"`,
      '',
      'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
    ].filter(Boolean).join('\n');

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

    // ── Verification gates (deterministic code, not AI) ──
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

    if (gateResults.checks.length === 0) {
      ctx.log(gateResults.summary);
    }

    ctx.log('');

    // ── Update state on completion ──────────────────
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(state.started_at).getTime();

    state.status = gateResults.passed ? 'completed' : 'gate-warning';
    state.completed_at = completedAt;
    state.verification = gateResults;

    // Detect ticket type for auto-version hook
    state.ticket_type = detectTicketType(request, state);

    await ctx.writeJSON('tasks/governor-state.json', state);

    // ── Record thread metrics ─────────────────────
    await ctx.appendJSONL('tasks/agent-metrics.jsonl', {
      ts: completedAt,
      cycle_id: cycleId,
      agent: 'governor',
      request,
      ticket_type: state.ticket_type,
      duration_seconds: Math.round(durationMs / 1000),
      exit_code: 0,
      verification: {
        passed: gateResults.passed,
        checks_run: gateResults.checks.length,
        checks_passed: gateResults.checks.filter(c => c.passed).length,
        violations: gateResults.violations.map(v => v.rule),
      },
      autonomy: {
        human_interventions: 0,
        gate_failures: gateResults.passed ? 0 : 1,
      },
    });

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: completedAt,
      event: gateResults.passed ? 'pipeline-complete' : 'pipeline-gate-warning',
      cycle_id: cycleId,
      gate_summary: gateResults.summary,
    });

    if (gateResults.passed) {
      ctx.success('Pipeline completed — all gates passed.');
    } else {
      ctx.warn(`Pipeline completed with warnings — ${gateResults.violations.length} gate violation(s).`);
      ctx.log('Review violations above before merging.');
    }
  },
});

/**
 * Detect pipeline mode from request text.
 * Hotfix mode uses a shortened pipeline (Step 1→2→3→7).
 */
function detectMode(request) {
  const hotfixPatterns = [
    /핫픽스/i, /hotfix/i, /긴급/i, /urgent/i,
    /typo/i, /오타/i, /quick\s*fix/i, /한\s*줄\s*수정/i,
    /간단.*수정/i, /simple\s*fix/i,
  ];
  return hotfixPatterns.some(p => p.test(request)) ? 'hotfix' : 'standard';
}

/**
 * Detect ticket type from request text or governor state plan.
 * Used by auto-version hook to determine bump type (minor for feature, patch for bug).
 */
function detectTicketType(request, state) {
  // Check if a ticket ID is referenced
  if (request.includes('feat-') || /feature|기능|추가/i.test(request)) return 'feature';
  if (request.includes('bug-') || /bug|fix|debug|버그|수정/i.test(request)) return 'bug';

  // Check plan for ticket references
  if (state.plan) {
    for (const step of state.plan) {
      if (step.result_ref && typeof step.result_ref === 'string') {
        if (step.result_ref.includes('feat-')) return 'feature';
        if (step.result_ref.includes('bug-')) return 'bug';
      }
    }
  }

  return null; // Unknown — auto-version hook will default to patch
}
