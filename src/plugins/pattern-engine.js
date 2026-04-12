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

// ══════════════════════════════════════════════════════
// Phase 2: 패턴 기반 행동 지시문 생성
// ══════════════════════════════════════════════════════

/**
 * 패턴 분석 결과에서 planner/dev에게 전달할 구체적 행동 지시문을 생성한다.
 *
 * 단순한 "참고하세요"가 아니라 "이렇게 하세요"라는 구체적 지시.
 *
 * @param {string} cwd
 * @param {string} currentRequest - 현재 사용자 요청
 * @returns {string} 프롬프트에 주입할 지시문 블록
 */
export function generatePatternDirective(cwd, currentRequest) {
  const events = loadPatternLog(cwd);
  if (events.length < 3) return ''; // 데이터 부족

  const analysis = analyzePatterns(events);
  const directives = [];

  // 1. 순서 패턴 → 선제 제안
  for (const seq of analysis.sequencePatterns) {
    const [first] = seq.pair.split(' → ');
    // 현재 요청이 패턴의 첫 번째와 관련 있으면 다음 단계를 제안
    if (currentRequest.toLowerCase().includes(first) || isRelatedCommand(currentRequest, first)) {
      const [, next] = seq.pair.split(' → ');
      directives.push({
        type: 'sequence-suggest',
        confidence: Math.min(seq.count / 5, 1),
        directive: `이 사용자는 "${seq.pair}" 순서를 ${seq.count}회 반복했습니다. 현재 작업 완료 후 "${next}" 실행을 제안하세요.`,
      });
    }
  }

  // 2. 실패 패턴 → 사전 경고
  for (const fail of analysis.failurePatterns) {
    if (fail.count >= 2) {
      directives.push({
        type: 'failure-warning',
        confidence: Math.min(fail.count / 3, 1),
        directive: `⚠ 과거 실패 패턴: "${fail.reason.slice(0, 80)}". 같은 유형의 실패가 ${fail.count}회 발생했습니다. 이 영역에서 특별히 주의하세요.`,
      });
    }
  }

  // 3. 요청 빈도 → 전문화 힌트
  for (const req of analysis.requestPatterns) {
    if (req.ratio >= 40) { // 40% 이상 차지하는 요청 유형
      directives.push({
        type: 'specialization-hint',
        confidence: req.ratio / 100,
        directive: `이 프로젝트는 "${req.category}" 요청이 ${req.ratio}%를 차지합니다. ${getSpecializationAdvice(req.category)}`,
      });
    }
  }

  if (directives.length === 0) return '';

  // 신뢰도 순으로 정렬, 상위 5개만
  directives.sort((a, b) => b.confidence - a.confidence);
  const top = directives.slice(0, 5);

  const lines = [
    '',
    '--- PATTERN-BASED DIRECTIVES (과거 사용 패턴에서 학습) ---',
  ];
  for (const d of top) {
    lines.push(`- [${d.type}] ${d.directive}`);
  }
  lines.push('--- END PATTERN DIRECTIVES ---');

  return lines.join('\n');
}

/**
 * 현재 요청이 특정 명령과 관련 있는지 판단한다.
 */
function isRelatedCommand(request, command) {
  const lower = request.toLowerCase();
  const mapping = {
    feature: /feature|기능|추가|만들/,
    run: /run|실행|파이프라인/,
    ticket: /ticket|티켓|버그/,
    version: /version|버전|bump/,
    status: /status|상태/,
  };
  return mapping[command]?.test(lower) || false;
}

/**
 * 요청 유형별 전문화 조언을 반환한다.
 */
function getSpecializationAdvice(category) {
  const advice = {
    'bug-fix': '에러 재현 조건과 스택 트레이스를 먼저 확인하세요. 테스트 케이스를 먼저 작성한 후 수정하세요.',
    'feature': '기존 코드와의 호환성을 반드시 확인하세요. SCOPE를 최소한으로 유지하세요.',
    'refactor': '리팩터링 전 테스트 커버리지를 확인하세요. 동작 변경 없이 구조만 개선하세요.',
    'testing': '엣지 케이스와 실패 경로를 우선 테스트하세요.',
    'version': '커밋 메시지 기반으로 bump 유형을 자동 결정하세요.',
    'pipeline-execution': '이전 파이프라인 결과를 확인하고 중복 실행을 피하세요.',
  };
  return advice[category] || '과거 패턴을 참고하여 효율적으로 작업하세요.';
}
