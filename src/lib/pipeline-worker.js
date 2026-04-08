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

/**
 * Phase 를 동기 실행 (spawnSync).
 * @returns {{success: boolean, error: string|null, exit_code: number|null, output: object|null}}
 */
export function runPhase(name, prompt, ctx) {
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

/**
 * 비동기 worker 실행 (Promise 반환) — dev-swarm 병렬 실행용.
 */
export function spawnWorker(prompt, cwd, _ctx) {
  return new Promise((resolveFn) => {
    const args = ['-p', prompt, '--output-format', 'json'];

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
