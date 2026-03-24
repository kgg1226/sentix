# Sentix Pattern Engine — 행동 예측 + 선제 준비

> lessons.md가 **실패**에서 배운다면,
> patterns.md는 **사용자**에서 배운다.

---

## 개념

Sentix를 쓰는 사용자에게는 반복 패턴이 있다.

```
매주 월요일 → 보안 스캔 결과 확인
기능 구현 후 → 항상 "테스트 커버리지 올려줘" 요청
배포 후 → 항상 "로그 확인해줘" 요청
3개 티켓 연속 완료 → 항상 리팩터링 요청
security WARNING 발견 시 → 항상 즉시 수정 요청 (10회 재시도 안 기다림)
```

이 패턴을 감지하면 **사용자가 요청하기 전에 준비**할 수 있다.

---

## 아키텍처

```
tasks/
├── lessons.md        ← 기존: 실패 패턴 (에이전트가 학습)
├── patterns.md       ← 신규: 사용자 행동 패턴 (시스템이 학습)
└── predictions.md    ← 신규: 현재 활성 예측 + 선제 준비 상태
```

### patterns.md 구조

```markdown
# User Patterns — auto-generated, do not edit manually

## Temporal (시간 기반)
- [weekly:mon:09] security scan review → confidence: 0.85 (6/7 weeks)
- [post-deploy] log check request → confidence: 0.90 (9/10 deploys)
- [friday:pm] roadmap review → confidence: 0.70 (5/7 weeks)

## Sequential (순서 기반)
- [after:dev-complete] → "테스트 커버리지" 요청 → confidence: 0.80 (8/10)
- [after:3-tickets] → 리팩터링 요청 → confidence: 0.75 (6/8)
- [after:security-warning] → 즉시 수정 요청 → confidence: 0.95 (19/20)

## Contextual (컨텍스트 기반)
- [ticket-contains:api] → DEPLOY_FLAG: true 경향 → confidence: 0.90
- [ticket-contains:ui] → DEPLOY_FLAG: false 경향 → confidence: 0.85
- [complexity:high] → 항상 4개 이하 서브태스크 선호 → confidence: 0.80
```

### predictions.md 구조

```markdown
# Active Predictions — auto-updated by pattern engine

## Ready (준비 완료 — 요청 시 즉시 실행 가능)
- security scan pre-run: 완료 (일요일 23:00 자동 실행)
  → 사용자가 월요일에 확인하면 즉시 결과 제공

## Staged (사전 준비 중)
- test coverage analysis: 진행 중 (dev-042 완료 감지 → 자동 시작)
  → 사용자가 "커버리지 올려줘" 요청하면 분석 결과 즉시 제공 + 티켓 초안 준비됨

## Predicted (예측만 — 아직 미실행)
- refactoring ticket draft: 대기 (현재 2/3 티켓 완료, 1개 더 완료 시 트리거)
  → confidence 0.75 이상이면 roadmap에 미리 초안 생성
```

---

## 동작 원리

### 1. 패턴 수집 (자동)

파이프라인이 실행될 때마다 다음을 기록한다:

```
tasks/pattern-log.jsonl (append-only)

{"ts":"2025-03-23T09:00:00","event":"request","input":"보안 스캔 결과 확인","day":"mon"}
{"ts":"2025-03-23T09:05:00","event":"pipeline-complete","ticket":"dev-041","duration":1200}
{"ts":"2025-03-23T09:10:00","event":"request","input":"테스트 커버리지 올려줘","prev":"dev-041"}
{"ts":"2025-03-24T14:00:00","event":"deploy","env":"triplecomma-ec2","status":"success"}
{"ts":"2025-03-24T14:02:00","event":"request","input":"로그 확인해줘","prev":"deploy"}
```

### 2. 패턴 감지 (주기적)

roadmap 에이전트가 실행될 때 (또는 sentix daemon이 idle일 때):
1. pattern-log.jsonl을 분석
2. 시간/순서/컨텍스트 패턴을 추출
3. confidence = 발생 횟수 / 기회 횟수
4. confidence ≥ 0.70 → patterns.md에 등록
5. confidence < 0.50 → patterns.md에서 제거 (패턴 소멸)

### 3. 선제 실행 (자동)

confidence 수준별 행동:

| confidence | 행동 | 인간 개입 |
|---|---|---|
| ≥ 0.90 | **선제 실행** — 결과까지 미리 준비 | 없음 |
| 0.80-0.89 | **사전 준비** — 분석만 미리 실행, 적용은 대기 | 없음 |
| 0.70-0.79 | **초안 준비** — 티켓 초안 또는 실행 계획만 작성 | 없음 |
| < 0.70 | **로깅만** — 패턴 기록, 아무 것도 안 함 | 없음 |

핵심: **어떤 수준에서도 인간에게 "이거 할까요?"라고 묻지 않는다.**
- 0.90 이상이면 그냥 한다
- 0.70-0.89이면 준비만 해놓는다 (요청이 오면 즉시 제공)
- 0.70 미만이면 기록만 한다

사용자가 예측과 다른 요청을 하면? **준비한 것을 버리고 요청을 실행한다.**
잘못된 예측의 비용은 낮다 (분석/초안 수준이므로).
맞는 예측의 이점은 크다 (즉시 결과 제공).

