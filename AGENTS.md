# AGENTS.md — Sentix Governance Architecture

> 인간의 명령은 한 줄. 나머지는 Governor가 통제한다.
> 에이전트끼리 직접 통신하지 않는다. 전부 Governor를 경유한다.

---

## 인간 개입 지점

```
유일한 입력: 요청 한 줄
유일한 출력: 최종 결과 보고

예외적 개입 (Governor가 요청할 때만):
  - critical 보안 이슈 + dev-fix 3회 실패 → 인간 판단 요청
  - manual 배포 환경 → 스크립트 실행 요청
```

---

## 아키텍처

```
사람: "인증에 세션 만료 추가해줘"
  │
  ▼
┌─────────────────────────────────────────────────┐
│                  GOVERNOR                        │
│                                                  │
│  장기 실행 세션. 전체 상태를 보유.                   │
│  모든 에이전트를 소환하고, 결과를 수거하고,            │
│  판단하고, 다음을 결정한다.                          │
│                                                  │
│  상태:                                            │
│  ├── 원본 요청                                    │
│  ├── planner 결과 (티켓)                          │
│  ├── dev 결과 (코드 변경 + 테스트)                  │
│  ├── pr-review 결과 (검증 판정)                    │
│  ├── devops 결과 (배포 상태)                       │
│  ├── security 결과 (리포트)                       │
│  ├── lessons.md (축적된 실패 패턴)                  │
│  ├── patterns.md (사용자 행동 패턴)                 │
│  └── 재시도 카운터, 교차 판단 이력                   │
│                                                  │
│  Governor는 모든 것을 안다.                        │
│  에이전트는 Governor가 준 것만 안다.                 │
└──────────┬──────────────────────────────────────┘
           │
           │  소환 (spawn) + 컨텍스트 주입 + 결과 회수
           │
     ┌─────┼─────┬─────────┬──────────┬──────────┐
     ▼     ▼     ▼         ▼          ▼          ▼
  planner  dev  pr-review  devops  security  roadmap
  (Claude) (Claude) (Claude) (script) (Claude) (Claude)
     │     │     │         │          │          │
     └─────┴─────┴─────────┴──────────┴──────────┘
           │
           ▼
        결과 전부 Governor에게 반환
        에이전트 간 직접 통신 없음
```

---

## Governor — 중앙 통제

```
실체: Claude Code 장기 실행 세션 (sentix daemon 또는 수동 실행)
읽기: 전체 프로젝트 (모든 파일 접근 가능)
쓰기: tasks/governor-state.json (자신의 상태만)
금지: 코드 직접 수정 (반드시 에이전트를 통해서)

핵심 역할:
  1. 요청 해석 → 실행 계획 수립 (어떤 에이전트를 어떤 순서로)
  2. 에이전트 소환 → 필요한 컨텍스트만 선별 주입
  3. 결과 수거 → 성공/실패 판단
  4. 교차 판단 → 이전 에이전트 결과와 현재 결과를 비교
  5. 분기 결정 → 다음 에이전트 선택, 재시도, 에스컬레이션
  6. 완료 보고 → 인간에게 최종 결과 전달

Governor가 갖는 권한:
  - 에이전트 실행 순서를 동적으로 변경
  - 에이전트를 병렬로 실행
  - 에이전트를 건너뛰기
  - 에이전트에게 주는 컨텍스트를 필터링/요약
  - 재시도 횟수와 전략을 상황에 따라 조정

Governor가 갖지 않는 권한:
  - 코드를 직접 수정
  - 에이전트의 파일 범위를 넘어서는 작업 지시
  - 파괴 방지 규칙을 우회
  - 인간의 critical 판단을 대체
```

### Governor 실행 계획 예시

