/**
 * pipeline.js — Framework mode 체인 파이프라인
 *
 * sentix run을 단일 Claude Code 호출이 아닌 multi-phase 체인으로 실행.
 * 각 phase 사이에 검증 게이트와 테스트를 실행하여 단계별 신뢰를 쌓는다.
 *
 * Phase 구조:
 *   1. PLAN — 티켓 생성 + 실행 계획
 *   2. DEV — 코드 구현 + 테스트 작성
 *      COMPLEXITY: high → dev-swarm (병렬 worktree)
 *   [gate: verify-gates + npm test]
 *   3. REVIEW — 자체 리뷰 + 수정
 *   [gate: verify-gates]
 *   4. FINALIZE — 학습/README 업데이트
 */

import { spawn, spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runGates } from './verify-gates.js';

/**
 * 체인 파이프라인 실행 (Framework mode)
 */
export async function runChainedPipeline(request, cycleId, state, ctx, options = {}) {
  const phases = [];
  const startTime = Date.now();

  // lessons.md, patterns.md, agent-methods.md 로드
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
    '6. Define WHAT and WHERE only. DO NOT specify HOW.',
    '7. If high complexity, include PARALLEL_HINT with subtask breakdown.',
    methodsDirective,
    learningContext,
  ].filter(Boolean).join('\n'), ctx);

  phases.push({ name: 'plan', ...planResult });
  if (!planResult.success) {
    return { success: false, phases, failedAt: 'plan' };
  }

  // ── 복잡도 감지: 병렬 or 순차 결정 ────────────────
  const latestTicket = await getLatestTicket(ctx);
  const complexity = detectComplexity(latestTicket);

  let devResult;
  if (complexity === 'high' && latestTicket) {
    // ── Phase 2: DEV-SWARM (병렬) ────────────────────
    ctx.log('\n=== Phase 2: DEV-SWARM (parallel) ===\n');
    state.current_phase = 'dev-swarm';
    await ctx.writeJSON('tasks/governor-state.json', state);

    devResult = await runDevSwarm(request, latestTicket, methodsDirective, learningContext, options, ctx);
  } else {
    // ── Phase 2: DEV (순차) ──────────────────────────
    ctx.log('\n=== Phase 2: DEV ===\n');
    state.current_phase = 'dev';
    await ctx.writeJSON('tasks/governor-state.json', state);

    devResult = runPhase('dev', [
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
  }

  phases.push({ name: complexity === 'high' ? 'dev-swarm' : 'dev', ...devResult });
  if (!devResult.success) {
    return { success: false, phases, failedAt: 'dev' };
  }

  // ── Mid-pipeline gate: test + verify ──────────────
  ctx.log('\n=== Gate: Post-DEV Verification ===\n');

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

// ── 복잡도 감지 ──────────────────────────────────────

function detectComplexity(ticketContent) {
  if (!ticketContent) return 'low';
  const lower = ticketContent.toLowerCase();
  if (/complexity:\s*high/i.test(lower)) return 'high';
  if (/parallel_hint/i.test(lower)) return 'high';
  if (/complexity:\s*mid/i.test(lower) || /complexity:\s*medium/i.test(lower)) return 'mid';
  return 'low';
}

// ── Dev-Swarm: 병렬 worktree 실행 ────────────────────

async function runDevSwarm(request, ticket, methodsDirective, learningContext, options, ctx) {
  // 1. 티켓에서 서브태스크 추출
  const subtasks = parseSubtasks(ticket);

  if (subtasks.length <= 1) {
    ctx.log('Single subtask — falling back to sequential dev\n');
    return runPhase('dev', [
      'Read CLAUDE.md first.',
      options.safetyDirective || '',
      'You are the DEV agent. Your job:',
      `Ticket:\n${ticket}`,
      '',
      '1. Follow dev methods: snapshot() → implement() → test() → verify() → report()',
      '2. Implement the changes described in the ticket — you decide HOW',
      '3. Write or update tests',
      '4. Run: npm test — ensure all tests pass',
      '5. Self-verify: hard rules ONLY',
      '6. DO NOT judge code quality — that is pr-review\'s job',
      '7. DO NOT update version, README, or CHANGELOG',
      methodsDirective,
      learningContext,
    ].filter(Boolean).join('\n'), ctx);
  }

  ctx.log(`Splitting into ${subtasks.length} parallel workers\n`);

  // 2. 각 서브태스크를 worktree에서 병렬 실행
  const workers = [];
  const worktrees = [];

  for (let i = 0; i < subtasks.length; i++) {
    const name = `swarm-worker-${i}`;
    const wtPath = resolve(ctx.cwd, '..', `.sentix-worktree-${name}`);
    const branch = `sentix/${name}-${Date.now()}`;

    try {
      // worktree 생성
      execSync(`git worktree add -b "${branch}" "${wtPath}" HEAD`, {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      worktrees.push({ path: wtPath, branch });
      ctx.success(`Worker ${i}: worktree created at ${wtPath}`);
    } catch (e) {
      ctx.warn(`Worker ${i}: worktree creation failed — ${e.message}`);
      continue;
    }

    // 비동기 claude 실행
    const prompt = [
      'Read CLAUDE.md first.',
      options.safetyDirective || '',
      `You are DEV-WORKER ${i}. Your subtask:`,
      subtasks[i],
      '',
      `Full ticket context:\n${ticket}`,
      '',
      '1. Implement ONLY your subtask — do not touch other subtasks\' files',
      '2. Write or update tests for your changes',
      '3. Run: npm test',
      '4. Self-verify: hard rules ONLY',
      methodsDirective,
      learningContext,
    ].filter(Boolean).join('\n');

    const worker = spawnWorker(prompt, wtPath, ctx);
    workers.push({ index: i, worker, worktree: wtPath, branch });
  }

  // 3. 모든 worker 완료 대기
  ctx.log(`\nWaiting for ${workers.length} workers...\n`);
  const results = await Promise.all(workers.map(w => w.worker));

  for (let i = 0; i < results.length; i++) {
    if (results[i].success) {
      ctx.success(`Worker ${i}: completed`);
    } else {
      ctx.warn(`Worker ${i}: failed — ${results[i].error}`);
    }
  }

  // 4. worktree 결과를 main 브랜치에 머지
  ctx.log('\n--- Merging worker results ---\n');
  let mergeSuccess = true;

  for (const wt of worktrees) {
    try {
      // worker의 변경사항이 있는지 확인
      const diffCheck = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
        cwd: wt.path,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (!diffCheck.stdout?.trim()) {
        ctx.log(`${wt.branch}: no changes — skip`);
        continue;
      }

      // worker에서 커밋
      spawnSync('git', ['add', '-A'], { cwd: wt.path, stdio: 'pipe' });
      spawnSync('git', ['commit', '-m', `chore: dev-swarm worker ${wt.branch}`], {
        cwd: wt.path,
        stdio: 'pipe',
      });

      // main으로 머지
      const merge = spawnSync('git', ['merge', '--no-ff', wt.branch, '-m', `merge: ${wt.branch}`], {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (merge.status === 0) {
        ctx.success(`Merged: ${wt.branch}`);
      } else {
        ctx.warn(`Merge conflict: ${wt.branch} — ${merge.stderr?.slice(0, 200)}`);
        // 충돌 시 abort하고 계속
        spawnSync('git', ['merge', '--abort'], { cwd: ctx.cwd, stdio: 'pipe' });
        mergeSuccess = false;
      }
    } catch (e) {
      ctx.warn(`Merge error: ${wt.branch} — ${e.message}`);
      mergeSuccess = false;
    }
  }

  // 5. worktree 정리
  for (const wt of worktrees) {
    try {
      execSync(`git worktree remove "${wt.path}" --force`, {
        cwd: ctx.cwd,
        stdio: 'pipe',
      });
      // 브랜치도 정리
      spawnSync('git', ['branch', '-D', wt.branch], { cwd: ctx.cwd, stdio: 'pipe' });
    } catch {
      // 정리 실패는 무시
    }
  }

  ctx.log('');
  const successCount = results.filter(r => r.success).length;
  ctx.log(`Dev-swarm: ${successCount}/${workers.length} workers succeeded, merge: ${mergeSuccess ? 'OK' : 'PARTIAL'}\n`);

  return {
    success: successCount > 0,
    error: successCount === 0 ? 'All workers failed' : null,
    exit_code: successCount > 0 ? 0 : 1,
    output: { workers: results.length, succeeded: successCount, merged: mergeSuccess },
  };
}

// ── 서브태스크 파싱 ──────────────────────────────────

function parseSubtasks(ticketContent) {
  const subtasks = [];

  // PARALLEL_HINT 섹션에서 서브태스크 추출
  const hintMatch = ticketContent.match(/PARALLEL_HINT[:\s]*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
  if (hintMatch) {
    const lines = hintMatch[1].split('\n')
      .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(l => l.length > 5);
    if (lines.length > 1) return lines;
  }

  // SCOPE에서 디렉토리별 분할 시도
  const scopeMatch = ticketContent.match(/SCOPE[:\s]*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
  if (scopeMatch) {
    const dirs = new Set();
    const lines = scopeMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/(\w+)\//);
      if (match) dirs.add(match[1]);
    }
    if (dirs.size > 1) {
      return Array.from(dirs).map(d => `Implement changes in ${d}/ directory`);
    }
  }

  // 분할 불가 → 단일 태스크
  subtasks.push(ticketContent);
  return subtasks;
}

// ── 비동기 worker 실행 ───────────────────────────────

function spawnWorker(prompt, cwd, ctx) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'json'];

    // agent가 있으면 사용
    if (existsSync(join(cwd, '.claude', 'agents', 'dev.md'))) {
      args.push('--agent', 'dev');
    }

    const child = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        let output = null;
        try { output = JSON.parse(stdout); } catch { output = { content: stdout }; }
        resolve({ success: true, error: null, exit_code: 0, output });
      } else {
        resolve({ success: false, error: stderr.slice(-300) || `exit code ${code}`, exit_code: code, output: null });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message, exit_code: null, output: null });
    });
  });
}

