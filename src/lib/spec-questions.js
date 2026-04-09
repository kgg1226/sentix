/**
 * spec-questions.js — 요청 분석 + 구조화 질문 생성
 *
 * 사용자의 빈약한 요청을 분석하여 planner가 반드시 확인해야 할
 * 구조화된 질문을 생성한다. planner 프롬프트에 주입되어
 * "빈약한 입력 → 빈약한 계획" 패턴을 방지한다.
 *
 * 동작 방식:
 *   1. 요청 텍스트에서 누락된 정보 카테고리를 감지
 *   2. 누락된 카테고리에 대한 질문을 생성
 *   3. planner에게 "이 질문에 먼저 답한 후 계획을 세워라" 지시
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

// ── 정보 카테고리와 감지 패턴 ────────────────────────────

const INFO_CATEGORIES = [
  {
    id: 'target-user',
    label: '대상 사용자',
    question: '이 기능/수정의 대상 사용자는 누구인가? (개발자, 최종 사용자, 관리자 등)',
    detectedBy: /사용자|유저|user|대상|타겟|target|고객|customer|개발자|admin/i,
  },
  {
    id: 'error-detail',
    label: '에러 상세',
    question: '어떤 에러가 발생하는가? (에러 메시지, 스택 트레이스, 재현 조건)',
    appliesTo: 'bug',
    detectedBy: /에러|error|exception|stack|trace|재현|reproduce|crash|크래시|실패|fail/i,
  },
  {
    id: 'acceptance-criteria',
    label: '완료 기준',
    question: '이 작업이 "완료"되었음을 어떻게 확인할 수 있는가? (구체적인 동작, 출력, 상태)',
    detectedBy: /완료|기준|criteria|확인|verify|동작|동작해야|결과|expect|expected/i,
  },
  {
    id: 'edge-cases',
    label: '엣지 케이스',
    question: '고려해야 할 예외 상황이 있는가? (빈 입력, 대용량, 동시 접근, 네트워크 실패 등)',
    detectedBy: /엣지|edge|예외|exception|빈|empty|대용량|large|동시|concurrent|타임아웃|timeout/i,
  },
  {
    id: 'performance',
    label: '성능 요구',
    question: '성능 제약이 있는가? (응답 시간, 메모리 제한, 파일 크기 제한 등)',
    detectedBy: /성능|performance|속도|speed|빠른|fast|느린|slow|메모리|memory|timeout/i,
  },
  {
    id: 'backwards-compat',
    label: '하위 호환성',
    question: '기존 API/인터페이스와의 호환성을 유지해야 하는가? 의존하는 모듈이 있는가?',
    detectedBy: /호환|compat|의존|depend|import|require|breaking|migration|기존/i,
  },
  {
    id: 'scope-boundary',
    label: '범위 경계',
    question: '이 작업의 범위는 어디까지인가? 명시적으로 하지 않아야 할 것은?',
    detectedBy: /범위|scope|boundary|제외|exclude|제한|limit|까지|only|만/i,
  },
];

// ── 요청 유형 감지 ──────────────────────────────────────

const REQUEST_TYPES = [
  { type: 'bug', pattern: /버그|에러|수정|fix|crash|bug|error|안됨|작동.*안|실패/i },
  { type: 'feature', pattern: /추가|기능|feature|구현|만들|생성|create|add|새/i },
  { type: 'refactor', pattern: /리팩터|refactor|정리|개선|improve|clean/i },
  { type: 'docs', pattern: /문서|doc|readme|설명|comment/i },
];

/**
 * 요청 텍스트를 분석하여 누락된 정보에 대한 질문 블록을 생성한다.
 *
 * @param {string} request - 사용자 요청 텍스트
 * @returns {object} { questions: Array, specDirective: string, requestType: string }
 */
export function analyzeRequest(request) {
  const requestType = detectRequestType(request);
  const wordCount = request.split(/\s+/).filter(Boolean).length;
  const questions = [];

  for (const cat of INFO_CATEGORIES) {
    // 요청 유형 필터 (bug-only 카테고리 등)
    if (cat.appliesTo && cat.appliesTo !== requestType) continue;

    // 이미 요청에 해당 정보가 포함되어 있으면 스킵
    if (cat.detectedBy.test(request)) continue;

    questions.push({
      id: cat.id,
      label: cat.label,
      question: cat.question,
    });
  }

  // 매우 짧은 요청이면 추가 경고
  const brevityWarning = wordCount <= 5
    ? '⚠ 이 요청은 매우 짧습니다 (5단어 이하). 아래 질문에 최대한 답하여 계획을 구체화하세요.'
    : '';

  const specDirective = buildSpecDirective(questions, requestType, brevityWarning);

  return { questions, specDirective, requestType };
}

/**
 * 요청 유형 감지.
 * @returns {'bug' | 'feature' | 'refactor' | 'docs' | 'general'}
 */
export function detectRequestType(request) {
  for (const { type, pattern } of REQUEST_TYPES) {
    if (pattern.test(request)) return type;
  }
  return 'general';
}

/**
 * planner 프롬프트에 주입할 스펙 지시문을 생성한다.
 */
function buildSpecDirective(questions, requestType, brevityWarning) {
  if (questions.length === 0) {
    return ''; // 모든 정보가 이미 포함됨 — 추가 지시 불필요
  }

  const lines = [];
  lines.push('');
  lines.push('--- SPEC ENRICHMENT (planner 필수 확인 사항) ---');

  if (brevityWarning) {
    lines.push(brevityWarning);
  }

  lines.push(`요청 유형: ${requestType}`);
  lines.push(`누락 가능 정보 ${questions.length}건 — 계획 수립 전에 반드시 고려하세요:`);
  lines.push('');

  for (let i = 0; i < questions.length; i++) {
    lines.push(`  ${i + 1}. [${questions[i].label}] ${questions[i].question}`);
  }

  lines.push('');
  lines.push('위 질문에 답할 수 없는 항목은 "알 수 없음 — 보수적 접근" 으로 명시하세요.');
  lines.push('--- END SPEC ENRICHMENT ---');

  return lines.join('\n');
}