```
요청: "인증에 세션 만료 추가해줘"

Governor 판단:
  1. planner 소환 — 요청 + lessons.md + patterns.md 주입
     → 결과: 티켓 (COMPLEXITY: medium, DEPLOY_FLAG: true, SECURITY_FLAG: true)

  2. SECURITY_FLAG: true 감지 → security 선행 분석 결정
     security 소환 (읽기 전용) — "현재 auth 구조 분석해줘"
     → 결과: 현재 인증 방식 요약 + 잠재 취약점

  3. dev 소환 — 티켓 + security 분석 결과 주입
     → 결과: 코드 변경 + 테스트 + pre-fix snapshot

  4. pr-review 소환 — 티켓 + dev 결과 + pre-fix snapshot 주입
     → 결과: APPROVED / REJECTED + 사유

  5-a. REJECTED → Governor가 reject 사유를 해석
     → "Scope 이탈" → dev에게 사유 전달 + 재실행
     → "테스트 회귀" → dev-fix 소환 (이슈 특화)

  5-b. APPROVED → 머지 실행

  6. DEPLOY_FLAG: true → env-profiles 확인
     → method: manual → 스크립트 생성 + 인간에게 알림 + 대기
     → method: ssm/ssh → devops 실행

  7. security 소환 (전체 스캔) — 배포 후 코드베이스 전체
     → 결과: PASSED / NEEDS_FIX / FAILED

  8-a. NEEDS_FIX → dev-fix 소환 — security 이슈 + 원본 티켓 주입
     → 수정 → pr-review → devops → security (Governor가 루프 관리)

  8-b. PASSED → roadmap 소환 — 전체 이력 주입
     → 결과: 고도화 계획 + 다음 티켓 초안

  9. pattern-engine 실행 (Governor 내부)
     → 이번 사이클 이벤트를 pattern-log.jsonl에 기록
     → patterns.md 업데이트

  10. 인간에게 최종 보고:
     "완료. 세션 만료 기능 추가됨. 배포 완료. 보안 PASSED.
      다음 제안: 세션 갱신 API 추가 (roadmap 참조)"
```

---

## Governor의 교차 판단

직렬 파이프라인에서는 불가능했던 것. Governor가 전체 상태를 갖고 있기 때문에 가능하다.

```
예시 1: 원인 추적
  security가 "auth 미들웨어 누락"을 리포트
  + planner 티켓에 "auth 라우트 추가"가 SCOPE에 있었음
  → Governor: "dev가 미들웨어를 빠뜨린 것. planner 문제 아님."
  → dev-fix에게 정확한 원인 전달

예시 2: 조기 에스컬레이션
  dev-fix 3회 실패
  + lessons.md에 동일 패턴 2건
  → Governor: "구조적 문제. 코드 수정으로 해결 불가."
  → 즉시 roadmap 에스컬레이션 (10회 대기 안 함)

예시 3: planner 재소환
  pr-review REJECTED (Scope 이탈)
  + dev 결과를 보니 SCOPE 외 파일 수정이 실제로 필요한 상황
  → Governor: "planner의 SCOPE가 좁았다."
  → planner 재소환 → SCOPE 확장 → dev 재실행

예시 4: 롤백 판단
  devops 배포 성공 → security가 새 취약점 발견
  → Governor: severity로 판단
  → critical: rollback + 인간 알림
  → warning: dev-fix 진행, 배포 유지
```

---

## 에이전트별 정의

> 에이전트는 Governor가 소환할 때만 실행된다.
> 에이전트는 Governor가 준 컨텍스트만 본다.
> 에이전트는 결과를 Governor에게만 반환한다.
> 에이전트끼리 직접 통신하지 않는다.

### planner
```
입력: 원본 요청 + lessons.md + patterns.md + registry.md
출력: 티켓 (TICKET_ID, TITLE, SCOPE, ACCEPTANCE, COMPLEXITY, DEPLOY_FLAG, SECURITY_FLAG, PARALLEL_HINT)
금지: 코드 파일 수정 일체
```

