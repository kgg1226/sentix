/**
 * pipeline.js — Framework mode 체인 파이프라인
 *
 * sentix run을 단일 Claude Code 호출이 아닌 multi-phase 체인으로 실행.
 * 각 phase 사이에 검증 게이트와 테스트를 실행하여 단계별 신뢰를 쌓는다.
 *
 * Phase 구조:
 *   1. PLAN — 티켓 생성 + 실행 계획
 *   2. DEV — 코드 구현 + 테스트 (complexity=high → dev-swarm 병렬)
 *   [gate: verify-gates + npm test]
 *   3. REVIEW — 자체 리뷰 + 수정 (실패 3회 → REPLAN 트리거)
 *   [gate: verify-gates]
 *   4. FINALIZE — 학습/README 업데이트
 *
 * 하위 모듈:
 *   - pipeline-worker.js   runPhase, spawnWorker
 *   - pipeline-swarm.js    runDevSwarm
 *   - pipeline-helpers.js  detectComplexity, parseSubtasks, getLatestTicket, contexts
 *   - pipeline-prompts.js  phase 별 prompt 생성
 */

import { spawnSync, execSync } from 'node:child_process';
import { runGates } from './verify-gates.js';
import { runQualityGate, formatQualityReport } from './quality-gate.js';
import { feedbackToConstraints } from './feedback-loop.js';
import { promoteRepeatedLessons } from './lesson-promoter.js';
import { runPhase } from './pipeline-worker.js';
import { runDevSwarm } from './pipeline-swarm.js';
import {
  detectComplexity,
  getLatestTicket,
  buildLearningContext,
  loadCrossProjectContext,
} from './pipeline-helpers.js';
import { loadConstraints } from './spec-enricher.js';
import { updatePatterns, generatePatternDirective } from '../plugins/pattern-engine.js';
import { analyzeRequest } from './spec-questions.js';
import { runMultiGen } from './multi-gen.js';
import { loadProviderConfig, runCrossReview, getCrossReviewProvider } from './cross-review.js';
import {
  buildPlanPrompt,
  buildDevPrompt,
  buildReviewPrompt,
  buildReplanPrompt,
  buildFinalizePrompt,
} from './pipeline-prompts.js';

const MAX_REVIEW_RETRIES = 3;

/**
 * 체인 파이프라인 실행 (Framework mode)
 */
