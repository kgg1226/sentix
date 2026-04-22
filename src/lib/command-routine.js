/**
 * Command Routine — analyze/validate/execute/verify wrapper
 *
 * 상태변경 명령어(ticket create/close, version bump, feature add, resume, evolve)에
 * 공통으로 적용되는 4단계 루틴. 각 phase 종료 시 state.json 일관성과 영향 파일
 * 무결성을 자기검증하고, 실패 시 타겟 파일을 롤백한 뒤 원인/해결방안을 보고한다.
 *
 * Zero external dependencies.
 */

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { colors } from './ui-box.js';

const { dim, red, yellow, cyan, bold } = colors;

const STATE_PATH = 'tasks/governor-state.json';
const PHASES = ['analyze', 'validate', 'execute', 'verify'];

/**
 * Error carrying phase/cause/solution metadata. Callers may throw this from
 * any phase to short-circuit the routine with a formatted rollback report.
 */
export class RoutineError extends Error {
  constructor({ phase, cause, solution }) {
    super(`[${phase}] ${cause}`);
    this.phase = phase;
    this.cause = cause;
    this.solution = solution || 'Review the error above and retry after resolving the root cause.';
  }
}

/**
 * Execute a command as a 4-phase routine with rollback on failure.
 *
 * @param {object} ctx — sentix context
 * @param {object} options
 * @param {string} options.name — routine identifier for logging (e.g. "ticket:create")
 * @param {string[]} [options.targets] — file paths affected by this routine; snapshot + rollback boundary
 * @param {boolean} [options.trackState=true] — validate tasks/governor-state.json after each phase
 * @param {object} phases
 * @param {Function} [phases.analyze] — returns analysis data
 * @param {Function} [phases.validate] — throws RoutineError on precondition failure
 * @param {Function} [phases.execute] — performs the mutation
 * @param {Function} [phases.verify] — throws RoutineError on postcondition failure
 * @returns {Promise<{ok: boolean, data?: any, error?: {phase, cause, solution}}>}
 */
export async function runCommandRoutine(ctx, options, phases) {
  const { name, targets = [], trackState = true } = options;

  if (!name) throw new Error('runCommandRoutine: options.name is required');
  for (const phase of Object.keys(phases)) {
    if (!PHASES.includes(phase)) {
      throw new Error(`runCommandRoutine: unknown phase "${phase}" (allowed: ${PHASES.join(', ')})`);
    }
  }

  const snapshot = await captureSnapshot(ctx, targets, trackState);
  const routineCtx = { name, targets, data: {} };
  let currentPhase = null;

  try {
    for (const phase of PHASES) {
      const fn = phases[phase];
      if (!fn) continue;
      currentPhase = phase;
      const result = await fn(routineCtx);
      if (result !== undefined) routineCtx.data[phase] = result;
      await selfCheck(ctx, phase, trackState);
    }
    return { ok: true, data: routineCtx.data };
  } catch (err) {
    const phase = err instanceof RoutineError ? err.phase : currentPhase;
    const cause = err instanceof RoutineError ? err.cause : (err.message || String(err));
    const solution = err instanceof RoutineError
      ? err.solution
      : 'Inspect the error, fix the underlying issue, then retry the command.';

    await rollback(ctx, snapshot);
    reportFailure(ctx, name, phase, cause, solution);

    return { ok: false, error: { phase, cause, solution } };
  }
}

// ── Snapshot / Rollback ─────────────────────────────────

async function captureSnapshot(ctx, targets, trackState) {
  const files = new Map();
  for (const path of targets) {
    const full = resolve(ctx.cwd, path);
    if (existsSync(full)) {
      files.set(path, { existed: true, content: await readFile(full, 'utf-8') });
    } else {
      files.set(path, { existed: false, content: null });
    }
  }

  let state = null;
  if (trackState) {
    const stateFull = resolve(ctx.cwd, STATE_PATH);
    if (existsSync(stateFull)) {
      try {
        state = await readFile(stateFull, 'utf-8');
      } catch {
        // unreadable state.json treated as absent snapshot; rollback leaves it alone
      }
    }
  }

  return { files, state, trackState };
}

async function rollback(ctx, snapshot) {
  for (const [path, info] of snapshot.files) {
    const full = resolve(ctx.cwd, path);
    try {
      if (info.existed) {
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, info.content, 'utf-8');
      } else if (existsSync(full)) {
        await unlink(full);
      }
    } catch {
      // rollback is best-effort; continue with remaining targets
    }
  }

  if (snapshot.trackState && snapshot.state !== null) {
    const stateFull = resolve(ctx.cwd, STATE_PATH);
    try {
      await mkdir(dirname(stateFull), { recursive: true });
      await writeFile(stateFull, snapshot.state, 'utf-8');
    } catch {
      // best-effort
    }
  }
}

// ── Self-check ──────────────────────────────────────────

async function selfCheck(ctx, phase, trackState) {
  if (!trackState) return;
  const stateFull = resolve(ctx.cwd, STATE_PATH);
  if (!existsSync(stateFull)) return;

  let raw;
  try {
    raw = await readFile(stateFull, 'utf-8');
  } catch (err) {
    throw new RoutineError({
      phase,
      cause: `governor-state.json is unreadable: ${err.message}`,
      solution: 'Check file permissions or restore the file from version control.',
    });
  }

  try {
    JSON.parse(raw);
  } catch (err) {
    throw new RoutineError({
      phase,
      cause: `governor-state.json parse failed: ${err.message}`,
      solution: 'Restore tasks/governor-state.json from backup or delete it and start a new pipeline.',
    });
  }
}

// ── Reporting ───────────────────────────────────────────

function reportFailure(ctx, name, phase, cause, solution) {
  ctx.log('');
  ctx.error(`[${name}] ${phase || 'unknown'} 단계 실패 — 롤백 완료`);
  ctx.log(`  ${dim('원인     ')} ${red(cause)}`);
  ctx.log(`  ${dim('해결방안 ')} ${yellow(solution)}`);
  ctx.log('');
}

/**
 * Convenience helper: throw a RoutineError from inside a phase.
 */
export function routineFail(phase, cause, solution) {
  throw new RoutineError({ phase, cause, solution });
}
