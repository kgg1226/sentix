# Sentix Visual Perception Engine

> AI는 코드를 읽는다. 인간은 화면을 본다.
> 이 격차를 사용자로부터 배워서 메운다.

---

## 문제

AI 에이전트가 대시보드를 만들고, 리포트를 생성하고, UI를 구성할 때:

```
AI가 보는 것:                     사용자가 보는 것:
─────────────                    ─────────────
font-size: 14px                  "글씨가 작아서 안 보여"
color: #ff5c5c                   "이 빨간색이 불안해"
grid-template-columns: 1fr 280px "오른쪽에 뭐가 있는지 모르겠어"
padding: 8px                     "너무 빡빡해"
z-index: 10                      "이게 왜 가려지지?"
border: 1px solid #232840        "구분이 안 돼"
```

AI는 코드가 문법적으로 올바르면 "완성"이라고 판단한다.
사용자는 화면이 **눈에 편해야** "완성"이라고 판단한다.

이 간극은 사용자의 피드백에서만 배울 수 있다.

---

## 학습 대상

### 1. 정보 위계 (Information Hierarchy)

사용자가 화면에서 **가장 먼저 보는 것**이 뭔지.

```
수집 데이터:
- 사용자가 "이거 어디 있어?"라고 물은 항목 → 눈에 안 띄는 위치에 있었다
- 사용자가 "이거 맨 위에 올려줘"라고 한 항목 → 우선순위가 높은 정보
- 사용자가 언급하지 않은 항목 → 적절한 위치이거나 불필요한 항목

패턴화:
  [hierarchy] security severity → 최상단 선호 (5/5)
  [hierarchy] deploy status → 헤더 영역 선호 (4/5)
  [hierarchy] lessons.md → 사이드바 허용 (3/5)
  [hierarchy] retry counter → 인라인 뱃지 선호 (4/5)
```

### 2. 밀도 선호 (Density Preference)

화면에 정보가 얼마나 빽빽한 걸 선호하는지.

```
수집 데이터:
- "너무 빡빡해" / "간격 넓혀줘" → spacious 선호
- "한 화면에 다 보여줘" / "스크롤 싫어" → dense 선호
- "접어줘" / "펼쳐줘" → collapsible 선호

패턴화:
  [density] overall: spacious (padding ≥ 16px 선호) — confidence 0.80
  [density] code-blocks: dense (줄간격 최소화) — confidence 0.70
  [density] agent-cards: medium — confidence 0.60
```

### 3. 색상/대비 선호 (Color & Contrast)

어떤 색 조합에서 편안함을 느끼는지.

```
수집 데이터:
- "이 빨간색 너무 쎄" → 채도 낮춰야 함
- "구분이 안 돼" → 대비 높여야 함
- "다크 모드 좋아" → 어두운 배경 선호
- "이 색 맘에 든다" → 해당 색상 기록

패턴화:
  [color] background: dark (C.bg #0c0e14 이하) — confidence 0.90
  [color] severity-critical: muted red 선호 (#ff5c5c → #e04040) — confidence 0.75
  [color] accent: blue 계열 선호 — confidence 0.85
  [color] contrast: high (border 눈에 보이게) — confidence 0.70
```

### 4. 타이포그래피 선호 (Typography)

글꼴, 크기, 무게에 대한 선호.

```
수집 데이터:
- "글씨 키워줘" → 기본 폰트 사이즈 상향
- "코드 부분 잘 안 보여" → monospace 폰트 크기 별도 조정 필요
- "굵은 글씨 너무 많아" → bold 사용 절제

패턴화:
  [typography] body-size: 15px 선호 (기본 14px에서 상향 요청 3/4) — confidence 0.75
  [typography] monospace-size: 13px 이상 — confidence 0.80
  [typography] heading-weight: 600 (700은 "무거워" 피드백) — confidence 0.65
```

### 5. 인터랙션 선호 (Interaction)