export async function runChainedPipeline(request, cycleId, state, ctx, options = {}) {
  const phases = [];
  const startTime = Date.now();

  // ── 요청 복잡도 판별 → 컨텍스트 로딩 수준 결정 ────
  const requestWords = request.split(/\s+/).filter(Boolean).length;
  const isSimple = requestWords <= 10 || /hotfix|typo|오타|한 줄|quick|간단/i.test(request);
  if (isSimple) ctx.log('  [lightweight] 간단한 요청 — 컨텍스트 경량 로딩');

  // 컨텍스트 수집 (복잡도에 따라 선택적 로딩)
  const lessons = !isSimple && ctx.exists('tasks/lessons.md') ? await ctx.readFile('tasks/lessons.md') : '';
  const patterns = !isSimple && ctx.exists('tasks/patterns.md') ? await ctx.readFile('tasks/patterns.md') : '';

  const methodsDirective = '';
  const learningContext = buildLearningContext(lessons, patterns);
  const crossProjectContext = !isSimple ? loadCrossProjectContext(ctx.cwd) : '';

  // Spec Enricher: constraints는 항상 로드 (핵심 보호)
  let constraintsContext = '';
  try {
    const constraints = loadConstraints(ctx.cwd);
    constraintsContext = constraints.constraintsContext;
    if (constraints.constraintCount > 0) {
      ctx.success(`Loaded ${constraints.constraintCount} constraint(s)`);
    }
  } catch (e) {
    ctx.warn(`Constraints loading failed (safe skip): ${e.message}`);
  }

  // Spec Questions: 간단한 요청이면 스킵
  let specDirective = '';
  if (!isSimple) {
    try {
      const specAnalysis = analyzeRequest(request);
      specDirective = specAnalysis.specDirective;
      if (specAnalysis.questions.length > 0) {
        ctx.success(`Spec analysis: ${specAnalysis.questions.length} question(s) for planner (type: ${specAnalysis.requestType})`);
      }
    } catch (e) {
      ctx.warn(`Spec analysis failed (safe skip): ${e.message}`);
    }
  }

  // Pattern Directives: 간단한 요청이면 스킵
  let patternDirective = '';
  if (!isSimple) {
    try {
      patternDirective = generatePatternDirective(ctx.cwd, request);
      if (patternDirective) {
        ctx.success('Pattern directives generated from usage history');
      }
    } catch (e) {
      ctx.warn(`Pattern directive generation failed (safe skip): ${e.message}`);
    }
  }

  const promptCtx = {
    request,
    safetyDirective: options.safetyDirective,
    methodsDirective,
    learningContext,
    crossProjectContext,
    constraintsContext,
    specDirective,
    patternDirective,
  };

  // ── Phase 1: PLAN (간단한 요청이면 스킵) ─────────────
  if (isSimple && !options.forcePlan) {
    ctx.log('=== Phase 1: PLAN (skipped — simple request) ===\n');
    phases.push({ name: 'plan-skipped', success: true, error: null, exit_code: 0, output: null });
  } else {
    ctx.log('=== Phase 1: PLAN ===\n');
    state.current_phase = 'plan';
    await ctx.writeJSON('tasks/governor-state.json', state);

    const planResult = runPhase('plan', buildPlanPrompt(promptCtx), ctx);
    phases.push({ name: 'plan', ...planResult });
    if (!planResult.success) {
      return { success: false, phases, failedAt: 'plan' };
    }
  }

  // ── 복잡도 감지: 병렬 or 순차 결정 ────────────────
  const latestTicket = await getLatestTicket(ctx);
  const complexity = detectComplexity(latestTicket);

  // ── Phase 2: DEV ──────────────────────────────────
  let devResult;
  const useMultiGen = options.multiGen === true;

  if (complexity === 'high' && latestTicket) {
    ctx.log('\n=== Phase 2: DEV-SWARM (parallel) ===\n');
    state.current_phase = 'dev-swarm';
    await ctx.writeJSON('tasks/governor-state.json', state);
    devResult = await runDevSwarm(request, latestTicket, methodsDirective, learningContext, options, ctx, constraintsContext, patternDirective);
  } else if (useMultiGen) {
    ctx.log('\n=== Phase 2: DEV (multi-gen) ===\n');
    state.current_phase = 'dev-multi-gen';
    await ctx.writeJSON('tasks/governor-state.json', state);

    const devPrompt = buildDevPrompt({ ...promptCtx, latestTicket });
    let multiGenResult;
    try {
      multiGenResult = runMultiGen(devPrompt, ctx, { count: options.multiGenCount || 3 });
    } catch (e) {
      ctx.warn(`Multi-gen failed (falling back to single dev): ${e.message}`);
      multiGenResult = { fallback: true };
    }

    if (multiGenResult.fallback) {
      // git 없는 환경 또는 multi-gen 실패 → 단일 생성으로 fallback
      devResult = runPhase('dev', devPrompt, ctx);
    } else if (multiGenResult.applied && multiGenResult.bestIndex >= 0) {
      devResult = {
        success: true,
        error: null,
        exit_code: 0,
        output: { multiGen: multiGenResult },
      };
    } else {
      // 모든 생성 실패 → 단일 dev로 최후 fallback
      ctx.warn('Multi-gen: all generations failed — falling back to single dev');
      devResult = runPhase('dev', devPrompt, ctx);
    }
  } else {
    ctx.log('\n=== Phase 2: DEV ===\n');
    state.current_phase = 'dev';
    await ctx.writeJSON('tasks/governor-state.json', state);
    devResult = runPhase('dev', buildDevPrompt({ ...promptCtx, latestTicket }), ctx);
  }

  const devPhaseName = useMultiGen ? 'dev-multi-gen' : (complexity === 'high' ? 'dev-swarm' : 'dev');
  phases.push({ name: devPhaseName, ...devResult });
  if (!devResult.success) {
    return { success: false, phases, failedAt: 'dev' };
  }

  // ── Mid-pipeline gate: test + verify ──────────────
  const { testResult, midGateInfo } = runMidGate(ctx);

  // ── Diff 요약 생성 (REVIEW 토큰 절감) ─────────────
  let diffSummary = '';
  try {
    const diffStat = execSync('git diff --stat HEAD 2>/dev/null || git diff --stat', {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10_000,
    }).trim();
    const diffNumstat = execSync('git diff --numstat HEAD 2>/dev/null || git diff --numstat', {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10_000,
    }).trim();
    diffSummary = `--- DIFF SUMMARY (DO NOT run git diff yourself — use this summary) ---\n${diffStat}\n\nDetailed:\n${diffNumstat}\n--- END DIFF SUMMARY ---`;
  } catch { /* ignore */ }

  // ── Phase 3: REVIEW (재시도 + 재계획 트리거) ────────
  let reviewOutcome = { needsReplan: false };
  const shouldSkipReview = options.skipReview || (isSimple && !options.forceReview);
  if (shouldSkipReview) {
    const reason = options.skipReview ? '--skip-review' : 'simple request';
    ctx.log(`\n=== Phase 3: REVIEW (skipped — ${reason}) ===\n`);
    phases.push({ name: 'review-skipped', success: true, error: null, exit_code: 0, output: null });
  } else {
    reviewOutcome = await runReviewPhase({
      ctx, state, phases, testResult, midGateInfo, diffSummary,
      methodsDirective, learningContext,
    });
  }

  if (reviewOutcome.needsReplan) {
    const replanResult = await runReplanPhase({
      ctx, state, phases, promptCtx,
    });
    if (replanResult && !replanResult.success) {
      return replanResult;
    }
  }

  // ── Cross-review (이종 모델, opt-in) ───────────────
  if (options.crossReview) {
    try {
      const providerName = typeof options.crossReview === 'string'
        ? options.crossReview
        : (getCrossReviewProvider(ctx.cwd) || 'openai');

      ctx.log(`\n=== Cross-Review: ${providerName} ===\n`);
      const providerConfig = loadProviderConfig(ctx.cwd, providerName);

      if (providerConfig) {
        const diff = execSync('git diff HEAD', { cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10_000 });

        if (!diff.trim()) {
          ctx.warn('Cross-review skipped: no diff to review');
        } else {
          const crossResult = await runCrossReview(diff, 'Review this code change for issues.', providerConfig);
          if (crossResult.success) {
            ctx.success(`Cross-review by ${crossResult.model}: completed`);
            ctx.log(crossResult.review.slice(0, 2000));
            phases.push({ name: `cross-review-${providerName}`, success: true, output: { review: crossResult.review } });
          } else {
            ctx.warn(`Cross-review skipped: ${crossResult.error}`);
          }
        }
      } else {
        ctx.warn(`Cross-review: provider "${providerName}" not configured`);
      }
    } catch (e) {
      ctx.warn(`Cross-review failed (safe skip): ${e.message}`);
    }
  }

  // ── Phase 4: FINALIZE (코드로 직접 실행 — Claude 소환 불필요) ──
  ctx.log('\n=== Phase 4: FINALIZE ===\n');
  state.current_phase = 'finalize';
  await ctx.writeJSON('tasks/governor-state.json', state);

  // FINALIZE 작업을 코드로 직접 수행 (토큰 ~6,000 절감)
  try {
    // 1. 학습 기록은 이미 feedback-loop + lesson-promoter가 처리
    // 2. git commit은 run.js의 post-pipeline에서 처리
    // 3. dev가 보호 파일을 정식 수정했다면 integrity snapshot 갱신
    //    (다음 세션 시작 시 integrity-guard 가 원복하지 않도록)
    try {
      const { snapshotIntegrity } = await import('./integrity-guard.js');
      snapshotIntegrity(ctx.cwd);
    } catch { /* snapshot 실패는 치명적 아님 */ }
    ctx.success('Phase finalize completed (code-based, no Claude spawn)');
  } catch (e) {
    ctx.warn(`Finalize warning: ${e.message}`);
  }
  phases.push({ name: 'finalize', success: true, error: null, exit_code: 0, output: null });

  // ── Auto-promote repeated lessons to rules ─────────
  try {
    const promoted = promoteRepeatedLessons(ctx.cwd);
    if (promoted.length > 0) {
      ctx.success(`Auto-promoted ${promoted.length} lesson pattern(s) to .claude/rules/`);
      for (const p of promoted) {
        ctx.log(`  → ${p.path} (${p.keyword}, ${p.count}x)`);
      }
    }
  } catch (e) {
    ctx.warn(`Lesson promotion skipped: ${e.message}`);
  }

  // ── Pattern analysis ───────────────────────────────
  try {
    const patternResult = updatePatterns(ctx.cwd);
    if (patternResult.updated) {
      ctx.success(`Pattern analysis: ${patternResult.patternsFound} pattern(s) → tasks/patterns.md`);
    }
  } catch (e) {
    ctx.warn(`Pattern analysis skipped: ${e.message}`);
  }

  // ── Token usage summary ────────────────────────────
  let totalIn = 0, totalOut = 0;
  for (const phase of phases) {
    const usage = phase.output?.usage || {};
    totalIn += usage.input_tokens || 0;
    totalOut += usage.output_tokens || 0;
  }
  if (totalIn > 0 || totalOut > 0) {
    ctx.log(`\n=== Token Usage ===`);
    ctx.log(`  Input:  ${totalIn.toLocaleString()} tokens`);
    ctx.log(`  Output: ${totalOut.toLocaleString()} tokens`);
    ctx.log(`  Total:  ${(totalIn + totalOut).toLocaleString()} tokens`);
    ctx.log('');
  }

  // ── Final gate ────────────────────────────────────
  const finalGate = runGates(ctx.cwd);

  return {
    success: true,
    phases,
    gateResults: finalGate,
    duration_seconds: Math.round((Date.now() - startTime) / 1000),
    test_passed: testResult.status === 0,
    token_usage: { input: totalIn, output: totalOut, total: totalIn + totalOut },
  };
}

