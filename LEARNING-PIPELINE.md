# Sentix Learning Pipeline — 수집, 저장, 적용의 실체

> 학습 데이터는 어디서 발생하고, 어디에 저장되고, 누가 적용하는가.

---

## 데이터 흐름

```
사용자 피드백 (대화)
    │
    ▼
┌─────────────────────────────┐
│  1. 실시간 계층 (세션 내)      │  ← 즉시 반영, 휘발성
│  대화 컨텍스트에서 바로 적용    │
└──────────────┬──────────────┘
               │ 세션 종료 전 요약
               ▼
┌─────────────────────────────┐
│  2. 메모리 계층 (세션 간)      │  ← Claude 메모리, 다음 대화에서 참조
│  사용자 선호도 요약 저장        │
└──────────────┬──────────────┘
               │ 주기적 동기화
               ▼
┌─────────────────────────────┐
│  3. 프로젝트 계층 (영구)       │  ← git repo 파일, 모든 에이전트 접근 가능
│  visual-preferences.md       │
│  pattern-log.jsonl           │
└─────────────────────────────┘
```

---

## 계층 1: 실시간 (세션 내)

**저장소:** 대화 컨텍스트 (메시지 히스토리)
**수명:** 현재 대화가 끝나면 소멸
**쓰는 주체:** 사용자의 발화
**읽는 주체:** Claude (현재 세션)

### 수집 방식

사용자가 시각적 피드백을 주면 즉시 해석한다:

```
사용자: "이 대시보드 글씨 너무 작아"
→ 해석: [typography] body-size: increase needed
→ 즉시 적용: 14px → 16px로 변경해서 재생성
→ 추적: 이 피드백을 세션 요약에 포함
```

사용자가 수정 없이 수락하면 암묵적 긍정으로 해석한다:

```
사용자: "좋아, 다음 작업 해줘"
→ 해석: 현재 시각 설정에 대한 암묵적 승인
→ 추적: 현재 설정값을 "승인됨"으로 태깅
```

### 한계

- 대화가 끝나면 사라진다
- 다음 대화에서 같은 선호도를 다시 말해야 한다
- → 그래서 계층 2가 필요하다

---

## 계층 2: 메모리 (세션 간)

**저장소:** Claude 메모리 시스템 (userMemories)
**수명:** 사용자가 삭제하지 않는 한 영구
**쓰는 주체:** Claude (세션 종료 시 또는 중요 피드백 감지 시)
**읽는 주체:** Claude (다음 세션 시작 시 자동 로드)

### 저장 형식

Claude 메모리에 시각 선호도를 구조화해서 저장한다:

```
Visual preferences:
- Layout: spacious (padding ≥ 16px)
- Typography: body 15-16px, monospace 13px+, heading weight 600
- Color: dark theme, muted severity colors, blue accent
- Hierarchy: security status top, deploy status header
- Interaction: cards collapsed by default, auto-scroll enabled
- Density: code blocks compact, overall spacious
```

### 업데이트 트리거

메모리 업데이트는 다음 상황에서 발생한다:

```
1. 사용자가 시각적 수정을 3회 이상 요청한 세션 → 패턴 확정, 메모리 업데이트
2. 사용자가 명시적으로 선호도를 언급 ("나는 항상 다크 모드") → 즉시 메모리 저장
3. 이전 메모리와 충돌하는 피드백 → 메모리 업데이트 (최신 우선)
```

### 적용 방식

다음 세션에서 뭔가를 생성할 때:

```
Claude가 메모리에서 visual preferences를 읽음
→ CSS 변수, 레이아웃, 컴포넌트 기본값에 반영
→ 사용자는 "지난번처럼 해줘"라고 말할 필요 없음
→ 처음부터 선호도에 맞게 생성
```

### 한계

- Claude에 종속 (다른 AI 에이전트가 접근 불가)
- Claude Code에서 ralph-loop 돌 때 이 메모리를 참조할 수 없음
- → 그래서 계층 3이 필요하다

---

