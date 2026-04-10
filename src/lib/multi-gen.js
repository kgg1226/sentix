/**
 * multi-gen.js — 다중 생성 + 최선 선택 (Layer 5)
 *
 * 동일 요청에 대해 dev를 N번 독립 실행하고, Quality Gate로 각각 점수를
 * 매긴 후, 가장 좋은 결과를 선택한다.
 *
 * 핵심 원리:
 *   같은 모델이라도 매번 다른 접근법을 시도하면 다른 결과가 나온다.
 *   1번 생성 후 다듬기보다, N번 생성 후 최선을 고르는 것이 더 효과적이다.
 *
 * 동작:
 *   1. baseline 기록 (현재 git 상태)
 *   2. N번 반복: 접근법 지시 → dev 실행 → diff 저장 → 점수 측정 → 원상 복구
 *   3. 최고 점수의 diff를 적용
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { runQualityGate } from './quality-gate.js';
import { runPhase } from './pipeline-worker.js';

// ── 접근법 지시문 ───────────────────────────────────────

const APPROACH_DIRECTIVES = [
  {
    id: 'simplest',
    label: '가장 단순한 접근',
    directive: [
      'APPROACH DIRECTIVE: Implement the SIMPLEST possible solution.',
      '- Minimize lines of code and complexity.',
      '- Prefer straightforward logic over clever abstractions.',
      '- "The best code is code you never had to write."',
    ].join('\n'),
  },
  {
    id: 'robust',
    label: '가장 견고한 접근',
    directive: [
      'APPROACH DIRECTIVE: Implement the MOST ROBUST solution.',
      '- Prioritize error handling and edge case coverage.',
      '- Add input validation at boundaries.',
      '- Defensive coding — assume inputs can be malformed.',
    ].join('\n'),
  },
  {
    id: 'elegant',
    label: '가장 우아한 접근',
    directive: [
      'APPROACH DIRECTIVE: Implement the MOST ELEGANT solution.',
      '- Prioritize clean architecture and clear abstractions.',
      '- Make the code self-documenting through naming and structure.',
      '- Balance readability with conciseness.',
    ].join('\n'),
  },
];

/**
 * 접근법 지시문 N개를 반환한다.
 * @param {number} n - 생성 횟수 (기본 3, 최대 APPROACH_DIRECTIVES.length)
 * @returns {Array<{id: string, label: string, directive: string}>}
 */
export function getApproachDirectives(n = 3) {
  return APPROACH_DIRECTIVES.slice(0, Math.min(n, APPROACH_DIRECTIVES.length));
}

/**
 * 다중 생성 실행.
 *
 * @param {string} basePrompt - dev에게 보낼 기본 프롬프트
 * @param {object} ctx - pipeline context
 * @param {object} [options]
 * @param {number} [options.count=3] - 생성 횟수
 * @returns {{generations: Array, bestIndex: number, applied: boolean}}
 */