// ── 중간 게이트: npm test + verify-gates ──────────────────

function runMidGate(ctx) {
  ctx.log('\n=== Gate: Post-DEV Verification ===\n');

  const testResult = spawnSync('npm', ['test'], {
    cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 60_000,
  });

  if (testResult.status === 0) {
    ctx.success('Tests passed');
  } else {
    ctx.warn('Tests failed — REVIEW phase will address this');
    ctx.log(testResult.stdout?.slice(-500) || '');
  }

  // Hard-rule gates (SCOPE, export, test deletion, net deletion)
  const midGate = runGates(ctx.cwd);
  const delegationHints = [];
  for (const check of midGate.checks) {
    if (check.passed) {
      ctx.success(`[${check.rule}] ${check.detail}`);
    } else {
      ctx.warn(`[${check.rule}] ${check.detail}`);
      // 위반 유형별 위임 힌트 생성
      if (check.rule === 'scope') {
        delegationHints.push('SCOPE violation detected → REVIEW must request planner to expand SCOPE or reject');
      } else if (check.rule === 'no-export-deletion') {
        delegationHints.push('Export deletion detected → REVIEW must request dev-fix to restore exports');
      } else if (check.rule === 'no-test-deletion') {
        delegationHints.push('Test deletion detected → REVIEW must request dev-fix to restore tests');
      } else if (check.rule === 'net-deletion-limit') {
        delegationHints.push('Net deletion limit exceeded → REVIEW must request refactoring split');
      }
    }
  }
  if (delegationHints.length > 0) {
    ctx.log(`\n  Delegation hints for REVIEW: ${delegationHints.length}`);
    for (const hint of delegationHints) ctx.log(`    → ${hint}`);
  }

  // Quality gate (banned patterns, debug artifacts, syntax, audit, regression)
  const qualityGate = runQualityGate(ctx.cwd, { skipAudit: false });
  ctx.log(formatQualityReport(qualityGate));

  for (const check of qualityGate.checks) {
    if (check.passed) {
      ctx.success(`[quality:${check.name}] ${check.detail}`);
    } else {
      ctx.warn(`[quality:${check.name}] ${check.detail}`);
    }
  }

  // Feedback loop: 실패 패턴 → constraints.md 자동 추가
  if (!qualityGate.passed) {
    try {
      const feedback = feedbackToConstraints(ctx.cwd, qualityGate);
      if (feedback.added.length > 0) {
        ctx.success(`Feedback loop: ${feedback.added.length} pattern(s) added to .sentix/constraints.md`);
        for (const entry of feedback.added) {
          ctx.log(`  → ${entry}`);
        }
      }
    } catch (e) {
      ctx.warn(`Feedback loop skipped: ${e.message}`);
    }
  }

  const midGateInfo = buildMidGateInfo(midGate, qualityGate, delegationHints);

  return { testResult, midGateInfo };
}

