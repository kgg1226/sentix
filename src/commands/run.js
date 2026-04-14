/**
 * sentix run "요청" — Governor 파이프라인 실행
 *
 * Claude Code를 spawn으로 안전하게 호출하고, governor-state.json 기록,
 * pattern-log.jsonl 기록. 출력 카드는 src/lib/run-render.js 참조.
 */

import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { registerCommand } from '../registry.js';
import { runGates, runPreGates } from '../lib/verify-gates.js';
import { detectDangerousRequest, verifyWord, isConfigured } from '../lib/safety.js';
import { runChainedPipeline } from '../lib/pipeline.js';
import { enrichRequestInteractively } from '../lib/interactive-spec.js';
import {
  renderStartBanner,
  renderModeLine,
  renderSafety,
  renderPreflightError,
  renderGateCard,
  renderCompletionBanner,
  renderFailureBanner,
} from '../lib/run-render.js';

registerCommand('run', {
  description: 'Run a request through the Governor pipeline',
  usage: 'sentix run "요청 내용"',

  async run(args, ctx) {
    const request = stripFlags(args).join(' ').trim();

    if (!request) {
      renderPreflightError(ctx, 'empty-request');
      return;
    }

    if (!ctx.exists('CLAUDE.md')) {
      renderPreflightError(ctx, 'no-claude-md');
      return;
    }

    // ── 인터랙티브 입력 구체화 ──────────────────────
    const skipInteractive = args.includes('--yes') || args.includes('-y');
    let enrichedRequest;
    try {
      enrichedRequest = await enrichRequestInteractively(request, ctx, { skipInteractive });
    } catch {
      enrichedRequest = request; // 인터랙티브 실패 시 원본 사용
    }

    // ── Safety word gate ───────────────────────────
    const safetyResult = await handleSafetyGate(enrichedRequest, args, ctx);
    if (safetyResult === 'denied' || safetyResult === 'needs-word') return;

    // ── Preflight: Claude Code + 동시 실행 검사 ────
    const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claudeCheck.error) {
      renderPreflightError(ctx, 'no-claude-cli');
      return;
    }

    // ── Check for concurrent execution ──────────────
    if (ctx.exists('tasks/governor-state.json')) {
      try {
        const existing = await ctx.readJSON('tasks/governor-state.json');
        if (existing.status === 'in_progress') {
          renderPreflightError(ctx, 'concurrent', { cycleId: existing.cycle_id });
          return;
        }
      } catch { /* malformed — safe to overwrite */ }
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

    // ── Pre-gate 자동 해결 ──────────────────────────
    // 테스트 스냅샷 없으면 자동 생성 (npm test 실행)
    const snapshotCheck = preGateResults.checks.find(c => c.rule === 'test-snapshot');
    if (snapshotCheck && !snapshotCheck.passed) {
      ctx.log('  → 테스트 스냅샷 자동 생성 중...');
      try {
        const testRun = spawnSync('npm', ['test'], {
          cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 60_000,
        });
        if (testRun.stdout) {
          const snapshotPath = resolve(ctx.cwd, 'tasks/.pre-fix-test-results.json');
          mkdirSync(resolve(ctx.cwd, 'tasks'), { recursive: true });
          writeFileSync(snapshotPath, testRun.stdout);
          ctx.success('  → 테스트 스냅샷 자동 생성 완료');
        }
      } catch { /* 테스트 없으면 스킵 */ }
    }
    // 티켓 없음은 planner가 자동 생성 (프롬프트에 포함)

    ctx.log('');

    // ── Create governor state ───────────────────────
    const cycleId = `cycle-${new Date().toISOString().slice(0, 10)}-${String(Date.now()).slice(-3)}`;
    const state = {
      schema_version: 1,
      cycle_id: cycleId,
      request: enrichedRequest,
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
    renderStartBanner(ctx, { cycleId, request: enrichedRequest, mode });

    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'request',
      input: enrichedRequest,
      cycle_id: cycleId,
      mode,
    });

    // ── Determine pipeline mode ───────────────────
    const useChained = args.includes('--chained') || args.includes('-c');
    const useLegacy = args.includes('--single');

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

    let pipelineResult;

    if (mode === 'hotfix') {
      // ── Hotfix: single-shot, Governor 직접 수정 (main ec1f0a8) ──────
      renderModeLine(ctx, 'hotfix');

      const prompt = [
        'Read CLAUDE.md first. Refer to FRAMEWORK.md and docs/ only when you need design details for the current task.',
        safetyDirective,
        modeDirective,
        `Execute the following request through the hotfix (shortened) Governor pipeline:`,
        `"${enrichedRequest}"`,
        '',
        'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
      ].filter(Boolean).join('\n');

      const result = spawnSync('claude', ['-p', prompt], {
        cwd: ctx.cwd,
        stdio: 'inherit',
        timeout: 600_000,
        env: { ...process.env, SENTIX_PIPELINE: 'true' },
      });

      if (result.error || result.status !== 0) {
        const error = result.error?.message || `Exit code ${result.status}`;
        state.status = 'failed';
        state.error = error;
        await ctx.writeJSON('tasks/governor-state.json', state);
        await ctx.appendJSONL('tasks/pattern-log.jsonl', {
          ts: new Date().toISOString(),
          event: 'pipeline-failed',
          cycle_id: cycleId,
          error,
        });
        ctx.error(`Pipeline failed: ${error}`);
        return;
      }

      pipelineResult = {
        success: true,
        gateResults: runGates(ctx.cwd),
        duration_seconds: Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000),
        phases: [{ name: 'hotfix', success: true }],
      };
    } else if (useChained || (!useLegacy && !args.includes('--single'))) {
      renderModeLine(ctx, 'chained');
      const multiGen = args.includes('--multi-gen') || args.includes('-mg');
      const multiGenCount = (() => {
        const idx = args.indexOf('--gen-count');
        return idx !== -1 ? parseInt(args[idx + 1]) || 3 : 3;
      })();
      const crossReviewIdx = args.indexOf('--cross-review');
      const crossReview = crossReviewIdx !== -1
        ? (args[crossReviewIdx + 1] && !args[crossReviewIdx + 1].startsWith('-') ? args[crossReviewIdx + 1] : true)
        : false;
      const skipReview = args.includes('--skip-review');
      const chainResult = await runChainedPipeline(enrichedRequest, cycleId, state, ctx, {
        safetyDirective,
        multiGen,
        multiGenCount,
        crossReview,
        skipReview,
      });
      pipelineResult = {
        success: chainResult.success,
        gateResults: chainResult.gateResults || runGates(ctx.cwd),
        duration_seconds: chainResult.duration_seconds,
        phases: chainResult.phases,
        test_passed: chainResult.test_passed,
        failedAt: chainResult.failedAt,
      };
    } else {
      renderModeLine(ctx, 'single');
      const prompt = [
        'Read CLAUDE.md first. Refer to FRAMEWORK.md and docs/ only when you need design details for the current task.',
        safetyDirective,
        'Execute the following request through the Governor pipeline:',
        `"${enrichedRequest}"`,
        '',
        'Follow the SOP exactly. Update tasks/governor-state.json at each phase.',
      ].filter(Boolean).join('\n');

      const result = spawnSync('claude', ['-p', prompt], {
        cwd: ctx.cwd,
        stdio: 'inherit',
        timeout: 600_000,
        env: { ...process.env, SENTIX_PIPELINE: 'true' },
      });

      if (result.error || result.status !== 0) {
        const error = result.error?.message || `Exit code ${result.status}`;
        state.status = 'failed';
        state.error = error;
        await ctx.writeJSON('tasks/governor-state.json', state);
        await ctx.appendJSONL('tasks/pattern-log.jsonl', {
          ts: new Date().toISOString(),
          event: 'pipeline-failed',
          cycle_id: cycleId,
          error,
        });
        ctx.error(`Pipeline failed: ${error}`);
        return;
      }

      pipelineResult = {
        success: true,
        gateResults: runGates(ctx.cwd),
        duration_seconds: Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000),
        phases: [{ name: 'single', success: true }],
      };
    }

    // ── Post-pipeline (공통) ────────────────────────
    if (!pipelineResult.success) {
      state.status = 'failed';
      state.error = `Failed at phase: ${pipelineResult.failedAt}`;
      state.completed_at = new Date().toISOString();
      await ctx.writeJSON('tasks/governor-state.json', state);
      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'pipeline-failed',
        cycle_id: cycleId,
        error: state.error,
      });
      renderFailureBanner(ctx, pipelineResult.failedAt);
      process.exitCode = 1;
      return;
    }

    // ── Final verification gates ────────────────────
    const gateResults = pipelineResult.gateResults;
    renderGateCard(ctx, gateResults);

    // ── Update state on completion ──────────────────
    const completedAt = new Date().toISOString();
    state.status = gateResults.passed ? 'completed' : 'gate-warning';
    state.completed_at = completedAt;
    state.verification = gateResults;
    state.pipeline_mode = pipelineResult.phases.length > 1 ? 'chained' : 'single';
    state.phases = pipelineResult.phases.map((p) => ({ name: p.name, success: p.success }));
    state.ticket_type = detectTicketType(request, state);

    await ctx.writeJSON('tasks/governor-state.json', state);

    // ── Record thread metrics ─────────────────────
    await ctx.appendJSONL('tasks/agent-metrics.jsonl', {
      ts: completedAt,
      cycle_id: cycleId,
      agent: 'governor',
      request,
      ticket_type: state.ticket_type,
      pipeline_mode: state.pipeline_mode,
      phases_total: pipelineResult.phases.length,
      phases_passed: pipelineResult.phases.filter((p) => p.success).length,
      duration_seconds: pipelineResult.duration_seconds,
      test_passed: pipelineResult.test_passed ?? null,
      verification: {
        passed: gateResults.passed,
        checks_run: gateResults.checks.length,
        checks_passed: gateResults.checks.filter((c) => c.passed).length,
        violations: gateResults.violations.map((v) => v.rule),
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
      pipeline_mode: state.pipeline_mode,
      gate_summary: gateResults.summary,
    });

    renderCompletionBanner(ctx, {
      passed: gateResults.passed,
      violationCount: gateResults.violations.length,
      duration: pipelineResult.duration_seconds,
    });
  },
});

