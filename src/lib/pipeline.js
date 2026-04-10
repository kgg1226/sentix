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

  // 컨텍스트 수집
  const lessons = ctx.exists('tasks/lessons.md') ? await ctx.readFile('tasks/lessons.md') : '';
  const patterns = ctx.exists('tasks/patterns.md') ? await ctx.readFile('tasks/patterns.md') : '';
  const agentMethods = ctx.exists('docs/agent-methods.md') ? await ctx.readFile('docs/agent-methods.md') : '';

  const methodsDirective = agentMethods.trim()
    ? `\n--- agent-methods.md (MANDATORY — follow method order strictly) ---\n${agentMethods}`
    : '';
  const learningContext = buildLearningContext(lessons, patterns);
  const crossProjectContext = loadCrossProjectContext(ctx.cwd);

  // Spec Enricher: 프로젝트 제약 + 학습 패턴 로드
  let constraintsContext = '';
  try {
    const constraints = loadConstraints(ctx.cwd);
    constraintsContext = constraints.constraintsContext;
    if (constraints.constraintCount > 0) {
      ctx.success(`Loaded ${constraints.constraintCount} constraint(s) from .sentix/constraints.md + lessons.md`);
    }
  } catch (e) {
    ctx.warn(`Constraints loading failed (safe skip): ${e.message}`);
  }

  // Spec Questions: 요청 분석 → 누락 정보 질문 생성
  let specDirective = '';
  try {
    const specAnalysis = analyzeRequest(request);
    specDirective = specAnalysis.specDirective;
    if (specAnalysis.questions.length > 0) {
      ctx.success(`Spec analysis: ${specAnalysis.questions.length} question(s) for planner (type: ${specAnalysis.requestType})`);
    }
  } catch (e) {
    ctx.warn(`Spec analysis failed (safe skip): ${e.message}`);
  }

  const promptCtx = {
    request,
    safetyDirective: options.safetyDirective,
    methodsDirective,
    learningContext,
    crossProjectContext,
    constraintsContext,
    specDirective,
  };

  // ── Phase 1: PLAN ─────────────────────────────────
  ctx.log('=== Phase 1: PLAN ===\n');
  state.current_phase = 'plan';
  await ctx.writeJSON('tasks/governor-state.json', state);

  const planResult = runPhase('plan', buildPlanPrompt(promptCtx), ctx);
  phases.push({ name: 'plan', ...planResult });
  if (!planResult.success) {
    return { success: false, phases, failedAt: 'plan' };
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
    devResult = await runDevSwarm(request, latestTicket, methodsDirective, learningContext, options, ctx, constraintsContext);
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

  // ── Phase 3: REVIEW (재시도 + 재계획 트리거) ────────
  const reviewOutcome = await runReviewPhase({
    ctx, state, phases, testResult, midGateInfo,
    methodsDirective, learningContext,
  });

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

  // ── Phase 4: FINALIZE ─────────────────────────────
  ctx.log('\n=== Phase 4: FINALIZE ===\n');
  state.current_phase = 'finalize';
  await ctx.writeJSON('tasks/governor-state.json', state);

  const finalResult = runPhase('finalize', buildFinalizePrompt(), ctx);
  phases.push({ name: 'finalize', ...finalResult });

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

  // ── Final gate ────────────────────────────────────
  const finalGate = runGates(ctx.cwd);

  return {
    success: true,
    phases,
    gateResults: finalGate,
    duration_seconds: Math.round((Date.now() - startTime) / 1000),
    test_passed: testResult.status === 0,
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
  for (const check of midGate.checks) {
    if (check.passed) {
      ctx.success(`[${check.rule}] ${check.detail}`);
    } else {
      ctx.warn(`[${check.rule}] ${check.detail}`);
    }
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

  const midGateInfo = buildMidGateInfo(midGate, qualityGate);

  return { testResult, midGateInfo };
}

function buildMidGateInfo(midGate, qualityGate) {
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

  return parts.join(' | ');
}

// ── Review phase (재시도 + NEEDS_REPLAN 감지) ─────────────

async function runReviewPhase({ ctx, state, phases, testResult, midGateInfo, methodsDirective, learningContext }) {
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