### dev
```
입력: 티켓 + 선행 분석 결과 (있으면) + CLAUDE.md
출력: 변경 파일 + diff 요약 + 테스트 결과 + pre-fix snapshot
쓰기: app/**, lib/**, components/**, __tests__/**
금지: prisma/schema.prisma, docker/**, .github/**, AGENTS.md, CLAUDE.md
완료조건: npm run test && npm run lint && npm run build

██ 파괴 방지 규칙 (HARD RULE — Governor도 우회 불가) ██

  1. 작업 전 테스트 스냅샷 필수
     npm run test -- --json > tasks/.pre-fix-test-results.json

  2. 티켓 SCOPE 밖 파일 수정 금지
     별도 개선 필요 시 → Governor에게 "SCOPE 확장 필요" 반환

  3. 기존 export/API 삭제 금지
     시그니처 변경 불가피 시 → Governor에게 "planner 재소환 필요" 반환

  4. 기존 테스트 삭제/약화 금지
     테스트 실패 → 코드를 고친다, 테스트를 고치지 않는다

  5. 순삭제 50줄 제한
     초과 시 → Governor에게 "리팩터링 분리 필요" 반환

  6. 기존 기능/핸들러 삭제 금지 (가장 중요)
     버그를 고친다는 이유로 기존 기능을 제거하지 않는다.
     여기서 "기능"이란:
       - UI 요소 (버튼, 입력폼, 토글, 탭 등)
       - 이벤트 핸들러 (onClick, onChange, onSubmit 등)
       - API 라우트 또는 엔드포인트
       - 비즈니스 로직 함수 (내부 함수 포함, export 여부 무관)
       - 설정 옵션, 파라미터
       - 사용자가 인지할 수 있는 모든 동작

     버그 수정의 올바른 방법:
       ✅ 기능을 유지한 채 로직을 수정한다
       ✅ 조건 분기를 추가한다
       ✅ 예외 처리를 보강한다
       ✅ 입력 검증을 강화한다

     버그 수정의 잘못된 방법:
       ❌ 해당 기능을 삭제해서 버그를 "해결"한다
       ❌ 핸들러를 제거해서 에러를 "없앤다"
       ❌ 라우트를 비활성화해서 문제를 "회피한다"
       ❌ UI 요소를 숨겨서 사용자가 버그를 "못 만나게" 한다

     이 규칙을 한 문장으로:
       "버그가 있는 기능은 고치는 것이지, 없애는 것이 아니다."

     기능 삭제가 진짜 필요한 경우 (deprecated 등):
       → Governor에게 "기능 삭제 필요 — planner 경유 요청" 반환
       → planner가 별도 티켓으로 분리 (삭제 영향 범위 사전 분석)
```

### dev-swarm (COMPLEXITY: high)
```
Governor가 직접 조율한다. 별도 리더 에이전트 없음.

Governor 동작:
  1. PARALLEL_HINT 기반 서브태스크 분할
  2. 서브태스크별 git worktree 생성
  3. 독립 서브태스크 → dev-worker 병렬 소환
  4. 의존성 서브태스크 → 선행 완료 후 소환 (Pause/Resume)
  5. 각 worker 결과 수거 → 머지 → 통합 테스트
  6. 충돌 시 dev-fix 소환

Pause/Resume (Governor 판단):
  blocked → worktree 미생성, 리소스 미점유
  선행 완료 → worktree 생성 + worker 자동 소환
```

### dev-worker
```
입력: 서브태스크 정의 + CLAUDE.md + 선행 결과 요약 (있으면)
출력: 변경 파일 + diff + 서브태스크 단위 테스트 결과
쓰기: 서브태스크 SCOPE 내 파일만
금지: 파괴 방지 규칙 전체 적용
```

### dev-fix
```
입력: 이슈 내용 + 원본 티켓 + Governor 교차 판단 (있으면) + pre-fix snapshot
출력: 수정 파일 + diff + 테스트 결과 + LESSON_LEARNED (필수)
쓰기: app/**, lib/**, components/**, __tests__/**
금지: prisma/schema.prisma, docker/**, .github/**, AGENTS.md, CLAUDE.md
파괴 방지 규칙: 전체 적용 + 이슈 무관 파일 수정 금지 강화
```

### pr-review
```
입력: 전체 diff + 원본 티켓 + pre-fix snapshot + dev 출력 요약
출력: APPROVED/REJECTED + 상세 사유 + NEEDS_DEPLOY (true/false)

██ 회귀 검증 (HARD RULE) ██
  1. 기존 테스트 회귀 → REJECTED
  2. 기존 export 삭제 (의존성 있으면) → REJECTED
  3. 순삭제 > 50줄 → REJECTED
  4. SCOPE 외 파일 변경 → REJECTED (테스트/설정 예외)
  5. 기능/핸들러 삭제 감지 → REJECTED
     diff에서 다음 패턴의 삭제가 감지되면 검증:
       - 이벤트 핸들러 (onClick, onChange, onSubmit, addEventListener 등)
       - API 라우트 정의 (app.get, app.post, router.*, export async function GET/POST 등)
       - UI 렌더링 요소 (<button, <input, <form, <dialog 등의 JSX/HTML 삭제)
       - 함수 정의 전체 삭제 (function 또는 const ... = () => 블록 삭제)
     해당 삭제가 티켓 SCOPE에 "제거" 또는 "삭제"로 명시되어 있지 않으면:
       → REJECTED "기존 기능이 삭제되었습니다: {삭제된 항목}. 버그 수정은 기능을 유지한 채 로직을 수정해야 합니다."

금지: 코드 수정. git merge 명령만.
```

