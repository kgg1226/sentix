/**
 * Dev-swarm — 병렬 worktree 실행 (high complexity tickets).
 *
 * pipeline.js 에서 runDevSwarm 을 분리. git worktree 로 여러 병렬
 * worker 를 띄우고 결과를 머지한다.
 */

import { spawnSync, execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { parseSubtasks } from './pipeline-helpers.js';
import { runPhase, spawnWorker } from './pipeline-worker.js';
import {
  buildDevSwarmFallbackPrompt,
  buildSwarmWorkerPrompt,
} from './pipeline-prompts.js';

/**
 * Dev-swarm 실행.
 * @returns {Promise<{success: boolean, error: string|null, exit_code: number, output: object}>}
 */
export async function runDevSwarm(request, ticket, methodsDirective, learningContext, options, ctx) {
  const subtasks = parseSubtasks(ticket);

  // 서브태스크가 1개면 순차 모드로 fallback
  if (subtasks.length <= 1) {
    ctx.log('Single subtask — falling back to sequential dev\n');
    return runPhase('dev', buildDevSwarmFallbackPrompt({
      ticket,
      safetyDirective: options.safetyDirective,
      methodsDirective,
      learningContext,
    }), ctx);
  }

  ctx.log(`Splitting into ${subtasks.length} parallel workers\n`);

  // 1. 각 서브태스크에 대해 worktree 생성 + worker 시작
  const workers = [];
  const worktrees = [];

  for (let i = 0; i < subtasks.length; i++) {
    const name = `swarm-worker-${i}`;
    const wtPath = resolve(ctx.cwd, '..', `.sentix-worktree-${name}`);
    const branch = `sentix/${name}-${Date.now()}`;

    try {
      execSync(`git worktree add -b "${branch}" "${wtPath}" HEAD`, {
        cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
      });
      worktrees.push({ path: wtPath, branch });
      ctx.success(`Worker ${i}: worktree created at ${wtPath}`);
    } catch (e) {
      ctx.warn(`Worker ${i}: worktree creation failed — ${e.message}`);
      continue;
    }

    const prompt = buildSwarmWorkerPrompt({
      index: i,
      subtask: subtasks[i],
      ticket,
      safetyDirective: options.safetyDirective,
      methodsDirective,
      learningContext,
    });

    const worker = spawnWorker(prompt, wtPath, ctx);
    workers.push({ index: i, worker, worktree: wtPath, branch });
  }

  // 2. 모든 worker 완료 대기
  ctx.log(`\nWaiting for ${workers.length} workers...\n`);
  const results = await Promise.all(workers.map((w) => w.worker));

  for (let i = 0; i < results.length; i++) {
    if (results[i].success) {
      ctx.success(`Worker ${i}: completed`);
    } else {
      ctx.warn(`Worker ${i}: failed — ${results[i].error}`);
    }
  }

  // 3. 결과 머지
  const mergeSuccess = mergeWorktrees(worktrees, ctx);

  // 4. worktree 정리
  cleanupWorktrees(worktrees, ctx);

  ctx.log('');
  const successCount = results.filter((r) => r.success).length;
  ctx.log(`Dev-swarm: ${successCount}/${workers.length} workers succeeded, merge: ${mergeSuccess ? 'OK' : 'PARTIAL'}\n`);

  return {
    success: successCount > 0,
    error: successCount === 0 ? 'All workers failed' : null,
    exit_code: successCount > 0 ? 0 : 1,
    output: { workers: results.length, succeeded: successCount, merged: mergeSuccess },
  };
}

/** Worktree 결과를 main 브랜치로 머지 */
function mergeWorktrees(worktrees, ctx) {
  ctx.log('\n--- Merging worker results ---\n');
  let mergeSuccess = true;

  for (const wt of worktrees) {
    try {
      const diffCheck = spawnSync('git', ['diff', '--name-only', 'HEAD'], {
        cwd: wt.path, encoding: 'utf-8', stdio: 'pipe',
      });

      if (!diffCheck.stdout?.trim()) {
        ctx.log(`${wt.branch}: no changes — skip`);
        continue;
      }

      spawnSync('git', ['add', '-A'], { cwd: wt.path, stdio: 'pipe' });
      spawnSync('git', ['commit', '-m', `chore: dev-swarm worker ${wt.branch}`], {
        cwd: wt.path, stdio: 'pipe',
      });

      const merge = spawnSync('git', ['merge', '--no-ff', wt.branch, '-m', `merge: ${wt.branch}`], {
        cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
      });

      if (merge.status === 0) {
        ctx.success(`Merged: ${wt.branch}`);
      } else {
        ctx.warn(`Merge conflict: ${wt.branch} — ${merge.stderr?.slice(0, 200)}`);
        spawnSync('git', ['merge', '--abort'], { cwd: ctx.cwd, stdio: 'pipe' });
        mergeSuccess = false;
      }
    } catch (e) {
      ctx.warn(`Merge error: ${wt.branch} — ${e.message}`);
      mergeSuccess = false;
    }
  }

  return mergeSuccess;
}

/** Worktree + branch 정리 */
function cleanupWorktrees(worktrees, ctx) {
  for (const wt of worktrees) {
    try {
      execSync(`git worktree remove "${wt.path}" --force`, {
        cwd: ctx.cwd, stdio: 'pipe',
      });
      spawnSync('git', ['branch', '-D', wt.branch], { cwd: ctx.cwd, stdio: 'pipe' });
    } catch { /* 정리 실패는 무시 */ }
  }
}
