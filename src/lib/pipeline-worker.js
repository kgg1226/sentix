/**
 * Pipeline worker — Claude Code invocation wrappers.
 *
 * sentix pipeline 의 각 phase 를 실행하는 저수준 spawn helper.
 * - runPhase: 동기 spawnSync (순차 phase)
 * - spawnWorker: 비동기 spawn (dev-swarm parallel)
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** 에이전트 이름 → phase 이름 매핑 */
export const AGENT_MAP = {
  plan: 'planner',
  dev: 'dev',
  review: 'pr-review',
  finalize: null,
};

/** 코드를 수정하는 phase인지 판단 */
const WRITE_PHASES = new Set(['dev', 'review', 'finalize']);

/**
 * Phase별 spawn 타임아웃 (ms).
 * review 는 dev 산출물 전체를 입력으로 받아 적대적 검토를 수행하므로
 * 기본 15분은 부족하다. 타임아웃 시 빈 출력으로 실패하면 REPLAN 낭비가 큼.
 */
const PHASE_TIMEOUT = {
  plan:     900_000,   // 15분
  dev:      900_000,   // 15분
  review:  1_800_000,  // 30분
  finalize: 900_000,   // 15분
};
const DEFAULT_TIMEOUT = 900_000;

/**
 * Windows 에서만 shell:true 사용.
 * bug-008: Windows 는 .cmd 런처 때문에 shell:true 가 필요하다 (EPERM 회피).
 * bug-010: Unix 계열에서 shell:true 를 쓰면 프롬프트 내 괄호/세미콜론 등
 *          쉘 특수문자가 해석되어 plan phase 가 exit 2 로 실패한다.
 */
const USE_SHELL = process.platform === 'win32';

/**
 * Phase 를 동기 실행 (spawnSync).
 * @returns {{success: boolean, error: string|null, exit_code: number|null, output: object|null}}
 */
export function runPhase(name, prompt, ctx) {
  const args = ['-p', prompt, '--output-format', 'json'];

  // 코드를 수정하는 phase에는 acceptEdits 권한 부여
  if (WRITE_PHASES.has(name)) {
    args.push('--permission-mode', 'acceptEdits');
  }

  const agentName = AGENT_MAP[name];
  if (agentName && existsSync(join(ctx.cwd, '.claude', 'agents', `${agentName}.md`))) {
    args.push('--agent', agentName);
  }

  const result = spawnSync('claude', args, {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: PHASE_TIMEOUT[name] ?? DEFAULT_TIMEOUT,
    shell: USE_SHELL,
    env: { ...process.env, SENTIX_PIPELINE: 'true' },
  });

  if (result.error) {
    ctx.error(`Phase ${name} failed: ${result.error.message}`);
    return { success: false, error: result.error.message, exit_code: null, output: null };
  }

  if (result.status !== 0) {
    ctx.error(`Phase ${name} exited with code ${result.status}`);
    if (result.stderr?.trim()) {
      ctx.log('--- stderr ---');
      ctx.log(result.stderr.slice(-1000));
    }
    if (result.stdout?.trim()) {
      ctx.log('--- stdout ---');
      ctx.log(result.stdout.slice(-500));
    }
    return { success: false, error: `exit code ${result.status}`, exit_code: result.status, output: null };
  }

  let output = null;
  try {
    output = JSON.parse(result.stdout);
    const usage = output.usage || {};
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    ctx.success(`Phase ${name} completed (in: ${inTok.toLocaleString()} / out: ${outTok.toLocaleString()} tokens)`);
  } catch {
    output = { content: result.stdout };
    ctx.success(`Phase ${name} completed`);
  }

  return { success: true, error: null, exit_code: 0, output };
}

/**
 * 비동기 worker 실행 (Promise 반환) — dev-swarm 병렬 실행용.
 */
export function spawnWorker(prompt, cwd, _ctx) {
  return new Promise((resolveFn) => {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits'];

    if (existsSync(join(cwd, '.claude', 'agents', 'dev.md'))) {
      args.push('--agent', 'dev');
    }

    const child = spawn('claude', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: PHASE_TIMEOUT.dev ?? DEFAULT_TIMEOUT,
      shell: USE_SHELL,
      env: { ...process.env, SENTIX_PIPELINE: 'true' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        let output = null;
        try { output = JSON.parse(stdout); } catch { output = { content: stdout }; }
        resolveFn({ success: true, error: null, exit_code: 0, output });
      } else {
        resolveFn({ success: false, error: stderr.slice(-300) || `exit code ${code}`, exit_code: code, output: null });
      }
    });

    child.on('error', (err) => {
      resolveFn({ success: false, error: err.message, exit_code: null, output: null });
    });
  });
}
