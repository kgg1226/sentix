/**
 * spec-enricher.js — 입력 품질 강화 모듈
 *
 * planner/dev 프롬프트에 주입할 제약 컨텍스트를 생성한다.
 * 두 가지 소스를 결합:
 *   1. .sentix/constraints.md — 프로젝트 고유 제약 (사용자/자동 관리)
 *   2. tasks/lessons.md — 과거 실패 패턴에서 추출한 제약
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 프로젝트 제약과 학습된 패턴을 로드하여 프롬프트 주입용 컨텍스트를 생성한다.
 *
 * @param {string} cwd - Working directory
 * @returns {object} { constraintsContext: string, constraintCount: number }
 */
export function loadConstraints(cwd) {
  const parts = [];
  let constraintCount = 0;

  // 1. .sentix/constraints.md 로드
  const constraintsPath = resolve(cwd, '.sentix/constraints.md');
  if (existsSync(constraintsPath)) {
    const raw = readFileSync(constraintsPath, 'utf-8');
    const constraints = parseConstraints(raw);
    constraintCount += constraints.length;

    if (constraints.length > 0) {
      parts.push('## Project Constraints (자동 주입 — 위반 시 Quality Gate에서 차단됨)');
      parts.push('');
      for (const c of constraints) {
        parts.push(`- [${c.category}] ${c.text}`);
      }
    }
  }

  // 2. tasks/lessons.md에서 반복 패턴 추출
  const lessonsPath = resolve(cwd, 'tasks/lessons.md');
  if (existsSync(lessonsPath)) {
    const raw = readFileSync(lessonsPath, 'utf-8');
    const patterns = extractLessonPatterns(raw);

    if (patterns.length > 0) {
      constraintCount += patterns.length;
      parts.push('');
      parts.push('## Learned Constraints (과거 실패에서 학습 — 같은 실수 금지)');
      parts.push('');
      for (const p of patterns) {
        parts.push(`- ⚠ ${p}`);
      }
    }
  }

  const fullText = parts.join('\n');
  const constraintsContext = parts.length > 0
    ? `\n--- CONSTRAINTS (${constraintCount} rules) ---\n${fullText.slice(0, 1500)}\n--- END CONSTRAINTS ---`
    : '';

  return { constraintsContext, constraintCount };
}

/**
 * constraints.md를 파싱하여 구조화된 제약 목록으로 변환한다.
 *
 * @param {string} raw - constraints.md 원문
 * @returns {Array<{category: string, text: string}>}
 */
export function parseConstraints(raw) {
  const constraints = [];
  let currentCategory = 'General';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    // 카테고리 헤더: ## Security (보안)
    const headerMatch = trimmed.match(/^##\s+(\w[\w\s]*)/);
    if (headerMatch) {
      currentCategory = headerMatch[1].trim().split(/\s*\(/)[0]; // "Security (보안)" → "Security"
      continue;
    }

    // 주석/빈 줄 스킵
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<!--')) continue;

    // 제약 항목: - 또는 * 로 시작
    const itemMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (itemMatch) {
      constraints.push({
        category: currentCategory,
        text: itemMatch[1],
      });
    }
  }

  return constraints;
}

/**
 * lessons.md에서 반복된 실패 패턴을 추출하여 제약으로 변환한다.
 *
 * 추출 기준:
 *   - "금지", "하지 말 것", "주의", "반드시" 등의 키워드가 포함된 줄
 *   - 마크다운 리스트 항목 (- 또는 *)
 *
 * @param {string} raw - lessons.md 원문
 * @returns {string[]} 추출된 패턴 목록
 */
export function extractLessonPatterns(raw) {
  const patterns = [];
  const seen = new Set();

  const actionKeywords = /금지|하지\s*말|주의|반드시|never|always|must|avoid|don'?t|do not|禁止/i;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    // 리스트 항목만 검사
    const itemMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (!itemMatch) continue;

    const text = itemMatch[1];

    // 액션 키워드가 포함된 항목만 추출
    if (actionKeywords.test(text)) {
      // 중복 방지 (앞 30자 기준)
      const key = text.substring(0, 30).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        patterns.push(text);
      }
    }
  }

  // 최대 20개로 제한 (프롬프트 길이 관리)
  return patterns.slice(0, 20);
}
