/**
 * feedback-loop.js — Quality Gate 실패 → constraints.md 자동 추가
 *
 * Quality Gate에서 발견된 이슈를 분석하여 .sentix/constraints.md의
 * "Patterns from Lessons" 섹션에 자동으로 추가한다.
 *
 * 선순환 구조:
 *   Quality Gate 실패 → 패턴 추출 → constraints.md 추가
 *   → 다음 파이프라인에서 planner/dev에 주입 → 같은 실수 예방
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SECTION_MARKER = '## Patterns from Lessons';
const MAX_AUTO_ENTRIES = 50; // constraints 파일이 무한히 커지는 것 방지

/**
 * Quality Gate 결과에서 실패한 이슈를 constraints.md에 자동 추가한다.
 *
 * @param {string} cwd - Working directory
 * @param {object} gateResults - runQualityGate() 반환값
 * @returns {object} { added: string[], skipped: number }
 */
export function feedbackToConstraints(cwd, gateResults) {
  const result = { added: [], skipped: 0 };

  if (!gateResults || gateResults.passed) {
    return result; // 통과했으면 추가할 것 없음
  }

  const constraintsPath = resolve(cwd, '.sentix/constraints.md');
  if (!existsSync(constraintsPath)) {
    return result; // constraints 파일 없으면 스킵
  }

  // 실패 이슈에서 constraint 항목 생성
  const newEntries = extractConstraintEntries(gateResults);
  if (newEntries.length === 0) {
    return result;
  }

  // 기존 constraints 읽기
  const content = readFileSync(constraintsPath, 'utf-8');

  // 이미 존재하는 항목 필터링 (중복 방지)
  const existingLower = content.toLowerCase();
  const toAdd = [];
  for (const entry of newEntries) {
    const key = extractKey(entry);
    if (existingLower.includes(key.toLowerCase())) {
      result.skipped++;
    } else {
      toAdd.push(entry);
    }
  }

  if (toAdd.length === 0) {
    return result;
  }

  // 현재 auto 항목 수 확인 (상한 초과 방지)
  const currentAutoCount = countAutoEntries(content);
  const remaining = MAX_AUTO_ENTRIES - currentAutoCount;
  const entriesToWrite = toAdd.slice(0, Math.max(0, remaining));

  if (entriesToWrite.length === 0) {
    result.skipped += toAdd.length;
    return result;
  }

  // constraints.md에 추가
  const updatedContent = appendToSection(content, entriesToWrite);
  writeFileSync(constraintsPath, updatedContent);

  result.added = entriesToWrite;
  result.skipped += toAdd.length - entriesToWrite.length;

  return result;
}

/**
 * Quality Gate 결과에서 constraint 항목을 추출한다.
 *
 * @param {object} gateResults - runQualityGate() 반환값
 * @returns {string[]} constraint 항목 목록
 */
export function extractConstraintEntries(gateResults) {
  const entries = [];
  const seen = new Set();

  for (const check of gateResults.checks) {
    for (const issue of check.issues) {
      if (issue.severity !== 'error') continue; // warning은 스킵

      const entry = issueToConstraint(check.name, issue);
      if (entry && !seen.has(entry)) {
        seen.add(entry);
        entries.push(entry);
      }
    }
  }

  return entries;
}

/**
 * 개별 이슈를 constraint 문자열로 변환한다.
 */
function issueToConstraint(checkName, issue) {
  switch (checkName) {
    case 'banned-patterns':
      return `${issue.message} (${issue.pattern} in ${issue.file || 'unknown'})`;

    case 'no-debug-artifacts':
      return `console.log 사용 금지 — ${issue.file || 'production code'}에서 발견됨`;

    case 'syntax-check':
      return `구문 오류 방지 — ${issue.file || 'unknown'}: ${issue.message}`;

    case 'npm-audit':
      return `보안 취약점 해결 필수 — ${issue.message}`;

    case 'test-regression':
      return `테스트 회귀 금지 — ${issue.message}`;

    default:
      return issue.message ? `[${checkName}] ${issue.message}` : null;
  }
}

/**
 * constraint 항목에서 중복 검사용 키를 추출한다.
 * (앞 40자를 정규화하여 비교)
 */
function extractKey(entry) {
  return entry.substring(0, 40).replace(/\s+/g, ' ').trim();
}

/**
 * "Patterns from Lessons" 섹션의 auto 항목 수를 센다.
 */
function countAutoEntries(content) {
  const sectionIdx = content.indexOf(SECTION_MARKER);
  if (sectionIdx === -1) return 0;

  const afterSection = content.slice(sectionIdx + SECTION_MARKER.length);
  // 다음 ## 헤더 전까지의 - 항목을 센다
  const nextSection = afterSection.indexOf('\n## ');
  const sectionBody = nextSection !== -1
    ? afterSection.slice(0, nextSection)
    : afterSection;

  return (sectionBody.match(/^- /gm) || []).length;
}

/**
 * constraints.md의 "Patterns from Lessons" 섹션에 항목을 추가한다.
 */
function appendToSection(content, entries) {
  const sectionIdx = content.indexOf(SECTION_MARKER);

  if (sectionIdx === -1) {
    // 섹션이 없으면 파일 끝에 추가
    const newSection = `\n${SECTION_MARKER}\n\n${entries.map((e) => `- ${e}`).join('\n')}\n`;
    return content.trimEnd() + '\n' + newSection;
  }

  // 섹션 끝 위치 찾기 (다음 ## 또는 파일 끝)
  const afterSection = content.slice(sectionIdx + SECTION_MARKER.length);
  const nextSectionIdx = afterSection.indexOf('\n## ');
  const insertIdx = nextSectionIdx !== -1
    ? sectionIdx + SECTION_MARKER.length + nextSectionIdx
    : content.length;

  // 기존 내용 끝에 새 항목 추가
  const before = content.slice(0, insertIdx).trimEnd();
  const after = content.slice(insertIdx);
  const timestamp = new Date().toISOString().split('T')[0];
  const newLines = entries.map((e) => `- [${timestamp}] ${e}`).join('\n');

  return before + '\n' + newLines + '\n' + after;
}
