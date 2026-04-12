/**
 * pattern-engine.js — 사용 패턴 분석 엔진 (Layer 3 Pattern Engine)
 *
 * pattern-log.jsonl의 이벤트를 분석하여 반복 패턴을 감지하고,
 * patterns.md에 자동 기록한다. 기록된 패턴은 buildLearningContext()를
 * 통해 planner/dev 프롬프트에 주입된다.
 *
 * 감지하는 패턴 유형:
 *   1. 요청 빈도 — 어떤 종류의 요청이 가장 많은가
 *   2. 순서 패턴 — 어떤 명령어가 연속으로 실행되는가
 *   3. 실패 패턴 — 어떤 요청이 자주 실패하는가
 *   4. 시간 패턴 — 특정 시간대에 집중되는 요청이 있는가
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIN_OCCURRENCES = 2;  // 패턴으로 인정할 최소 발생 횟수

/**
 * pattern-log.jsonl을 파싱한다.
 * @param {string} cwd
 * @returns {object[]} 이벤트 배열
 */
export function loadPatternLog(cwd) {
  const logPath = resolve(cwd, 'tasks/pattern-log.jsonl');
  if (!existsSync(logPath)) return [];

  try {
    const content = readFileSync(logPath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 이벤트 로그에서 모든 패턴을 분석한다.
 * @param {object[]} events
 * @returns {object} { requestPatterns, sequencePatterns, failurePatterns, summary }
 */
export function analyzePatterns(events) {
  if (!events || events.length === 0) {
    return { requestPatterns: [], sequencePatterns: [], failurePatterns: [], summary: 'No events to analyze' };
  }

  const requestPatterns = analyzeRequestFrequency(events);
  const sequencePatterns = analyzeSequences(events);
  const failurePatterns = analyzeFailures(events);

  const summary = `Analyzed ${events.length} events: ${requestPatterns.length} request patterns, ${sequencePatterns.length} sequence patterns, ${failurePatterns.length} failure patterns`;

  return { requestPatterns, sequencePatterns, failurePatterns, summary };
}

/**
 * 요청 빈도 분석 — 어떤 종류의 요청이 가장 많은가
 */
function analyzeRequestFrequency(events) {
  const requestEvents = events.filter(e => e.event === 'request');
  if (requestEvents.length < MIN_OCCURRENCES) return [];

  // 요청 유형별 집계
  const typeCounts = new Map();
  for (const e of requestEvents) {
    const type = categorizeRequest(e.input || '');
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }

  return Array.from(typeCounts.entries())
    .filter(([, count]) => count >= MIN_OCCURRENCES)
    .map(([type, count]) => ({
      type: 'request-frequency',
      category: type,
      count,
      ratio: Math.round(count / requestEvents.length * 100),
      description: `"${type}" 요청이 전체의 ${Math.round(count / requestEvents.length * 100)}% (${count}/${requestEvents.length})`,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 순서 패턴 분석 — 연속으로 실행되는 명령어 쌍
 */
function analyzeSequences(events) {
  const commandEvents = events.filter(e => e.event === 'command:start' && e.command);
  if (commandEvents.length < 3) return [];

  // 연속 명령 쌍 집계
  const pairCounts = new Map();
  for (let i = 0; i < commandEvents.length - 1; i++) {
    const pair = `${commandEvents[i].command} → ${commandEvents[i + 1].command}`;
    pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
  }

  return Array.from(pairCounts.entries())
    .filter(([, count]) => count >= MIN_OCCURRENCES)
    .map(([pair, count]) => ({
      type: 'sequence',
      pair,
      count,
      description: `"${pair}" 순서가 ${count}회 반복`,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 실패 패턴 분석 — 자주 실패하는 요청/명령
 */
function analyzeFailures(events) {
  const failures = events.filter(e =>
    e.event === 'pipeline-failed' || e.event === 'safety-denied'
  );
  if (failures.length === 0) return [];

  // 실패 유형별 집계
  const failureCounts = new Map();
  for (const e of failures) {
    const key = e.error || e.event;
    failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
  }

  return Array.from(failureCounts.entries())
    .map(([reason, count]) => ({
      type: 'failure',
      reason: reason.slice(0, 100),
      count,
      description: `실패 "${reason.slice(0, 60)}": ${count}회`,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 요청 텍스트를 카테고리로 분류한다.
 */
function categorizeRequest(input) {
  const lower = input.toLowerCase();
  if (/bug|fix|버그|수정|에러|error|crash/.test(lower)) return 'bug-fix';
  if (/feature|기능|추가|만들|구현|add|create/.test(lower)) return 'feature';
  if (/refactor|리팩터|정리|개선|clean/.test(lower)) return 'refactor';
  if (/test|테스트|검증/.test(lower)) return 'testing';
  if (/doc|문서|readme/.test(lower)) return 'docs';
  if (/version|버전|bump|release/.test(lower)) return 'version';
  if (/pipeline|파이프라인|진행/.test(lower)) return 'pipeline-execution';
  return 'other';
}

/**
 * 분석 결과를 patterns.md 형식으로 포맷한다.
 * @param {object} analysis - analyzePatterns() 결과
 * @returns {string} markdown 내용
 */
export function formatPatternsMarkdown(analysis) {
  const lines = [
    '# 사용자 패턴 분석',
    '',
    `> 자동 생성됨 (${new Date().toISOString().split('T')[0]}). pattern-log.jsonl 기반.`,
    '',
  ];

  if (analysis.requestPatterns.length > 0) {
    lines.push('## 요청 빈도');
    lines.push('');
    for (const p of analysis.requestPatterns) {
      lines.push(`- ${p.description}`);
    }
    lines.push('');
  }

  if (analysis.sequencePatterns.length > 0) {
    lines.push('## 자주 반복되는 명령 순서');
    lines.push('');
    for (const p of analysis.sequencePatterns) {
      lines.push(`- ${p.description}`);
    }
    lines.push('');
  }

  if (analysis.failurePatterns.length > 0) {
    lines.push('## 실패 패턴');
    lines.push('');
    for (const p of analysis.failurePatterns) {
      lines.push(`- ${p.description}`);
    }
    lines.push('');
  }

  if (analysis.requestPatterns.length === 0 &&
      analysis.sequencePatterns.length === 0 &&
      analysis.failurePatterns.length === 0) {
    lines.push('아직 충분한 데이터가 없습니다. 파이프라인을 더 사용하면 패턴이 감지됩니다.');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 패턴 분석을 실행하고 patterns.md를 업데이트한다.
 * @param {string} cwd
 * @returns {object} { patternsFound: number, updated: boolean }
 */
export function updatePatterns(cwd) {
  const events = loadPatternLog(cwd);
  const analysis = analyzePatterns(events);

  const total = analysis.requestPatterns.length +
    analysis.sequencePatterns.length +
    analysis.failurePatterns.length;

  if (total === 0) {
    return { patternsFound: 0, updated: false, summary: analysis.summary };
  }

  const markdown = formatPatternsMarkdown(analysis);
  const patternsPath = resolve(cwd, 'tasks/patterns.md');
  writeFileSync(patternsPath, markdown);

  return { patternsFound: total, updated: true, summary: analysis.summary };
}
