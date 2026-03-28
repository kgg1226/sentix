/**
 * pipeline.js — Framework mode 체인 파이프라인
 *
 * sentix run을 단일 Claude Code 호출이 아닌 multi-phase 체인으로 실행.
 * 각 phase 사이에 검증 게이트와 테스트를 실행하여 단계별 신뢰를 쌓는다.
 *
 * Phase 구조:
 *   1. PLAN — 티켓 생성 + 실행 계획
 *   2. DEV — 코드 구현 + 테스트 작성
 *   [gate: verify-gates + npm test]
 *   3. REVIEW — 자체 리뷰 + 수정
 *   [gate: verify-gates]
 *   4. FINALIZE — 버전/학습/README 업데이트
 */

import { spawnSync } from 'node:child_process';
import { runGates } from './verify-gates.js';

/**
 * 체인 파이프라인 실행 (Framework mode)
 * @param {string} request - 사용자 요청
 * @param {string} cycleId - 사이클 ID
 * @param {object} state - governor-state.json
 * @param {object} ctx - sentix context
 * @param {object} options - { safetyDirective }
 * @returns {object} { success, phases, gateResults }
 */
export async function runChainedPipeline(request, cycleId, state, ctx, options = {}) {
  const phases = [];
  const startTime = Date.now();

  // lessons.md, patterns.md 로드 (있으면)
  const lessons = ctx.exists('tasks/lessons.md')
    ? await ctx.readFile('tasks/lessons.md')
    : '';
  const patterns = ctx.exists('tasks/patterns.md')
    ? await ctx.readFile('tasks/patterns.md')
    : '';

  const learningContext = [
    lessons.trim() ? `\n--- lessons.md ---\n${lessons.slice(0, 2000)}` : '',
    patterns.trim() ? `\n--- patterns.md ---\n${patterns.slice(0, 1000)}` : '',
  ].filter(Boolean).join('\n');

  // ── Phase 1: PLAN ─────────────────────────────────
  ctx.log('=== Phase 1: PLAN ===\n');
  state.current_phase = 'plan';
  await ctx.writeJSON('tasks/governor-state.json', state);

  const planResult = runPhase('plan', [
    'Read CLAUDE.md first.',
    options.safetyDirective || '',
    'You are the PLANNER agent. Your ONLY job is:',
    `1. Analyze this request: "${request}"`,
    '2. Create a ticket in tasks/tickets/ using: node bin/sentix.js ticket create "..." or node bin/sentix.js feature add "..."',
    '3. List the specific files that need to be changed (SCOPE)',
    '4. Estimate complexity (low/medium/high)',
    '5. DO NOT write any code. ONLY plan.',
    learningContext,
  ].filter(Boolean).join('\n'), ctx);

  phases.push({ name: 'plan', ...planResult });
  if (!planResult.success) {
    return { success: false, phases, failedAt: 'plan' };
  }

  // ── Phase 2: DEV ──────────────────────────────────
  ctx.log('\n=== Phase 2: DEV ===\n');
  state.current_phase = 'dev';
  await ctx.writeJSON('tasks/governor-state.json', state);

  // 가장 최근 티켓 찾기 (planner가 방금 생성한 것)
  const latestTicket = await getLatestTicket(ctx);

  const devResult = runPhase('dev', [
    'Read CLAUDE.md first.',
    options.safetyDirective || '',
    'You are the DEV agent. Your job:',
    latestTicket ? `Ticket:\n${latestTicket}` : `Request: "${request}"`,
    '',
    '1. Implement the changes described in the ticket',
    '2. Write or update tests',
    '3. Run: npm test — ensure all tests pass',
    '4. Self-verify: check hard rules (no export deletion, no test deletion, scope compliance, <50 net deletions)',
    '5. DO NOT update version, README, or CHANGELOG — that is the FINALIZE phase',
    learningContext,
  ].filter(Boolean).join('\n'), ctx);

  phases.push({ name: 'dev', ...devResult });
  if (!devResult.success) {
    return { success: false, phases, failedAt: 'dev' };
  }

  // ── Mid-pipeline gate: test + verify ──────────────
  ctx.log('\n=== Gate: Post-DEV Verification ===\n');

  // Auto-run tests
  const testResult = spawnSync('npm', ['test'], {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 60_000,
  });

  if (testResult.status === 0) {
    ctx.success('Tests passed');
  } else {
    ctx.warn('Tests failed — REVIEW phase will address this');
    ctx.log(testResult.stdout?.slice(-500) || '');
  }

  // Verify gates
  const midGate = runGates(ctx.cwd);
  for (const check of midGate.checks) {
    if (check.passed) {
      ctx.success(`[${check.rule}] ${check.detail}`);
    } else {
      ctx.warn(`[${check.rule}] ${check.detail}`);
    }
  }

  const midGateInfo = midGate.passed
    ? 'All verification gates passed.'
    : `Gate violations: ${midGate.violations.map(v => v.message).join('; ')}`;

  // ── Phase 3: REVIEW ───────────────────────────────
  ctx.log('\n=== Phase 3: REVIEW ===\n');
  state.current_phase = 'review';
  await ctx.writeJSON('tasks/governor-state.json', state);

  const reviewResult = runPhase('review', [
    'Read CLAUDE.md first.',
    'You are the PR-REVIEW agent. Your job:',
    '',
    `Test results: ${testResult.status === 0 ? 'ALL PASSED' : 'SOME FAILED — fix them'}`,
    `Verification gates: ${midGateInfo}`,
    '',
    '1. Review the git diff (run: git diff)',
    '2. If tests failed, fix the failing tests (fix code, not tests)',
    '3. If gate violations exist, fix them',
    '4. Ensure code quality and hard rule compliance',
    '5. Run: npm test — confirm all pass after fixes',
  ].join('\n'), ctx);

  phases.push({ name: 'review', ...reviewResult });

  // ── Phase 4: FINALIZE ─────────────────────────────
  ctx.log('\n=== Phase 4: FINALIZE ===\n');
  state.current_phase = 'finalize';
  await ctx.writeJSON('tasks/governor-state.json', state);

  const finalResult = runPhase('finalize', [
    'Read CLAUDE.md first.',
    'You are finalizing this work cycle. Your job:',
    '',
    '1. If any lessons were learned (failures, retries), add them to tasks/lessons.md',
    '2. If README.md needs updating (new features, changed commands), update it',
    '3. Create a clear git commit with the changes',
    '4. Report what was done',
  ].join('\n'), ctx);

  phases.push({ name: 'finalize', ...finalResult });

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

// ── Phase 실행 ────────────────────────────────────────

function runPhase(name, prompt, ctx) {
  const result = spawnSync('claude', ['-p', prompt], {
    cwd: ctx.cwd,
    stdio: 'inherit',
    timeout: 300_000, // 5분 per phase (전체 10분 대신)
  });

  if (result.error) {
    ctx.error(`Phase ${name} failed: ${result.error.message}`);
    return { success: false, error: result.error.message, exit_code: null };
  }

  if (result.status !== 0) {
    ctx.error(`Phase ${name} exited with code ${result.status}`);
    return { success: false, error: `exit code ${result.status}`, exit_code: result.status };
  }

  ctx.success(`Phase ${name} completed`);
  return { success: true, error: null, exit_code: 0 };
}

// ── 최근 티켓 내용 가져오기 ───────────────────────────

async function getLatestTicket(ctx) {
  if (!ctx.exists('tasks/tickets/index.json')) return null;

  try {
    const index = await ctx.readJSON('tasks/tickets/index.json');
    if (index.length === 0) return null;

    const latest = index[index.length - 1];
    const ticketPath = `tasks/tickets/${latest.id}.md`;
    if (ctx.exists(ticketPath)) {
      return await ctx.readFile(ticketPath);
    }
  } catch {
    // 인덱스 파싱 실패 — 무시
  }

  return null;
}