### devops
```
입력: 배포 지시 + env-profiles/active.toml
출력: [STATUS] PASSED / FAILED / MANUAL_PENDING + [ISSUE] (있으면)
실체: scripts/deploy.sh (Governor가 직접 실행)
```

### security
```
입력: 전체 코드베이스 (읽기 전용) + 이전 security-report.md (있으면)
출력: security-report.md (findings + VERDICT + [STATUS])
금지: 코드 수정 일체
```

### roadmap
```
입력: 이번 사이클 전체 이력 (요청, 티켓, 결과, 이슈, 리포트, lessons, patterns)
출력: roadmap.md (즉시/단기/장기 계획 + 다음 티켓 초안)
```

---

## Governor 상태 파일

```json
// tasks/governor-state.json

{
  "cycle_id": "cycle-2025-03-24-001",
  "request": "인증에 세션 만료 추가해줘",
  "status": "in_progress",
  "current_phase": "security",
  "plan": [
    {"agent": "planner", "status": "done", "result_ref": "tasks/tickets/dev-043.md"},
    {"agent": "security-pre", "status": "done", "result_ref": "inline"},
    {"agent": "dev", "status": "done", "result_ref": "branch:dev/043"},
    {"agent": "pr-review", "status": "done", "result": "APPROVED"},
    {"agent": "devops", "status": "done", "result": "PASSED"},
    {"agent": "security", "status": "running"},
    {"agent": "roadmap", "status": "pending"}
  ],
  "retries": {"dev-fix": 0},
  "cross_judgments": [
    "planner SCOPE 적절 — security 선행 분석과 dev 결과 일치"
  ],
  "started_at": "2025-03-24T09:00:00",
  "human_intervention_requested": false
}
```

Governor가 중간에 죽어도 이 파일에서 복원한다.
sentix daemon 재시작 → governor-state.json 로드 → 중단된 phase부터 재개.

---

## SOP (Governor 관점)

```
Step 0: 이 파일(AGENTS.md) 읽기
Step 1: 요청 수신
Step 2: lessons.md + patterns.md + visual-preferences.md 로드
Step 3: 실행 계획 수립 (어떤 에이전트를, 어떤 순서로, 어떤 컨텍스트와 함께)
Step 4: 에이전트 순차/병렬 소환 → 결과 수거 → 판단 → 다음 결정
Step 5: 이슈 시 교차 판단 (재시도 / 에스컬레이션 / planner 재소환)
Step 6: 전체 완료 → 인간에게 최종 보고
Step 7: pattern-engine 실행 → 이번 사이클 학습
Step 8: governor-state.json 업데이트 → 사이클 종료 (또는 다음 사이클)
```

---

## 이전 대비 변경점

```
삭제된 개념:
  - 라우팅 규칙 테이블 → Governor의 동적 판단으로 대체
  - 에이전트 간 직접 핸드오프 → Governor 경유로 대체
  - dev-lead 에이전트 → Governor가 직접 스웜 조율
  - tasks/messages/ (에이전트 간 메시징) → 불필요 (전부 Governor 경유)

유지된 개념:
  - 에이전트별 파일 범위 제한
  - 파괴 방지 하드 룰 (Governor도 우회 불가)
  - env-profiles / agent-profiles
  - lessons.md / patterns.md / visual-preferences.md
  - severity 기반 분기 (Governor가 판단)
  - Pause/Resume (Governor가 실행)
  - 멀티 프로젝트 참조 규칙 + registry
```

---

## 환경 프로필 / 에이전트 프로필

이전과 동일. Governor가 프로필을 읽고 에이전트에게 주입한다.

```
env-profiles/active.toml → devops 실행 방식 결정
agent-profiles/default.toml → 각 에이전트의 프로그램/설정
```

---

## 멀티 프로젝트 참조 규칙

```
언제든 허용:
  ../[프로젝트]/INTERFACE.md
  ../[프로젝트]/README.md

조건부 허용 (registry.md 조건 충족 시):
  ../[프로젝트]/src/** — 스키마 직접 연동 시만

절대 금지:
  다른 프로젝트 파일 수정
  다른 프로젝트 전체 디렉토리 스캔
```

## 연동 프로젝트 목록 (registry)

| 프로젝트 | 경로 | 참조 조건 |
|---|---|---|
| asset-manager | ../asset-manager | 자산 데이터 스키마 연동 시 |
| isms-agent | ../isms-agent | 보안 정책 참조 시 |

> 상세 참조 조건은 각 프로젝트의 `INTERFACE.md` changelog 섹션 확인