어떻게 조작하는 걸 선호하는지.

```
수집 데이터:
- 탭/토글을 자주 쓰는지, 스크롤을 선호하는지
- "자동으로 해줘" vs "확인 후 실행"
- "접어둬" → 기본값 collapsed 선호
- 클릭 vs 키보드 단축키 선호

패턴화:
  [interaction] default-state: collapsed (agent cards) — confidence 0.70
  [interaction] auto-scroll: enabled (새 출력 시 자동 스크롤) — confidence 0.85
  [interaction] confirmation: minimal (critical만) — confidence 0.90
```

---

## 수집 메커니즘

### 명시적 피드백 (사용자가 직접 말함)

```
사용자: "이 대시보드 글씨 너무 작아"
→ [typography] body-size: increase requested
→ context: dashboard, current: 14px

사용자: "severity 뱃지가 눈에 안 띄어"
→ [color] severity-badge: contrast increase requested
→ [hierarchy] severity: visibility issue

사용자: "오른쪽 사이드바 안 봐"
→ [hierarchy] sidebar: low attention
→ [density] sidebar: could be collapsed or removed
```

### 암묵적 피드백 (행동에서 추론)

```
사용자가 생성된 결과물을 수정 요청 없이 수락
→ 현재 스타일 설정에 +1 confidence

사용자가 "다시 해줘" + 시각적 변경 요청
→ 해당 속성에 대한 선호도 데이터 수집

사용자가 특정 섹션을 반복적으로 펼쳐봄
→ 해당 섹션 기본값 expanded로 학습

사용자가 특정 정보를 "이거 어디 있어?"로 찾음
→ 해당 정보의 위계 상향 필요
```

### 비교 피드백 (A/B에서 추론)

```
동일 정보를 다른 레이아웃으로 제시했을 때:
사용자가 A를 선택 → A의 스타일 속성 +1
사용자가 "둘 다 아니야" → 새로운 조합 탐색

시뮬레이터 v1 → v2로 변경 시:
사용자가 v2에 대해 불만 없음 → v2 스타일 기록
사용자가 "전 게 나았어" → v1 스타일 복원 + 기록
```

---

## 저장 구조

```
tasks/
├── visual-preferences.md    ← 학습된 시각 선호도 (pattern-engine이 관리)
└── pattern-log.jsonl        ← 기존 행동 로그에 시각 피드백도 추가

visual-preferences.md 예시:
─────────────────────

# Visual Preferences — auto-learned from user feedback

## Information Hierarchy
- security severity: TOP (confidence 0.90)
- deploy status: HEADER (confidence 0.85)
- pipeline log: SIDEBAR (confidence 0.80)
- lessons: SIDEBAR-COLLAPSED (confidence 0.70)

## Density
- overall: spacious (confidence 0.80)
- code-blocks: compact (confidence 0.75)
- agent-cards: medium, collapsible (confidence 0.70)

## Color
- theme: dark (confidence 0.95)
- severity-critical: #e04040 (confidence 0.75)
- severity-warning: #ffc145 (confidence 0.80)
- accent: #6c8cff (confidence 0.85)

## Typography
- body: 15px (confidence 0.75)
- monospace: 13px (confidence 0.80)
- heading-weight: 600 (confidence 0.65)

## Interaction
- agent-cards-default: collapsed (confidence 0.70)
- auto-scroll: true (confidence 0.85)
- confirmation-level: critical-only (confidence 0.90)
```

---

## 적용 방식

### 대시보드/시뮬레이터 생성 시