## 계층 3: 프로젝트 파일 (영구, 공유)

**저장소:** git repo 내 파일
**수명:** 프로젝트가 존재하는 한 영구
**쓰는 주체:** pattern-engine 에이전트, 또는 Claude가 대화 중 직접 커밋
**읽는 주체:** 모든 에이전트 (dev, security, roadmap 등)

### 파일 구조

```
tasks/
├── pattern-log.jsonl          ← 원시 이벤트 로그 (append-only)
├── patterns.md                ← 행동 패턴 (pattern-engine이 생성)
├── visual-preferences.md      ← 시각 선호도 (pattern-engine이 생성)
└── predictions.md             ← 활성 예측 (pattern-engine이 관리)
```

### pattern-log.jsonl — 원시 데이터

모든 피드백 이벤트를 JSON Lines로 기록한다:

```jsonl
{"ts":"2025-03-23T09:00","type":"visual","category":"typography","feedback":"글씨 키워줘","current":"14px","action":"increased to 16px"}
{"ts":"2025-03-23T09:05","type":"visual","category":"density","feedback":"간격 좀 넓혀","current":"padding:8px","action":"increased to 16px"}
{"ts":"2025-03-23T09:30","type":"visual","category":"implicit_accept","context":"dashboard v2","settings":{"body-size":"16px","padding":"16px","theme":"dark"}}
{"ts":"2025-03-24T14:00","type":"visual","category":"hierarchy","feedback":"severity 먼저 보여줘","action":"moved to top"}
{"ts":"2025-03-25T10:00","type":"visual","category":"color","feedback":"빨간색 좀 약하게","current":"#ff5c5c","action":"changed to #e04040"}
```

### 누가 쓰는가?

**방법 A — 대화 중 Claude가 직접 커밋 (즉시)**

사용자가 시각적 피드백을 주면, Claude가 해당 내용을 pattern-log.jsonl에 추가하고
visual-preferences.md를 업데이트한다.

```
사용자: "글씨 키워줘"
→ Claude: 코드 수정 + pattern-log.jsonl에 이벤트 추가 + visual-preferences.md 업데이트
→ git commit -m "chore: visual preference update — typography body-size 16px"
```

이 방식은 Claude와의 대화가 곧 학습이 되므로 가장 직접적이다.
단, Claude가 아닌 에이전트(dev, security)는 이 파일을 쓰지 않고 읽기만 한다.

**방법 B — pattern-engine이 배치 처리 (주기적)**

pattern-log.jsonl에 원시 데이터만 쌓아두고,
pattern-engine 에이전트가 주기적으로 분석해서 visual-preferences.md를 갱신한다.

```
pattern-log.jsonl에 10건 이상 축적
→ pattern-engine 실행
→ 패턴 추출 + confidence 계산
→ visual-preferences.md 갱신
→ git commit -m "chore: visual preferences updated by pattern-engine"
```

**실제로는 A + B 조합이 최적이다:**
- 명시적 피드백 ("글씨 키워줘") → 방법 A (즉시 기록)
- 암묵적 피드백 (수정 없이 수락) → 방법 B (배치 분석)

### visual-preferences.md — 구조화된 선호도

```markdown
# Visual Preferences
# Auto-generated. Source: pattern-log.jsonl + user feedback
# Last updated: 2025-03-23

## Typography
body-size: 16px          # confidence: 0.85 (6/7 sessions)
monospace-size: 13px     # confidence: 0.80 (4/5 code reviews)
heading-weight: 600      # confidence: 0.70 (3/4 feedbacks)

## Density
overall: spacious        # confidence: 0.80 (8/10 generations accepted)
code-blocks: compact     # confidence: 0.75 (explicit: "코드는 빽빽하게")
agent-cards: collapsed   # confidence: 0.70 (implicit: 항상 접어서 봄)

## Color
theme: dark              # confidence: 0.95 (never requested light)
severity-critical: #e04040  # confidence: 0.75 (explicit: "빨간색 약하게")
accent: #6c8cff          # confidence: 0.85 (no complaints in 8 sessions)

## Hierarchy
1. security-severity     # confidence: 0.90 (explicit: "이거 먼저")
2. deploy-status         # confidence: 0.85 (always checks second)
3. pipeline-log          # confidence: 0.80 (sidebar OK)
4. lessons               # confidence: 0.70 (collapsed OK)

## Interaction
auto-scroll: true        # confidence: 0.85
confirmation: critical-only  # confidence: 0.90
default-expanded: false  # confidence: 0.70
```