---

## AGENTS.md 라우팅 규칙 추가

```markdown
| 조건 | 실행 에이전트 | 다음 단계 |
|---|---|---|
| ... (기존 규칙) ... |
| patterns.md confidence ≥ 0.90 + 시간 조건 충족 | 해당 에이전트 | 선제 실행 → predictions.md 업데이트 |
| patterns.md confidence 0.80-0.89 + 트리거 감지 | 해당 에이전트 | 사전 분석만 → predictions.md staged |
| 파이프라인 완료 + pattern-log 10건 이상 축적 | pattern-engine | 패턴 분석 → patterns.md 업데이트 |
```

### pattern-engine (신규 에이전트)
```
읽기: tasks/pattern-log.jsonl, tasks/patterns.md, tasks/lessons.md
쓰기: tasks/patterns.md, tasks/predictions.md
금지: 코드 파일 일체, 다른 에이전트 직접 실행
역할: 패턴 분석만. 실행은 기존 에이전트가 함.

실행 시점:
  - roadmap 완료 후 (매 파이프라인 사이클)
  - sentix daemon idle 시 (10분 간격)
  - pattern-log.jsonl 100건 축적 시
```

---

## 예시 시나리오

### 시나리오 1: 보안 스캔 선제 실행

```
Week 1-6: 매주 월요일 09:00에 사용자가 "보안 스캔 해줘" 요청
→ pattern-engine: [weekly:mon:09] security scan → confidence 0.86

Week 7: 일요일 23:00에 Sentix가 자동으로 security-scan 실행
→ predictions.md: "security scan pre-run: 완료"

월요일 09:00: 사용자가 "보안 스캔 결과 보여줘"
→ 이미 완료됨 → 즉시 결과 제공 (대기 시간 0)
```

### 시나리오 2: 테스트 커버리지 사전 분석

```
dev-038 완료 후 → 사용자: "테스트 커버리지 올려줘"
dev-039 완료 후 → 사용자: "테스트 커버리지 올려줘"
dev-040 완료 후 → 사용자: "테스트 커버리지 올려줘"
→ pattern-engine: [after:dev-complete] → coverage request → confidence 0.80

dev-041 완료 감지:
→ Sentix: 커버리지 분석 자동 시작 (staged)
→ 사용자가 요청하면 → "이미 분석했습니다. 현재 72%, 미커버 파일: ..."
→ 사용자가 다른 요청하면 → 분석 결과 조용히 폐기
```

### 시나리오 3: 리팩터링 주기 예측

```
티켓 3개 연속 완료 → 리팩터링 요청 (6/8회 반복)
→ pattern-engine: [after:3-tickets] → refactoring → confidence 0.75

현재 2개 완료, 3번째 진행 중:
→ predictions.md: "refactoring ticket draft: 대기 (1개 더 완료 시)"

3번째 완료:
→ roadmap이 리팩터링 티켓 초안을 자동 작성
→ 사용자가 "리팩터링 해줘" → "초안 준비되어 있습니다. 바로 실행할까요?" 아님
→ "초안 준비되어 있습니다. 실행합니다." (auto_execute_next: true 시)
```

---

## 기존 구조와의 관계

```
lessons.md    — 과거 실패에서 배움   → 같은 실수 방지
patterns.md   — 과거 행동에서 배움   → 다음 요청 선제 준비
predictions.md — 현재 예측 상태      → 대시보드에 표시

세 파일 모두:
- 인간이 수동 편집하지 않음
- 에이전트가 자동 관리
- 파이프라인이 자동 참조
```

---

## 제약 및 안전장치

```
1. 선제 실행은 읽기 전용 작업만
   - 보안 스캔 실행 (코드 수정 없음) ✅
   - 커버리지 분석 (코드 수정 없음) ✅
   - 코드 리팩터링 실행 (코드 수정) ❌ → 초안 준비만

2. 선제 실행 비용 제한
   - API 호출: 파이프라인 1회 실행 비용 이하
   - 시간: 30분 이내 완료 가능한 작업만
   - 실패해도 파이프라인에 영향 없음

3. 패턴 소멸
   - confidence 3회 연속 하락 → 자동 제거
   - 30일간 미발생 → 자동 제거
   - 사용자가 패턴과 다른 행동 3회 → confidence 급락

4. 투명성
   - predictions.md는 항상 볼 수 있음
   - 대시보드에서 "Sentix가 미리 준비한 것" 섹션으로 표시
   - 사용자는 예측을 무시하고 다른 요청을 할 수 있음 (비용 없음)
```

---

## 구현 우선순위

```
Phase 1: pattern-log.jsonl 수집만 (모든 요청/이벤트 기록)
Phase 2: pattern-engine 에이전트 + patterns.md 생성
Phase 3: confidence ≥ 0.90 선제 실행 (보안 스캔, 분석 등 읽기 전용)
Phase 4: 대시보드에 predictions.md 시각화
Phase 5: 멀티 프로젝트 패턴 (프로젝트 A 배포 후 항상 프로젝트 B 업데이트)
```