function buildMidGateInfo(midGate, qualityGate, delegationHints = []) {
  const parts = [];

  if (midGate.passed && qualityGate.passed) {
    return 'All verification gates and quality checks passed.';
  }

  if (!midGate.passed) {
    parts.push(`Hard-rule violations: ${midGate.violations.map((v) => v.message).join('; ')}`);
  }

  if (!qualityGate.passed) {
    const errors = qualityGate.checks
      .flatMap((c) => c.issues)
      .filter((i) => i.severity === 'error');
    parts.push(`Quality issues (${errors.length} error(s)): ${errors.map((e) => e.message).join('; ')}`);
  }

  if (delegationHints.length > 0) {
    parts.push(`Delegation: ${delegationHints.join('; ')}`);
  }

  return parts.join(' | ');
}

// ── Review phase (재시도 + NEEDS_REPLAN 감지) ─────────────

async function runReviewPhase({ ctx, state, phases, testResult, midGateInfo, methodsDirective, learningContext, diffSummary }) {
  ctx.log('\n=== Phase 3: REVIEW ===\n');
  state.current_phase = 'review';
  await ctx.writeJSON('tasks/governor-state.json', state);

  let reviewResult = null;
  let attempt = 0;
  let needsReplan = false;

  while (attempt < MAX_REVIEW_RETRIES) {
    attempt++;
    ctx.log(`Review attempt ${attempt}/${MAX_REVIEW_RETRIES}`);

    reviewResult = runPhase('review', buildReviewPrompt({
      testPassed: testResult.status === 0,
      midGateInfo,
      attempt,
      maxAttempts: MAX_REVIEW_RETRIES,
      methodsDirective,
      learningContext,
      diffSummary,
    }), ctx);

    phases.push({ name: `review-${attempt}`, ...reviewResult });

    if (reviewResult.success) {
      const output = reviewResult.output?.content || '';
      if (output.includes('NEEDS_REPLAN')) {
        needsReplan = true;
        ctx.warn('Review requested re-planning');
      }
      break;
    }

    if (attempt >= MAX_REVIEW_RETRIES) {
      ctx.warn(`Review failed ${MAX_REVIEW_RETRIES} times — triggering re-plan`);
      needsReplan = true;
    }
  }

  return { needsReplan, reviewResult };
}

// ── Re-plan phase ("Stop and re-plan") ───────────────────

async function runReplanPhase({ ctx, state, phases, promptCtx }) {
  ctx.log('\n=== Re-Plan Triggered ===\n');
  state.current_phase = 'replan';
  state.retries = state.retries || {};
  state.retries.replan = (state.retries.replan || 0) + 1;
  await ctx.writeJSON('tasks/governor-state.json', state);

  if (state.retries.replan > 1) {
    ctx.error('Re-plan loop detected — escalating to human');
    state.human_intervention_requested = true;
    await ctx.writeJSON('tasks/governor-state.json', state);
    return { success: false, phases, failedAt: 'replan-loop', needsHuman: true };
  }

  const replanResult = runPhase('plan', buildReplanPrompt(promptCtx), ctx);
  phases.push({ name: 'replan', ...replanResult });

  if (!replanResult.success) {
    return { success: false, phases, failedAt: 'replan' };
  }

  ctx.warn('Re-plan completed. Pipeline will finalize with new plan — run again to execute.');
  return null;
}