// ── 에이전트 이름 → phase 이름 매핑 ────────────────────

const AGENT_MAP = {
  plan: 'planner',
  dev: 'dev',
  review: 'pr-review',
  finalize: null,
};

// ── Phase 실행 (순차) ────────────────────────────────

function runPhase(name, prompt, ctx) {
  const args = ['-p', prompt, '--output-format', 'json'];

  const agentName = AGENT_MAP[name];
  if (agentName && existsSync(join(ctx.cwd, '.claude', 'agents', `${agentName}.md`))) {
    args.push('--agent', agentName);
  }

  const result = spawnSync('claude', args, {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 300_000,
  });

  if (result.error) {
    ctx.error(`Phase ${name} failed: ${result.error.message}`);
    return { success: false, error: result.error.message, exit_code: null, output: null };
  }

  if (result.status !== 0) {
    ctx.error(`Phase ${name} exited with code ${result.status}`);
    if (result.stderr?.trim()) {
      ctx.log(result.stderr.slice(-500));
    }
    return { success: false, error: `exit code ${result.status}`, exit_code: result.status, output: null };
  }

  let output = null;
  try {
    output = JSON.parse(result.stdout);
    ctx.success(`Phase ${name} completed (${output.usage?.output_tokens || '?'} tokens)`);
  } catch {
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
