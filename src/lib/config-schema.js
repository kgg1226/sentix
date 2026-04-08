/**
 * Sentix Config Schema — 사용자 친화 키 메타데이터
 *
 * 이 스키마는 "수시 변경"하거나 "가끔 변경"하는 값만 포함한다.
 * 초기 1회만 설정하는 값 (예: runtime.mode, provider.default) 은 `sentix init` 소관.
 *
 * 각 항목:
 *   key        : dotted 단축키 (CLI에서 사용, 예: "pattern.min_confidence")
 *   label      : 한글 라벨 — "누가 봐도 알 수 있는 말"
 *   description: 1줄 설명 — 왜 필요한지 / 어떻게 동작하는지
 *   file       : 실제 파일 경로 (cwd 상대)
 *   section    : TOML 섹션 헤더 이름
 *   tomlKey    : 해당 섹션 내부 키 이름
 *   type       : 'bool' | 'int' | 'float' | 'enum'
 *   default    : 기본값 (스키마 수준)
 *   allowed    : (enum 전용) 허용값 배열
 *   min, max   : (숫자 전용) 범위
 *   group      : UI 그룹 이름 (한글)
 *   frequency  : 'frequent' | 'occasional' — 변경 빈도
 */

export const CONFIG_SCHEMA = [
  // ── 패턴 엔진 튜닝 ────────────────────────────────────
  {
    key: 'pattern.min_confidence',
    label: '패턴 감지 최소 신뢰도',
    description: '이 값 이상일 때만 pattern-log에 반복 패턴으로 기록 (0.0~1.0)',
    file: '.sentix/config.toml',
    section: 'layers.pattern_engine',
    tomlKey: 'min_confidence',
    type: 'float',
    min: 0, max: 1,
    default: 0.70,
    group: '패턴 엔진',
    frequency: 'occasional',
  },
  {
    key: 'pattern.preemptive_threshold',
    label: '선제 실행 임계값',
    description: '이 값 이상이면 pattern-engine이 사용자 요청 전에 자동 실행',
    file: '.sentix/config.toml',
    section: 'layers.pattern_engine',
    tomlKey: 'preemptive_threshold',
    type: 'float',
    min: 0, max: 1,
    default: 0.90,
    group: '패턴 엔진',
    frequency: 'occasional',
  },
  {
    key: 'pattern.decay_days',
    label: '패턴 소멸 기한 (일)',
    description: '이 기간 동안 발생하지 않은 패턴은 자동 제거',
    file: '.sentix/config.toml',
    section: 'layers.pattern_engine',
    tomlKey: 'decay_days',
    type: 'int',
    min: 1,
    default: 30,
    group: '패턴 엔진',
    frequency: 'occasional',
  },

  // ── 자가 진화 튜닝 ────────────────────────────────────
  {
    key: 'evolution.min_cycles',
    label: '자가 진화 시작 사이클 수',
    description: '이 사이클 수 이상 누적되면 자동 프롬프트 진화 분석 시작',
    file: '.sentix/config.toml',
    section: 'layers.evolution',
    tomlKey: 'min_cycles_for_evolution',
    type: 'int',
    min: 1,
    default: 50,
    group: '자가 진화',
    frequency: 'occasional',
  },

  // ── 버전 정책 ────────────────────────────────────────
  {
    key: 'version.auto_bump',
    label: '버전 자동 범프',
    description: '파이프라인 완료 후 package.json 버전을 커밋 유형(feat/fix)에 따라 자동 범프',
    file: '.sentix/config.toml',
    section: 'version',
    tomlKey: 'auto_bump',
    type: 'bool',
    default: true,
    group: '버전 정책',
    frequency: 'occasional',
  },

  // ── 에이전트 자동 승인 (수시 변경) ──────────────────
  {
    key: 'agent.dev.auto_accept',
    label: 'dev 자동 승인',
    description: '사람 확인 없이 dev 에이전트의 구현 결과를 자동 수락',
    file: 'agent-profiles/default.toml',
    section: 'dev',
    tomlKey: 'auto_accept',
    type: 'bool',
    default: true,
    group: '에이전트 승인',
    frequency: 'frequent',
  },
  {
    key: 'agent.dev-fix.auto_accept',
    label: 'dev-fix 자동 승인',
    description: '사람 확인 없이 dev-fix 에이전트의 수정 결과를 자동 수락',
    file: 'agent-profiles/default.toml',
    section: 'dev-fix',
    tomlKey: 'auto_accept',
    type: 'bool',
    default: true,
    group: '에이전트 승인',
    frequency: 'frequent',
  },
  {
    key: 'agent.pr-review.auto_accept',
    label: 'pr-review 자동 승인',
    description: '사람 확인 없이 pr-review 판정(APPROVED)을 자동 반영',
    file: 'agent-profiles/default.toml',
    section: 'pr-review',
    tomlKey: 'auto_accept',
    type: 'bool',
    default: true,
    group: '에이전트 승인',
    frequency: 'frequent',
  },
  {
    key: 'agent.planner.auto_accept',
    label: 'planner 자동 승인',
    description: '사람 확인 없이 planner가 생성한 티켓을 자동 진행',
    file: 'agent-profiles/default.toml',
    section: 'planner',
    tomlKey: 'auto_accept',
    type: 'bool',
    default: true,
    group: '에이전트 승인',
    frequency: 'frequent',
  },
];

/** Lookup a schema entry by its short key. */
export function findSchemaEntry(key) {
  return CONFIG_SCHEMA.find((e) => e.key === key);
}

/** Group entries by their `group` field, preserving insertion order. */
export function groupSchema() {
  const groups = new Map();
  for (const entry of CONFIG_SCHEMA) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  return groups;
}

/**
 * Coerce a user-supplied string value to the schema's type, validating bounds.
 * Throws Error on validation failure with a human-readable message.
 */
export function coerceValue(entry, rawValue) {
  const s = String(rawValue).trim();
  switch (entry.type) {
    case 'bool': {
      if (s === 'true' || s === '1' || s === 'on' || s === 'yes') return true;
      if (s === 'false' || s === '0' || s === 'off' || s === 'no') return false;
      throw new Error(`"${rawValue}" 는 bool 이 아닙니다 (true/false)`);
    }
    case 'int': {
      if (!/^-?\d+$/.test(s)) throw new Error(`"${rawValue}" 는 정수가 아닙니다`);
      const n = parseInt(s, 10);
      if (entry.min !== undefined && n < entry.min) throw new Error(`${entry.label}: 최솟값 ${entry.min}`);
      if (entry.max !== undefined && n > entry.max) throw new Error(`${entry.label}: 최댓값 ${entry.max}`);
      return n;
    }
    case 'float': {
      if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`"${rawValue}" 는 숫자가 아닙니다`);
      const n = parseFloat(s);
      if (entry.min !== undefined && n < entry.min) throw new Error(`${entry.label}: 최솟값 ${entry.min}`);
      if (entry.max !== undefined && n > entry.max) throw new Error(`${entry.label}: 최댓값 ${entry.max}`);
      return n;
    }
    case 'enum': {
      if (!entry.allowed.includes(s)) {
        throw new Error(`${entry.label}: 허용값 ${entry.allowed.join(', ')}`);
      }
      return s;
    }
    default:
      throw new Error(`Unknown schema type: ${entry.type}`);
  }
}