/**
 * Safety word 처리: 위험 요청 감지 → 안전어 검증/차단/경고.
 * @returns {'ok' | 'denied' | 'needs-word' | 'warn-no-safety'}
 *   'ok': safe, proceed
 *   'denied': user input failed verification — caller should return
 *   'needs-word': dangerous but no --safety-word flag — caller should return
 *   'warn-no-safety': dangerous but no safety configured — proceed with warning
 */
async function handleSafetyGate(request, args, ctx) {
  const dangerMatch = detectDangerousRequest(request);
  if (!dangerMatch) return 'ok';

  const hasSafety = await isConfigured(ctx);

  if (!hasSafety) {
    renderSafety(ctx, 'no-safety-word', { pattern: dangerMatch });
    return 'ok'; // proceed with warning
  }

  const swIdx = args.indexOf('--safety-word');
  const safetyInput = swIdx !== -1 ? args[swIdx + 1] : null;

  if (!safetyInput) {
    renderSafety(ctx, 'needs-word', { pattern: dangerMatch });
    return 'needs-word';
  }

  const verified = await verifyWord(ctx, safetyInput);
  if (!verified) {
    renderSafety(ctx, 'denied');
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'safety-denied',
      input: enrichedRequest,
      pattern: dangerMatch,
    });
    return 'denied';
  }

  renderSafety(ctx, 'verified');
  return 'ok';
}

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
 * Used by auto-version hook to determine bump type.
 */
