# Sentix — Design Principles

> Sentinel + Index.
> 파이프라인을 감시하는 실행 지표.
> 인간은 방향을 정하고, Sentix가 나머지를 실행한다.

---

## 핵심 철학

**인간의 개입 지점은 정확히 세 곳이다:**

```
1. 요청 입력     — "이 기능 만들어줘", "이 버그 고쳐줘"
2. 보안 리뷰     — security report에서 critical 발견 시 최종 판단
3. 수동 배포 확인 — VPN 등 자동화 불가 환경에서만 (env-profiles manual 모드)

그 외 모든 것은 Sentix가 자율적으로 처리한다.
```

---

## 타 프로젝트와의 경계

### claude-squad에서 가져온 것
- Pause/Resume (worktree checkpoint) → dev-swarm worker 리소스 관리에 적용
- 이중 폴링 (빠른 프리뷰 / 느린 메타데이터) → 대시보드 설계에 참고
- 프로필 시스템 → agent-profiles/*.toml로 확장

### claude-squad에서 가져오지 않은 것
- 인간이 직접 세션을 생성하는 UX → Sentix에서는 planner가 자동 생성
- 인간이 tab 키로 에이전트 사이를 전환하는 인터랙션 → Sentix는 파이프라인이 알아서 다음 단계로 넘어감
- 인간이 diff를 보고 수동으로 push하는 플로우 → Sentix는 pr-review가 자동 검증 후 자동 머지

### ClawTeam에서 가져온 것
- 의존성 체인 (blocked-by) → dev-lead 서브태스크 순서 보장
- 리더-워커 분리 → dev-lead + dev-worker 구조

### ClawTeam에서 가져오지 않은 것
- 인간이 `clawteam spawn` 명령을 직접 치는 인터페이스 → Sentix에서는 planner 티켓의 COMPLEXITY: high가 자동으로 dev-lead를 트리거
- CLI 중심 조작 → Sentix는 시각적 대시보드 우선

---

## 자율 실행 원칙

### 1. 파이프라인은 멈추지 않는다

에이전트가 실패하면 dev-fix가 자동으로 실행된다.
dev-fix도 실패하면 재시도 카운터가 돌아간다.
재시도도 실패하면 roadmap으로 에스컬레이션된다.
**인간에게 "어떻게 할까요?"라고 묻는 단계는 없다.**

유일한 예외:
- `[STATUS] MANUAL_PENDING` — env-profiles에서 access.method = "manual"인 경우
  이때도 Sentix는 실행 스크립트를 자동 생성해서 제공한다.
  인간은 VPN 연결 후 스크립트를 실행만 하면 된다.

### 2. 결정은 데이터 기반이다

| 결정 | 판단 주체 | 판단 근거 |
|---|---|---|
| 배포 필요 여부 | planner + pr-review | DEPLOY_FLAG + diff 분석 |
| 병렬 실행 여부 | planner | COMPLEXITY + PARALLEL_HINT |
| 재시도 vs 에스컬레이션 | 재시도 카운터 + severity | critical 3회, warning 10회 |
| 다음 티켓 | roadmap | security report + lessons.md |

### 3. 학습은 자동으로 축적된다

두 가지 학습 루프가 독립적으로 동작한다:

**실패 학습 (lessons.md):**
- dev-fix가 실행될 때마다 LESSON_LEARNED가 lessons.md에 기록된다
- 동일 패턴 3회 반복 → roadmap에 구조적 개선 항목으로 자동 승격
- 다음 planner 실행 시 lessons.md를 컨텍스트로 자동 주입

**행동 학습 (patterns.md):**
- 모든 요청/이벤트가 pattern-log.jsonl에 자동 기록된다
- pattern-engine이 시간/순서/컨텍스트 패턴을 추출한다
- confidence ≥ 0.90이면 사용자가 요청하기 전에 선제 실행한다
- 사용자가 예측과 다른 행동을 하면 준비한 것을 조용히 폐기한다

**인간이 "이거 기억해"라고 지시할 필요 없다.**
**인간이 "이거 미리 해놔"라고 지시할 필요도 없다.**

### 4. 환경 적응은 프로필 기반이다

한 번 env-profiles/active.toml을 설정하면:
- CI 가능 환경 → GitHub Actions가 파이프라인 실행
- CI 불가 환경 → sentix daemon이 로컬에서 동일 파이프라인 실행
- 환경이 바뀌면 active.toml 심볼릭 링크만 변경

**인간이 배포 스크립트를 매번 수정할 필요 없다.**

---

## 인간 개입 최소화를 위한 구조

### sentix daemon (CI 대안)

GitHub Actions에 접근할 수 없는 환경에서 파이프라인을 자율 실행한다.

```
sentix daemon --profile active
```

동작:
1. git log를 폴링하여 새 커밋 감지
2. tasks/tickets/에서 미처리 티켓 감지
3. AGENTS.md 라우팅 규칙에 따라 에이전트 자동 실행
4. 각 에이전트의 완료 조건 검증 후 다음 에이전트 트리거
5. manual 모드 배포 시 → 스크립트 생성 + 알림 (Slack/터미널)
6. 전체 완료 시 → roadmap 자동 실행

daemon은 GitHub Actions의 **로컬 미러**다.
CI에서 `repository_dispatch`로 하던 것을 파일시스템 이벤트로 대체한다.
파이프라인 로직은 동일하고, 트리거 메커니즘만 다르다.

### dev-swarm 자율 실행

dev-lead는 인간의 추가 지시 없이 서브태스크를 분할하고 실행한다.

```
planner 티켓 (COMPLEXITY: high)
  → dev-lead 자동 생성
    → PARALLEL_HINT 기반 서브태스크 분할
    → 의존성 순서 자동 결정
    → 독립 서브태스크 즉시 병렬 실행
    → 의존 서브태스크는 Pause 상태로 대기 (리소스 미점유)
    → 선행 완료 시 자동 Resume
    → 전체 머지 + 통합 테스트
    → 실패 시 dev-fix 자동 호출 (인간 개입 없음)
  → PR 생성 → pr-review 자동 진행
```

Pause/Resume은 claude-squad에서 가져온 패턴이지만,
claude-squad에서는 인간이 Pause/Resume을 수동으로 하고
Sentix에서는 dev-lead가 의존성 기반으로 자동으로 한다.

### 보안 자동 판단

security 에이전트의 출력은 severity로 자동 분기된다:
- suggestion → 로깅만, 파이프라인 계속
- warning → dev-fix 자동 실행, 파이프라인 계속
- critical → dev-fix 시도 후 실패 시 파이프라인 일시 정지 + 인간에게 알림

**critical만이 인간의 판단을 요청한다.** 그 외는 전부 자동.

---

## 대시보드의 역할

대시보드는 **제어판이 아니라 관측소**다.

인간이 대시보드에서 하는 것:
- 파이프라인 현재 상태 확인 (어떤 에이전트가 실행 중인지)
- security report 확인 (critical 발견 시)
- lessons.md 축적 현황 확인
- roadmap의 다음 티켓 초안 확인

인간이 대시보드에서 하지 않는 것:
- 에이전트를 수동으로 실행/중지
- 파이프라인 단계를 건너뛰기
- 에이전트 간 컨텍스트를 수동으로 편집

유일한 액션 버튼:
- "요청 입력" — 새 파이프라인 시작
- "배포 확인" — manual 모드에서 스크립트 실행 후 결과 보고
- "roadmap 다음 티켓 실행" — 자동 실행도 가능하나, 인간이 방향을 조정할 수 있는 선택적 개입 지점

---

## 요약

```
Sentix는 자율 주행 차량이다.
인간은 목적지를 말하고, 도착하면 결과를 확인한다.
주행 중에 핸들을 잡을 수 있지만, 잡을 필요가 거의 없다.

claude-squad는 계기판이다. 운전은 인간이 한다.
ClawTeam은 카풀 매칭이다. 여러 차를 동시에 운행하지만 각각 운전자가 필요하다.
Sentix는 자율 주행이다. 차가 알아서 간다.
```