```
1. visual-preferences.md 로드
2. confidence ≥ 0.70인 선호도를 CSS 변수로 변환:
   
   --body-font-size: 15px;      /* [typography] body: 15px, conf 0.75 */
   --card-padding: 16px;        /* [density] spacious, conf 0.80 */
   --severity-critical: #e04040; /* [color] muted red, conf 0.75 */

3. 컴포넌트 기본 상태 설정:
   agentCard.defaultExpanded = false;  /* [interaction] collapsed, conf 0.70 */

4. 정보 배치 순서 결정:
   layout.top = severityBadges;  /* [hierarchy] severity: TOP, conf 0.90 */
   layout.header = deployStatus; /* [hierarchy] deploy: HEADER, conf 0.85 */
```

### 리포트/문서 생성 시

```
security-report.md 생성할 때:
- severity: critical → 문서 최상단 (hierarchy 학습)
- 코드 블록 → 컴팩트 포매팅 (density 학습)
- 요약 → 상세 앞에 배치 (사용자가 "요약부터 보여줘" 패턴)
```

### 배포 스크립트 출력 시 (manual 모드)

```
tasks/deploy-output.md 생성할 때:
- 단계 번호를 크게 표시 (hierarchy 학습)
- 실행 명령은 코드 블록으로 (density 학습)  
- 성공/실패 예상 결과를 색상으로 구분 (color 학습)
```

---

## 패턴 엔진과의 관계

```
pattern-engine:
├── 행동 패턴 (patterns.md)
│   → "이 사용자는 다음에 뭘 요청할 것인가"
│   → 선제 준비
│
└── 시각 패턴 (visual-preferences.md)
    → "이 사용자는 결과물을 어떻게 보고 싶어하는가"
    → 생성 시점에 반영

두 패턴은 독립적으로 수집되지만 함께 적용된다:
- 행동 패턴이 "보안 스캔 선제 실행"을 결정하면
- 시각 패턴이 "그 결과를 어떤 형태로 보여줄지"를 결정한다
```

---

## 핵심 원칙

```
1. AI는 스스로 "잘 만들었다"고 판단하지 않는다
   → 코드가 올바른 것과 사용자 눈에 좋은 것은 다른 문제다
   → 사용자가 수정 요청 없이 수락해야 비로소 "잘 만든 것"이다

2. 시각 선호도는 명시적으로 묻지 않는다
   → "폰트 크기 몇 원하세요?"라고 묻지 않는다
   → 사용자의 피드백과 행동에서 추론한다
   → "글씨 키워줘"라는 말에서 typography.body-size를 학습한다

3. 학습은 점진적이다
   → 첫 번째 결과물은 기본값으로 생성
   → 피드백마다 선호도가 축적
   → 5-10회 상호작용 후 사용자 맞춤 생성이 가능해진다

4. 틀려도 비용이 낮다
   → 잘못된 선호도로 생성해도 사용자가 피드백하면 즉시 수정
   → 수정 피드백 자체가 더 정확한 학습 데이터가 된다

5. 사용자마다 다르다
   → A 사용자는 spacious, B 사용자는 dense를 선호할 수 있다
   → visual-preferences.md는 프로젝트/사용자 단위로 관리
```

---

## 구현 우선순위

```
Phase 1: 명시적 피드백 수집
  - 사용자의 시각 관련 요청을 pattern-log.jsonl에 태깅
  - "키워줘", "줄여줘", "색 바꿔", "위에 올려" 등 키워드 감지

Phase 2: visual-preferences.md 생성
  - 피드백 10건 이상 축적 시 패턴 추출
  - confidence 기반 선호도 정리

Phase 3: 생성 시 자동 적용
  - 대시보드/리포트 생성 시 visual-preferences.md 참조
  - CSS 변수 자동 설정, 레이아웃 순서 자동 조정

Phase 4: 암묵적 피드백 추론
  - 수정 요청 없음 → 현재 값 강화
  - 반복적 수정 패턴 → 기본값 변경

Phase 5: 프로젝트 간 전이
  - 프로젝트 A에서 학습한 선호도를 프로젝트 B에 기본값으로 적용
  - (같은 사용자이므로 시각 선호도는 유사할 확률이 높음)
```
