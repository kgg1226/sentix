# Sentix Self-Evolution Engine

> 데이터에서 배우는 건 1단계.
> 자기 자신에서 배우는 게 2단계.
> 스스로 진화하는 게 최종 단계.

---

## 진화의 범위

```
██ 진화 가능 (Governor가 자율적으로 개선) ██

  - 에이전트 프롬프트 (시스템 프롬프트 튜닝)
  - Governor의 실행 전략 (에이전트 순서, 병렬화 판단)
  - 컨텍스트 필터링 (어떤 정보를 어떤 에이전트에게 줄지)
  - 재시도 전략 (몇 회 시도 후 에스컬레이션할지)
  - 에이전트 구성 (새 에이전트 제안, 기존 에이전트 역할 조정)

██ 진화 불가 (불변 — 어떤 상황에서도 변경 금지) ██

  - 파괴 방지 하드 룰 6개
  - 인간 개입 지점 (요청 입력, critical 보안, manual 배포)
  - 에이전트별 파일 범위 제한
  - Governor의 "코드 직접 수정 금지" 원칙
```

---

## 데이터 수집: agent-metrics

모든 진화의 기반은 **측정**이다. 측정 없이 개선하면 감에 의존하게 된다.

### 수집 대상

```
tasks/agent-metrics.jsonl (append-only)

모든 에이전트 실행마다 기록:

{
  "cycle_id": "cycle-2025-03-24-001",
  "agent": "planner",
  "input_summary": "세션 만료 기능 추가",
  "output_quality": {
    "accepted_by_next": true,       ← dev가 티켓을 수정 없이 수락했는가
    "scope_accurate": true,          ← pr-review에서 scope 이탈 없었는가
    "complexity_accurate": true,     ← 실제 변경 파일 수와 예측이 맞았는가
    "deploy_flag_accurate": true     ← 실제 배포 필요성과 일치했는가
  },
  "duration_seconds": 12,
  "tokens_used": 2400,
  "retries": 0
}

{
  "cycle_id": "cycle-2025-03-24-001",
  "agent": "dev",
  "input_summary": "dev-043: 세션 만료 구현",
  "output_quality": {
    "first_pass_success": false,     ← pr-review 1차 통과 여부
    "rejection_reasons": ["test regression: sessionExpiry.test.ts"],
    "fix_attempts": 1,
    "final_pass": true
  },
  "duration_seconds": 180,
  "tokens_used": 15000,
  "retries": 1
}

{
  "cycle_id": "cycle-2025-03-24-001",
  "agent": "governor",
  "strategy_used": "security-first (SECURITY_FLAG: true)",
  "strategy_outcome": "effective",   ← security 선행 분석이 dev에 도움이 되었는가
  "cross_judgments_made": 1,
  "cross_judgment_accurate": true,   ← 교차 판단이 정확했는가
  "total_cycle_duration": 420,
  "total_cycle_retries": 1,
  "human_intervention": false
}
```

### 핵심 지표

```
에이전트별:
  planner:
    - scope_accuracy: SCOPE가 실제 변경 범위와 일치한 비율
    - complexity_accuracy: COMPLEXITY 예측 정확도
    - deploy_flag_accuracy: DEPLOY_FLAG 정확도
    - ticket_first_pass_rate: dev가 수정 없이 수락한 비율

  dev / dev-fix:
    - first_pass_rate: pr-review 1차 통과율
    - avg_retries: 평균 재시도 횟수
    - common_rejection_reasons: 빈번한 거절 사유 패턴
    - destruction_attempts: 파괴 방지 규칙 위반 시도 횟수

  pr-review:
    - false_positive_rate: 잘못된 REJECTED 비율 (dev가 수정 없이 재제출 후 통과)
    - false_negative_rate: 놓친 이슈 비율 (APPROVED 후 devops/security에서 발견)

  security:
    - detection_rate: 실제 이슈 발견율
    - false_alarm_rate: 문제 없는데 NEEDS_FIX 판정 비율

  Governor:
    - strategy_effectiveness: 전략별 성공률
    - avg_cycle_duration: 평균 사이클 소요 시간
    - human_intervention_rate: 인간 개입 요청 비율 (낮을수록 좋음)
    - cross_judgment_accuracy: 교차 판단 정확도
```

---

## 진화 메커니즘

### 1. 프롬프트 진화

에이전트의 시스템 프롬프트를 성능 데이터 기반으로 개선한다.