function detectTicketType(request, state) {
  if (request.includes('feat-') || /feature|기능|추가/i.test(request)) return 'feature';
  if (request.includes('bug-') || /bug|fix|debug|버그|수정/i.test(request)) return 'bug';

  if (state.plan) {
    for (const step of state.plan) {
      if (step.result_ref && typeof step.result_ref === 'string') {
        if (step.result_ref.includes('feat-')) return 'feature';
        if (step.result_ref.includes('bug-')) return 'bug';
      }
    }
  }

  return null;
}

/**
 * CLI 플래그를 args에서 제거하고 순수 요청 텍스트만 반환한다.
 * 플래그: --flag, -shortflag, 그리고 값이 따라오는 플래그 (--gen-count 3)
 */
const FLAGS_WITH_VALUE = new Set(['--gen-count', '--safety-word']);

function stripFlags(args) {
  const result = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--') || arg === '-c' || arg === '-mg' || arg === '-y') {
      // 값이 따라오는 플래그면 다음 인자도 스킵
      if (FLAGS_WITH_VALUE.has(arg)) {
        i++;
      } else if (arg === '--cross-review') {
        // --cross-review 뒤에 provider 이름이 올 수도 있음 (플래그가 아닌 경우만)
        const next = args[i + 1];
        if (next && !next.startsWith('-')) i++;
      }
      continue;
    }
    result.push(arg);
  }
  return result;
}
