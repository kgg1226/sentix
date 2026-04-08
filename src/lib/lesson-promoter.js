/**
 * lesson-promoter.js — 반복 패턴 3회 감지 → .claude/rules/ 자동 생성
 *
 * tasks/lessons.md의 섹션을 분석하여 동일 패턴이 3회 이상 반복되면
 * 해당 패턴을 .claude/rules/auto-*.md 로 자동 승격시킨다.
 *
 * "Write rules for yourself that prevent the same mistake"
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const THRESHOLD = 3;

/**
 * lessons.md에서 섹션(## 헤더 단위)을 추출한다.
 */
function extractLessons(content) {
  const sections = [];
  const parts = content.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const lines = part.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();
    if (title && body) {
      sections.push({ title, body });
    }
  }
  return sections;
}

/**
 * 섹션에서 키워드를 추출한다. (간단한 명사 기반 매칭)
 */
function extractKeywords(section) {
  const text = (section.title + ' ' + section.body).toLowerCase();
  const keywords = new Set();

  const patterns = [
    /ci\/?cd|workflow|github actions/g,
    /npm|publish|provenance|token/g,
    /version|bump|changelog|semver/g,
    /test|snapshot|verify|gate/g,
    /worktree|branch|merge|rebase/g,
    /safety|lockdown|recovery/g,
    /agent|planner|dev-fix|pr-review/g,
    /hook|trigger|config/g,
    /yaml|json|toml|markdown/g,
    /pipeline|phase|cycle/g,
  ];

  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) {
      for (const m of matches) keywords.add(m);
    }
  }

  return Array.from(keywords);
}

/**
 * 모든 교훈에서 키워드 빈도를 집계한다.
 */
export function analyzeLessonPatterns(cwd) {
  const lessonsPath = resolve(cwd, 'tasks/lessons.md');
  if (!existsSync(lessonsPath)) return [];

  const content = readFileSync(lessonsPath, 'utf-8');
  const sections = extractLessons(content);

  const keywordCount = new Map();
  const keywordSections = new Map();

  for (const section of sections) {
    const keywords = extractKeywords(section);
    for (const kw of keywords) {
      keywordCount.set(kw, (keywordCount.get(kw) || 0) + 1);
      if (!keywordSections.has(kw)) keywordSections.set(kw, []);
      keywordSections.get(kw).push(section);
    }
  }

  const repeated = [];
  for (const [keyword, count] of keywordCount.entries()) {
    if (count >= THRESHOLD) {
      repeated.push({ keyword, count, sections: keywordSections.get(keyword) });
    }
  }

  return repeated;
}

/**
 * 반복 패턴에 대한 규칙 파일 슬러그를 생성한다.
 */
function slugify(keyword) {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

/**
 * 이미 같은 키워드로 auto-rule이 있으면 덮어쓰지 않고 날짜만 갱신.
 */
function ruleExists(cwd, slug) {
  const rulesDir = resolve(cwd, '.claude/rules');
  if (!existsSync(rulesDir)) return false;

  try {
    const files = readdirSync(rulesDir);
    return files.includes(`auto-${slug}.md`);
  } catch {
    return false;
  }
}

/**
 * 반복 패턴을 .claude/rules/auto-*.md 로 승격한다.
 */
export function promoteRepeatedLessons(cwd) {
  const repeated = analyzeLessonPatterns(cwd);
  const promoted = [];

  if (repeated.length === 0) return promoted;

  const rulesDir = resolve(cwd, '.claude/rules');
  mkdirSync(rulesDir, { recursive: true });

  for (const { keyword, count, sections } of repeated) {
    const slug = slugify(keyword);
    if (!slug) continue;
    if (ruleExists(cwd, slug)) continue;

    // 관련 교훈의 제목과 핵심 라인만 추출
    const summary = sections
      .slice(0, 5)
      .map(s => `- **${s.title}** — ${s.body.split('\n')[0].slice(0, 120)}`)
      .join('\n');

    const ruleContent = `---
description: "${keyword} 관련 작업 시 자동 로드 (lessons.md에서 ${count}회 반복 감지)"
---

# Auto-Generated Rule: ${keyword}

> 이 파일은 lessons.md에서 동일 패턴이 ${count}회 반복되어 자동 생성됨.
> 수동 편집 가능하지만, 같은 패턴이 또 반복되면 덮어쓰지 않고 업데이트됨.

## Observed Failures

${summary}

## Prevention Rules

1. ${keyword} 관련 작업 전에 lessons.md의 해당 패턴 먼저 확인
2. 같은 실수 반복 시 재계획(replan) 트리거
3. 수정 전 반드시 테스트 스냅샷 확보
`;

    const rulePath = join(rulesDir, `auto-${slug}.md`);
    writeFileSync(rulePath, ruleContent);
    promoted.push({ keyword, count, path: `auto-${slug}.md` });
  }

  return promoted;
}