```
저장 구조:
  agent-profiles/
  ├── default.toml              ← 기본 설정 (불변)
  ├── active.toml               ← 현재 활성 설정
  └── prompt-versions/
      ├── planner-v1.md          ← 초기 프롬프트
      ├── planner-v2.md          ← 개선된 프롬프트
      ├── planner-v2.metrics.json ← v2의 성능 지표
      └── evolution-log.jsonl    ← 변경 이력

진화 사이클:
  1. agent-metrics.jsonl에서 50사이클 이상 데이터 축적
  2. Governor가 roadmap 단계에서 에이전트 성능 분석
  3. 성능 저하 패턴 감지:
     예: planner의 scope_accuracy가 60% → "SCOPE 정의가 자주 좁다"
  4. Governor가 프롬프트 수정안 생성:
     planner-v1.md의 SCOPE 가이드에
     "API 라우트 추가 시 미들웨어 파일도 SCOPE에 포함할 것" 추가
  5. planner-v2.md로 저장
  6. 다음 10사이클은 v2로 실행하면서 metrics 수집
  7. v2 metrics가 v1보다 나으면 → v2 확정
  8. v2가 더 나쁘면 → v1로 롤백 + 다른 수정안 시도

A/B 테스트:
  프롬프트 변경은 즉시 전환이 아니라 시범 운영(10사이클) 후 확정.
  metrics 비교 기반. 감이 아닌 수치.
```

### 2. 전략 진화

Governor의 실행 전략(에이전트 순서, 병렬화, 컨텍스트 주입 방식)을 개선한다.

```
저장 구조:
  tasks/strategies.jsonl

전략 기록 예시:
  {
    "strategy": "security-first",
    "condition": "SECURITY_FLAG: true",
    "description": "dev 전에 security 선행 분석 실행",
    "times_used": 12,
    "success_rate": 0.83,
    "avg_retries_with": 0.5,
    "avg_retries_without": 2.1
  }

  {
    "strategy": "parallel-db-ui",
    "condition": "COMPLEXITY: high, PARALLEL_HINT contains db+ui",
    "description": "DB와 UI 서브태스크를 동시 실행",
    "times_used": 8,
    "success_rate": 0.75,
    "avg_duration_with": 300,
    "avg_duration_without": 520
  }

진화 사이클:
  1. Governor가 매 사이클 종료 시 사용한 전략과 결과를 기록
  2. 30사이클 이상 데이터 축적 시 전략별 성공률 분석
  3. 높은 성공률 전략 → 해당 조건에서 기본값으로 승격
  4. 낮은 성공률 전략 → 폐기 또는 조건 수정
  5. 새로운 조건 조합 → 실험적 전략 제안

예시:
  데이터: "COMPLEXITY: high + SECURITY_FLAG: true인 티켓에서
          security-first 전략 성공률 92%, 그냥 순서대로 하면 65%"
  → Governor 판단: "이 조합에서는 무조건 security-first"
  → 다음 사이클부터 자동 적용
```

### 3. 에이전트 구성 진화

기존 에이전트 역할을 조정하거나, 새 에이전트를 제안한다.

```
Governor가 감지할 수 있는 패턴:

  a) 특정 유형의 작업에서 반복 실패
     → 전문 에이전트 제안
     예: "성능 최적화 관련 티켓에서 dev-fix 재시도율이 80%"
     → Governor 제안: "performance-analyzer 에이전트 추가 검토"
     → roadmap에 기록, 인간이 판단

  b) 에이전트 역할 중복
     → 역할 병합 제안
     예: "pr-review와 security의 검증 항목이 60% 겹침"
     → Governor 제안: "pr-review에 security 기본 검사 통합 검토"
     → roadmap에 기록, 인간이 판단

  c) 에이전트 과부하
     → 역할 분리 제안
     예: "dev 에이전트의 평균 실행 시간이 300초를 초과하기 시작"
     → Governor 제안: "dev를 dev-logic + dev-test로 분리 검토"
     → roadmap에 기록, 인간이 판단

중요: 에이전트 구성 변경은 Governor가 직접 실행하지 않는다.
     roadmap에 제안으로 기록하고, 인간이 다음 사이클에 반영할지 결정한다.
     (프롬프트/전략 진화와 달리, 구성 변경은 아키텍처 수준이므로)
```

### 4. 컨텍스트 필터링 진화

에이전트에게 주는 컨텍스트를 최적화한다.