export function runMultiGen(basePrompt, ctx, options = {}) {
  const count = Math.min(options.count || 3, APPROACH_DIRECTIVES.length);
  const approaches = getApproachDirectives(count);
  const generations = [];
  const patchDir = resolve(ctx.cwd, 'tasks');

  // 1. Baseline 기록
  let baseline;
  try {
    baseline = execSync('git rev-parse HEAD', {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
    }).trim();
  } catch {
    ctx.warn('Multi-gen: git baseline failed — falling back to single generation');
    return { generations: [], bestIndex: -1, applied: false, fallback: true };
  }

  ctx.log(`\n=== Multi-Gen: ${count} generations ===\n`);

  // 2. 각 접근법으로 dev 실행
  for (let i = 0; i < approaches.length; i++) {
    const approach = approaches[i];
    ctx.log(`\n--- Generation ${i + 1}/${count}: ${approach.label} ---\n`);

    // dev 실행 (접근법 지시문을 프롬프트에 추가)
    const prompt = `${approach.directive}\n\n${basePrompt}`;
    const devResult = runPhase('dev', prompt, ctx);

    // diff 저장
    const patchPath = resolve(patchDir, `.gen-${i}.patch`);
    let diff = '';
    try {
      diff = execSync('git diff', {
        cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10_000,
      });
      if (diff.trim()) {
        writeFileSync(patchPath, diff);
      }
    } catch {
      diff = '';
    }

    // Quality Gate 점수
    const score = scoreGeneration(ctx.cwd);

    // 결과 기록
    generations.push({
      index: i,
      approach: approach.id,
      label: approach.label,
      success: devResult.success,
      score,
      patchPath: diff.trim() ? patchPath : null,
      patchSize: diff.length,
    });

    ctx.log(`  Score: ${score.total} (issues: ${score.issues}, gate: ${score.gatePassed ? 'PASS' : 'FAIL'})`);

    // 원상 복구 (다음 생성을 위해)
    if (i < approaches.length - 1) {
      try {
        execSync('git checkout -- .', {
          cwd: ctx.cwd, stdio: 'pipe', timeout: 10_000,
        });
        // Untracked new files도 제거
        execSync('git clean -fd --exclude=tasks/ --exclude=.sentix/ --exclude=__tests__/', {
          cwd: ctx.cwd, stdio: 'pipe', timeout: 10_000,
        });
      } catch (e) {
        ctx.warn(`Multi-gen: reset failed after gen ${i}: ${e.message}`);
      }
    }
  }

  // 3. 최선 선택
  const bestIndex = selectBest(generations);
  ctx.log(`\n=== Multi-Gen Result ===`);

  for (const gen of generations) {
    const marker = gen.index === bestIndex ? '★' : ' ';
    ctx.log(`  ${marker} Gen ${gen.index + 1} [${gen.label}]: score ${gen.score.total} (issues: ${gen.score.issues})`);
  }

  // 4. 최선 적용 (마지막 생성이 아닌 경우만)
  let applied = false;
  if (bestIndex >= 0 && bestIndex !== approaches.length - 1) {
    // 현재 상태를 리셋하고 최선의 patch 적용
    try {
      execSync('git checkout -- .', {
        cwd: ctx.cwd, stdio: 'pipe', timeout: 10_000,
      });
      execSync('git clean -fd --exclude=tasks/ --exclude=.sentix/ --exclude=__tests__/', {
        cwd: ctx.cwd, stdio: 'pipe', timeout: 10_000,
      });

      const bestPatch = generations[bestIndex].patchPath;
      if (bestPatch && existsSync(bestPatch)) {
        execSync(`git apply "${bestPatch}"`, {
          cwd: ctx.cwd, stdio: 'pipe', timeout: 10_000,
        });
        applied = true;
        ctx.success(`Applied generation ${bestIndex + 1} [${generations[bestIndex].label}]`);
      }
    } catch (e) {
      ctx.warn(`Multi-gen: failed to apply best patch: ${e.message}`);
    }
  } else if (bestIndex === approaches.length - 1) {
    // 마지막 생성이 최선이면 이미 적용된 상태
    applied = true;
    ctx.success(`Kept generation ${bestIndex + 1} [${generations[bestIndex].label}] (already applied)`);
  }

  // 5. patch 파일 정리
  cleanupPatches(patchDir, count);

  return { generations, bestIndex, applied, fallback: false };
}

/**
 * 생성 결과에 Quality Gate 점수를 매긴다.
 * 점수가 높을수록 좋음.
 */
function scoreGeneration(cwd) {
  const gate = runQualityGate(cwd, { skipAudit: true });

  let total = 100; // 만점에서 감점
  let issues = 0;

  for (const check of gate.checks) {
    for (const issue of check.issues) {
      issues++;
      if (issue.severity === 'error') {
        total -= 20; // 에러는 크게 감점
      } else {
        total -= 5;  // 경고는 작게 감점
      }
    }
  }

  // 하한 0
  total = Math.max(0, total);

  return {
    total,
    issues,
    gatePassed: gate.passed,
    checks: gate.checks.map(c => ({ name: c.name, passed: c.passed, issueCount: c.issues.length })),
  };
}

/**
 * 최선의 생성을 선택한다.
 * 기준: 1) dev 성공 여부, 2) Quality Gate 점수, 3) patch 크기 (작을수록 좋음)
 */
export function selectBest(generations) {
  if (generations.length === 0) return -1;

  const candidates = generations
    .filter(g => g.success && g.patchPath) // dev 성공 + 실제 변경이 있는 것만
    .sort((a, b) => {
      // 1순위: 점수 높은 순
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      // 2순위: 이슈 적은 순
      if (a.score.issues !== b.score.issues) return a.score.issues - b.score.issues;
      // 3순위: patch 작은 순 (단순한 게 좋다)
      return a.patchSize - b.patchSize;
    });

  return candidates.length > 0 ? candidates[0].index : generations[0]?.index ?? -1;
}

/**
 * 임시 patch 파일 정리.
 */
function cleanupPatches(dir, count) {
  for (let i = 0; i < count; i++) {
    const path = resolve(dir, `.gen-${i}.patch`);
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch { /* 정리 실패 무시 */ }
  }
}