---

## 적용 파이프라인

### Claude와의 대화에서 (시뮬레이터, 대시보드 등)

```
1. 세션 시작 시:
   - Claude 메모리에서 visual preferences 로드 (계층 2)
   - 프로젝트에 visual-preferences.md가 있으면 추가 참조 (계층 3)
   - 두 소스가 충돌하면 → 최신 timestamp 우선

2. 생성 시:
   - 선호도를 CSS 변수로 변환
   - 레이아웃 순서를 hierarchy에 맞게 조정
   - 컴포넌트 기본 상태를 interaction에 맞게 설정

3. 피드백 수신 시:
   - 즉시 반영 (계층 1)
   - pattern-log.jsonl에 기록 (계층 3)
   - 패턴 확정 시 Claude 메모리 업데이트 (계층 2)
```

### Claude Code 에이전트에서 (dev, dev-swarm 등)

```
1. 에이전트 시작 시:
   - visual-preferences.md 읽기 (계층 3만 접근 가능)

2. UI 관련 코드 생성 시:
   - visual-preferences.md의 값을 참조
   - 예: body-size: 16px → CSS에 --body-font-size: 16px 적용

3. 피드백 반영:
   - pr-review가 시각 관련 변경사항 감지 시
   - "이 변경이 visual-preferences.md와 일치하는가?" 검증
```

---

## 계층 간 동기화

```
Claude 메모리 (계층 2) ←→ visual-preferences.md (계층 3)

동기화 방향:
  대화 중 피드백 → 메모리 업데이트 → 다음 기회에 md 파일도 업데이트
  md 파일이 다른 경로로 업데이트됨 → 다음 대화에서 메모리와 비교 → 최신 반영

충돌 해결:
  timestamp 기반 최신 우선
  명시적 피드백 > 암묵적 피드백
  높은 confidence > 낮은 confidence
```

---

## 현실적 제약 인정

```
1. Claude 메모리는 제한적이다
   - 모든 시각 속성을 세밀하게 저장할 수 없다
   - 핵심 선호도 5-10개만 요약해서 저장
   - 나머지는 visual-preferences.md에 위임

2. pattern-log.jsonl은 수동 시작이 필요하다
   - 처음 몇 세션은 학습 데이터가 없다
   - 기본값으로 시작하고 피드백으로 점진 학습
   - "학습 데이터 0에서 시작하는 cold start" 문제 인정

3. 시각 판단은 여전히 불완전하다
   - 스크린샷을 볼 수는 있지만, 인간처럼 "느끼지"는 못한다
   - confidence가 아무리 높아도 사용자 확인이 가장 정확하다
   - 목표: "완벽한 시각 판단"이 아니라 "점점 나아지는 시각 판단"

4. 프로젝트 간 전이는 신중해야 한다
   - 같은 사용자라도 프로젝트 성격에 따라 선호도가 다를 수 있다
   - ISMS-P 컨설팅 대시보드 vs 개인 블로그 → 다른 톤
   - 전이 시 confidence를 0.5로 낮춰서 적용 (확정 아닌 제안)
```

---

## 요약

```
수집: 사용자 피드백 (명시적 + 암묵적)
저장: 3계층 (세션 → 메모리 → git 파일)
적용: 생성 시점에 자동 반영 (CSS 변수, 레이아웃, 기본값)
학습: 점진적 (0건 → 기본값, 10건 → 패턴 감지, 30건 → 높은 confidence)
공유: visual-preferences.md를 통해 모든 에이전트가 참조
```