```
문제: 너무 많은 컨텍스트 → 토큰 낭비 + 노이즈
     너무 적은 컨텍스트 → 에이전트가 판단 불가

Governor가 추적:
  - 에이전트에게 준 컨텍스트 크기 (토큰 수)
  - 에이전트가 실제로 참조한 부분 (출력에서 인용한 정보)
  - 에이전트가 "정보 부족"을 보고한 횟수

진화:
  "dev에게 security 선행 분석을 줬는데,
   dev 출력에서 security 분석을 한 번도 인용 안 함"
  → 다음부터 해당 조건에서 security 선행 분석 생략
  → 토큰 절약

  "dev-fix에게 원본 티켓만 줬는데 fix 실패,
   원본 티켓 + Governor 교차 판단을 줬더니 fix 성공"
  → 다음부터 dev-fix에게는 항상 교차 판단 포함
  → 성공률 향상
```

---

## 진화의 안전장치

```
1. 불변 규칙은 진화 대상이 아니다
   파괴 방지 하드 룰 6개, 에이전트 파일 범위, Governor 코드 수정 금지.
   이것들은 agent-metrics가 뭘 보여주든 변경하지 않는다.
   50줄 삭제 제한이 "비효율적"이라는 데이터가 나와도 완화하지 않는다.

2. 프롬프트 변경은 시범 운영 후 확정
   즉시 전환 금지. 10사이클 A/B 테스트 → metrics 비교 → 확정 또는 롤백.
   감으로 "이게 나을 것 같다"로 변경하지 않는다.

3. 에이전트 구성 변경은 인간 승인 필요
   프롬프트/전략 진화는 자율. 에이전트 추가/제거/병합은 인간 판단.
   Governor는 제안만 하고, roadmap에 기록한다.

4. 진화 이력은 전부 기록
   agent-profiles/prompt-versions/에 모든 버전 보존.
   tasks/strategies.jsonl에 모든 전략 실험 기록.
   롤백이 언제든 가능하다.

5. 성능 하락 시 자동 롤백
   프롬프트 v2의 first_pass_rate가 v1보다 10% 이상 하락하면
   → 자동으로 v1으로 롤백 + 경고 로그
   인간 개입 불필요. 시스템이 스스로 보호한다.
```

---

## 진화 사이클 통합

```
일반 파이프라인 사이클:
  요청 → Governor → [planner → dev → pr-review → devops → security] → roadmap → 완료

진화 사이클 (매 N번째 roadmap 실행 시 또는 metrics 50건 축적 시):
  roadmap 완료 후 → Governor가 진화 분석 시작:

  1. agent-metrics.jsonl 분석
     → 에이전트별 성능 지표 계산
     → 하락 추세 감지

  2. 프롬프트 진화 판단
     → scope_accuracy < 70%? → planner 프롬프트 수정안 생성
     → first_pass_rate < 50%? → dev 프롬프트 수정안 생성
     → false_positive_rate > 30%? → pr-review 프롬프트 수정안 생성

  3. 전략 진화 판단
     → 전략별 성공률 비교 → 기본 전략 갱신

  4. 구성 진화 제안
     → 반복 실패 패턴 → 새 에이전트 제안 (roadmap에 기록)

  5. 진화 결과 기록
     → prompt-versions/ 업데이트
     → strategies.jsonl 업데이트
     → evolution-log.jsonl 기록

  다음 사이클부터 개선된 프롬프트/전략 적용
```

---

## 최종 구조

```
Sentix 학습 체계 (4계층):

Layer 1 — 실패 학습 (lessons.md)
  "이 코드 패턴은 실패한다"
  → 같은 실수 반복 방지

Layer 2 — 행동 학습 (patterns.md)
  "사용자는 다음에 이걸 요청할 것이다"
  → 선제 준비

Layer 3 — 시각 학습 (visual-preferences.md)
  "사용자는 이렇게 보고 싶어한다"
  → 맞춤 생성

Layer 4 — 자기 진화 (agent-metrics + prompt-versions + strategies)
  "내 planner가 SCOPE를 좁게 잡는 경향이 있다"
  "security-first 전략이 auth 티켓에서 효과적이다"
  "컨텍스트를 줄이면 dev 성공률이 오히려 올라간다"
  → 에이전트 자체가 더 나아진다

Layer 1-3: 데이터에서 배운다 (무엇을, 무엇을, 어떻게)
Layer 4: 자기 자신에서 배운다 (왜 틀렸는지, 어떻게 더 잘할지)
```

---

## 구현 우선순위

```
Phase 1: agent-metrics.jsonl 수집 (모든 에이전트 실행 기록)
Phase 2: 성능 지표 대시보드 (에이전트별 성공률, 재시도율 시각화)
Phase 3: 프롬프트 A/B 테스트 프레임워크
Phase 4: 전략 성공률 기반 자동 전략 선택
Phase 5: 에이전트 구성 제안 (roadmap 통합)
Phase 6: 자동 롤백 + 성능 하락 감지
```
