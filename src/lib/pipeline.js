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
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

  // lessons.md, patterns.md, agent-methods.md 로드 (있으면)
  const lessons = ctx.exists('tasks/lessons.md')
    ? await ctx.readFile('tasks/lessons.md')
    : '';
  const patterns = ctx.exists('tasks/patterns.md')
    ? await ctx.readFile('tasks/patterns.md')
    : '';
  const agentMethods = ctx.exists('docs/agent-methods.md')
    ? await ctx.readFile('docs/agent-methods.md')
    : '';

  const methodsDirective = agentMethods.trim()
    ? `\n--- agent-methods.md (MANDATORY — follow method order strictly) ---\n${agentMethods}`
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
    '6. Define WHAT and WHERE only. DO NOT specify HOW (implementation details, function names, algorithms, library choices).',
    methodsDirective,
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
    '1. Follow dev methods: snapshot() → implement() → test() → verify() → report()',
    '2. Implement the changes described in the ticket — you decide HOW',
    '3. Write or update tests',
    '4. Run: npm test — ensure all tests pass',
    '5. Self-verify: hard rules ONLY (no export deletion, no test deletion, scope compliance, <50 net deletions)',
    '6. DO NOT judge code quality — that is pr-review\'s job',
    '7. DO NOT update version, README, or CHANGELOG — that is the FINALIZE phase',
    methodsDirective,
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
    '1. Follow pr-review methods: diff() → validate() → grade() → calibrate() → verdict()',
    '2. Review the git diff (run: git diff)',
    '3. Validate hard rules first — any violation = immediate REJECTED',
    '4. Grade on 4 criteria: Correctness, Consistency, Simplicity, Test Coverage',
    '   (skip grade() for low complexity — hard rule pass is sufficient)',
    '5. Calibrate: check tasks/lessons.md for past missed issues — be skeptical, not generous',
    '6. If tests failed, fix the failing tests (fix code, not tests)',
    '7. If gate violations exist, fix them',
    '8. Run: npm test — confirm all pass after fixes',
    methodsDirective,
    learningContext,
  ].filter(Boolean).join('\n'), ctx);

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

// ── 에이전트 이름 → phase 이름 매핑 ────────────────────

const AGENT_MAP = {
  plan: 'planner',
  dev: 'dev',
  review: 'pr-review',
  finalize: null,  // finalize는 전용 에이전트 없음
};

// ── Phase 실행 ────────────────────────────────────────

function runPhase(name, prompt, ctx) {
  const args = ['-p', prompt, '--output-format', 'json'];

  // .claude/agents/ 에 에이전트가 있으면 --agent 플래그 추가
  const agentName = AGENT_MAP[name];
  if (agentName && existsSync(join(ctx.cwd, '.claude', 'agents', `${agentName}.md`))) {
    args.push('--agent', agentName);
  }

  const result = spawnSync('claude', args, {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 300_000, // 5분 per phase
  });

  if (result.error) {
    ctx.error(`Phase ${name} failed: ${result.error.message}`);
    return { success: false, error: result.error.message, exit_code: null, output: null };
  }

  if (result.status !== 0) {
    ctx.error(`Phase ${name} exited with code ${result.status}`);
    // stderr가 있으면 출력
    if (result.stderr?.trim()) {
      ctx.log(result.stderr.slice(-500));
    }
    return { success: false, error: `exit code ${result.status}`, exit_code: result.status, output: null };
  }

  // JSON 출력 파싱
  let output = null;
  try {
    output = JSON.parse(result.stdout);
    ctx.success(`Phase ${name} completed (${output.usage?.output_tokens || '?'} tokens)`);
  } catch {
    // JSON 파싱 실패 — 텍스트 그대로 사용
    output = { content: result.stdout };
    ctx.success(`Phase ${name} completed`);
  }

  return { success: true, error: null, exit_code: 0, output };
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
