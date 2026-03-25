# Sentix

**Autonomous multi-agent DevSecOps pipeline.**
One request in. Deployed, secured, and improved — out.

> Sentinel + Index: 파이프라인을 감시하는 실행 지표.

---

## What is Sentix

요청 하나를 입력하면 Sentix가 알아서 실행한다:

```
"사용자 인증에 세션 만료 기능 추가해줘"
  │
  ▼
┌─────────────────────────────────────────────────────┐
│  Layer 5 — Self-Evolution Engine                     │
│  Layer 4 — Visual Perception                         │
│  Layer 3 — Pattern Engine                            │
│  Layer 2 — Learning Pipeline                         │
│  Layer 1 — Governor + Agents (Core)                  │
└─────────────────────────────────────────────────────┘
  │
  └─ planner       티켓 생성 (scope, complexity, deploy 판단)
  └─ dev / swarm   구현 (복잡하면 병렬, 단순하면 단독)
  └─ pr-review     scope 검증 + 자동 머지
  └─ devops        환경에 맞게 배포
  └─ security      취약점 스캔 + severity 분류
  └─ roadmap       고도화 계획 + 다음 티켓 초안
```

인간이 하는 것: **요청 입력. 끝.**
이슈가 생기면 자동 수정하고, 반복 패턴은 자동 학습하고, 다음 작업까지 자동 제안한다.

---

## Why Sentix

| | claude-squad | ClawTeam | **Sentix** |
|---|---|---|---|
| 인간 역할 | 세션 생성, 감시, 판단 | 목표 설정, 방향 조정 | **요청 입력, 결과 확인** |
| 에이전트 관계 | 독립 (통신 없음) | 리더-워커 (메시징) | **Governor 중앙 통제 + 교차 판단** |
| 품질 게이트 | 없음 | 없음 | **security, pr-review, health check** |
| 배포 | 범위 밖 | 범위 밖 | **환경 어댑터 (SSM/SSH/manual/local)** |
| 학습 | 없음 | 없음 | **5 Layer 자동 학습** |
| 재시도 | 없음 | 없음 | **severity 기반 자동 (critical 3회, warning 10회)** |
| 멀티 프로젝트 | 없음 | 없음 | **INTERFACE.md 기반 교차 참조 + cascade 배포** |

Sentix는 자율 주행 차량이다. 목적지를 말하면 차가 알아서 간다.

---

## Governor Architecture

```
사람: "요청"
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
└──────────┬──────────────────────────────────────┘
           │
           │  소환 (spawn) + 컨텍스트 주입 + 결과 회수
           │
     ┌─────┼─────┬─────────┬──────────┬──────────┐
     ▼     ▼     ▼         ▼          ▼          ▼
  planner  dev  pr-review  devops  security  roadmap
     │     │     │         │          │          │
     └─────┴─────┴─────────┴──────────┴──────────┘
           │
           ▼
        결과 전부 Governor에게 반환
        에이전트 간 직접 통신 없음
```

Governor는 모든 것을 안다. 에이전트는 Governor가 준 것만 안다.

### Governor 교차 판단

Governor가 전체 상태를 보유하고 있기 때문에 가능한 고급 판단:

| 상황 | Governor 판단 | 행동 |
|---|---|---|
| security 리포트 + planner 티켓 비교 | "dev가 미들웨어를 빠뜨림" | dev-fix에 정확한 원인 전달 |
| dev-fix 3회 실패 + lessons.md 동일 패턴 | "구조적 문제" | 즉시 roadmap 에스컬레이션 |
| pr-review REJECTED + dev가 SCOPE 외 수정 | "planner SCOPE가 좁았다" | planner 재소환 → SCOPE 확장 |
| devops 배포 후 + security 취약점 발견 | severity로 분기 | critical: rollback, warning: dev-fix |

### Governor 실행 계획 예시

```
요청: "인증에 세션 만료 추가해줘"

Governor 판단:
  1. planner 소환 — 요청 + lessons.md + patterns.md 주입
     → 티켓 (COMPLEXITY: medium, DEPLOY_FLAG: true, SECURITY_FLAG: true)

  2. SECURITY_FLAG → security 선행 분석 → "현재 auth 구조 분석"

  3. dev 소환 — 티켓 + security 분석 결과 주입
     → 코드 변경 + 테스트 + pre-fix snapshot

  4. pr-review 소환 — 티켓 + dev 결과 + pre-fix snapshot 주입
     → APPROVED → 머지 / REJECTED → dev에게 사유 전달 + 재실행

  5. DEPLOY_FLAG: true → devops 실행 (env-profiles 참조)

  6. security 소환 (전체 스캔)
     → PASSED → roadmap 소환
     → NEEDS_FIX → dev-fix → pr-review → devops → security (루프)

  7. pattern-engine 실행 → 사이클 기록 → 완료 보고
```

---

## Agent Pipeline

### 기본 플로우 (직렬)

```
요청 → planner → dev → pr-review → devops → security → roadmap
                                      ↑                    │
                                      └── dev-fix ←────────┘
```

### 복잡한 작업 (dev-swarm)

```
요청 → planner (COMPLEXITY: high)
         └→ Governor 직접 조율 (별도 리더 에이전트 없음)
              ├→ worker-db   ──┐
              ├→ worker-ui   ──┤──→ merge → pr-review → ...
              └→ worker-api ←─┘ (blocked-by db, Pause/Resume)
```

### 조건부 분기

```
DEPLOY_FLAG: false       → devops 건너뜀 → security 직행
access.method: manual    → 스크립트 생성 → [MANUAL_PENDING] → security
severity: critical       → dev-fix 3회 → 실패 시 roadmap 에스컬레이션 + 인간 알림
severity: suggestion     → 로깅만 → 파이프라인 계속
동일 패턴 3회 반복        → 구조적 개선 항목으로 자동 승격
```

### 에이전트별 정의

| 에이전트 | 입력 | 출력 | 쓰기 범위 |
|---|---|---|---|
| **planner** | 요청 + lessons.md + patterns.md | 티켓 (SCOPE, COMPLEXITY, DEPLOY_FLAG) | 코드 수정 금지 |
| **dev** | 티켓 + 선행 분석 | 코드 + 테스트 + pre-fix snapshot | app/**, lib/**, components/**, __tests__/** |
| **dev-worker** | 서브태스크 + CLAUDE.md | 변경 파일 + diff + 테스트 | 서브태스크 SCOPE 내만 |
| **dev-fix** | 이슈 + 원본 티켓 + 교차 판단 | 수정 + LESSON_LEARNED (필수) | app/**, lib/**, components/**, __tests__/** |
| **pr-review** | diff + 티켓 + pre-fix snapshot | APPROVED/REJECTED + 사유 | 코드 수정 금지. git merge만 |
| **devops** | 배포 지시 + active.toml | PASSED/FAILED/MANUAL_PENDING | scripts/deploy.sh 실행 |
| **security** | 전체 코드베이스 (읽기 전용) | security-report.md | 코드 수정 금지 |
| **roadmap** | 사이클 전체 이력 | roadmap.md + 다음 티켓 초안 | — |
| **pattern-engine** | pattern-log.jsonl + patterns.md | patterns.md + predictions.md | 코드 파일 금지 |

---

## 5 Layer Architecture

### Layer 1 — Governor + Agents (Core)

중앙 Governor가 에이전트를 소환하고, 결과를 수거하고, 교차 판단하고, 다음을 결정한다.
에이전트끼리 직접 통신하지 않는다. 전부 Governor를 경유한다.

### Layer 2 — Learning Pipeline (3계층 학습)

```
┌────────────────────────────┐
│  계층 1: 실시간 (세션 내)     │  ← 즉시 반영, 대화 끝나면 소멸
├────────────────────────────┤
│  계층 2: 메모리 (세션 간)     │  ← Claude 메모리, 다음 대화에서 참조
├────────────────────────────┤
│  계층 3: 프로젝트 파일 (영구)  │  ← git repo, 모든 에이전트 접근
└────────────────────────────┘
```

| 학습 채널 | 파일 | 학습 대상 |
|---|---|---|
| Failure | `tasks/lessons.md` | 실패 패턴 → 같은 실수 방지 |
| Behavior | `tasks/patterns.md` | 사용자 행동 → 선제 준비 |
| Visual | `tasks/visual-preferences.md` | 시각 선호 → 맞춤 생성 |

인간이 "이거 기억해"라고 지시할 필요 없다.
인간이 "이거 미리 해놔"라고 지시할 필요도 없다.

### Layer 3 — Pattern Engine (행동 예측 + 선제 준비)

사용자의 반복 패턴을 감지하여 요청 전에 미리 준비한다.

| 패턴 유형 | 예시 | confidence |
|---|---|---|
| Temporal (시간) | 매주 월요일 09:00 보안 스캔 결과 확인 | 0.85 |
| Sequential (순서) | 기능 구현 후 → "테스트 커버리지 올려줘" | 0.80 |
| Contextual (컨텍스트) | API 티켓 → DEPLOY_FLAG: true 경향 | 0.90 |

**confidence별 행동:**

| confidence | 행동 |
|---|---|
| ≥ 0.90 | **선제 실행** — 결과까지 미리 준비 (읽기 전용 작업만) |
| 0.80-0.89 | **사전 준비** — 분석만 미리, 적용은 대기 |
| 0.70-0.79 | **초안 준비** — 티켓 초안 또는 계획만 작성 |
| < 0.70 | **로깅만** — 기록만, 아무것도 안 함 |

어떤 수준에서도 인간에게 "이거 할까요?"라고 묻지 않는다.
예측이 틀리면 준비한 것을 조용히 폐기한다.

### Layer 4 — Visual Perception (시각 선호 학습)

사용자의 피드백에서 시각적 선호도를 학습하여 생성물에 자동 반영한다.

| 카테고리 | 수집 예시 | 적용 |
|---|---|---|
| 정보 위계 | "이거 맨 위에 올려줘" | severity → 최상단 배치 |
| 밀도 선호 | "너무 빡빡해" | padding ≥ 16px |
| 색상/대비 | "빨간색 너무 쎄" | muted severity colors |
| 타이포그래피 | "글씨 키워줘" | body: 15px+ |
| 인터랙션 | "접어둬" | cards collapsed by default |

수집 방식: 명시적 ("글씨 키워줘") + 암묵적 (수정 없이 수락 → +1 confidence) + 비교 (A/B 선택)

### Layer 5 — Self-Evolution Engine (자기 진화)

에이전트가 자기 자신의 성능 데이터를 분석하여 스스로 개선한다.

```
██ 진화 가능 ██                         ██ 진화 불가 (불변) ██
 에이전트 프롬프트 튜닝                     파괴 방지 하드 룰 6개
 실행 전략 (순서, 병렬화)                   인간 개입 지점
 컨텍스트 필터링                           에이전트 파일 범위 제한
 재시도 전략                              Governor 코드 수정 금지
```

**진화 메커니즘:**
1. **프롬프트 진화** — 50사이클 데이터 → 성능 저하 감지 → 수정안 생성 → 10사이클 A/B 테스트 → 확정/롤백
2. **전략 진화** — 전략별 성공률 추적 → 높은 성공률을 기본값으로 승격
3. **구성 진화** — 반복 실패 패턴 → 새 에이전트 제안 (roadmap에 기록, 인간 판단)
4. **컨텍스트 최적화** — 에이전트에 준 정보 vs 실제 참조 비교 → 불필요한 컨텍스트 제거

**안전장치:** 성능 10% 하락 시 자동 롤백. 프롬프트 변경은 시범 운영 후 확정.

---

## 멀티 프로젝트 교차 참조

Sentix는 여러 프로젝트를 엮어 개발할 때 **코드 충돌을 방지**한다.

### 참조 규칙

```
언제든 허용 (읽기 전용):
  ../[프로젝트]/INTERFACE.md    ← API 계약서 (엔드포인트, 스키마, 버전)
  ../[프로젝트]/README.md       ← 프로젝트 개요

조건부 허용 (registry 등록 + 직접 연동 시):
  ../[프로젝트]/src/**          ← 스키마 직접 연동 시만

절대 금지:
  ❌ 다른 프로젝트 파일 수정
  ❌ 다른 프로젝트 전체 디렉토리 스캔
```

### 동작 흐름

```
프로젝트 A에서 "인증 API 응답 형식 변경" 요청
  │
  ▼
Governor:
  1. planner 소환 → INTERFACE.md 확인
     → 프로젝트 B(isms-agent)가 이 API를 참조하고 있음 감지

  2. security 소환 → ../isms-agent/INTERFACE.md 읽기 전용 참조
     → "이 변경이 isms-agent 호출 패턴과 충돌하는가?" 분석

  3. 충돌 발견 시:
     → planner 재소환 → SCOPE에 "하위 호환성 유지" 조건 추가
     → dev가 breaking change 없이 구현

  4. 배포 후:
     → deploy.yml cascade job이 연동 프로젝트에 repository_dispatch
     → 프로젝트 B에서 별도 Sentix 파이프라인 실행 (호환성 테스트)
```

### registry (연동 프로젝트 목록)

| 프로젝트 | 경로 | 참조 조건 |
|---|---|---|
| asset-manager | ../asset-manager | 자산 데이터 스키마 연동 시 |
| isms-agent | ../isms-agent | 보안 정책 참조 시 |

> 핵심: **읽기만 하고 수정하지 않는다.** 충돌이 감지되면 현재 프로젝트의 코드를 호환되게 수정한다. 다른 프로젝트 코드를 고치려면 그 프로젝트에서 별도로 Sentix를 실행해야 한다.

---

## 6 Hard Rules (파괴 방지)

Governor도 우회할 수 없는 불변 규칙. FRAMEWORK.md, CLAUDE.md, .sentix/rules/hard-rules.md 3곳에 동일하게 존재한다.

| # | 규칙 | 위반 시 |
|---|---|---|
| 1 | **작업 전 테스트 스냅샷 필수** | npm run test --json > tasks/.pre-fix-test-results.json |
| 2 | **티켓 SCOPE 밖 파일 수정 금지** | → "SCOPE 확장 필요" 반환 |
| 3 | **기존 export/API 삭제 금지** | → "planner 재소환 필요" 반환 |
| 4 | **기존 테스트 삭제/약화 금지** | 테스트 실패 → 코드를 고친다 |
| 5 | **순삭제 50줄 제한** | → "리팩터링 분리 필요" 반환 |
| 6 | **기존 기능/핸들러 삭제 금지** | → "기능 삭제 — planner 경유 요청" 반환 |

**"버그가 있는 기능은 고치는 것이지, 없애는 것이 아니다."**

---

## Environment Profiles

한 번 설정하면 배포 방식이 자동으로 결정된다.

| method | 동작 | 대상 환경 |
|---|---|---|
| `ssm` | AWS SSM 자동 실행 | 오픈 EC2 |
| `ssh` | SSH 자동 실행 | NAS, 온프레미스 |
| `manual` | 스크립트 생성 → 알림 | VPN, 폐쇄망 |
| `local` | 로컬 Docker 실행 | 개발 환경 |

```bash
# 프로필 간 전환
cd env-profiles && ln -sf nas-onprem.toml active.toml

# dry-run으로 확인
./scripts/deploy.sh --dry-run

# 실행
./scripts/deploy.sh
```

---

## Quick Start

### Option A: Install into existing project

```bash
bash install-sentix.sh /path/to/your-project
```

### Option B: Manual setup

```bash
# 1. 문서 복사
cp FRAMEWORK.md CLAUDE.md /path/to/your-project/

# 2. .sentix 구조 복사
cp -r .sentix/ /path/to/your-project/.sentix/

# 3. tasks 디렉토리 생성
mkdir -p /path/to/your-project/tasks/tickets

# 4. 환경 프로필 설정 (배포 필요 시)
cp -r env-profiles/ /path/to/your-project/env-profiles/
cd /path/to/your-project/env-profiles
ln -sf local-dev.toml active.toml

# 5. CLAUDE.md 기술 스택 수정
# 프로젝트에 맞게 runtime, framework, database 등 편집
```

### Option C: CLI (sentix init)

```bash
npm install -g sentix
cd /path/to/your-project
sentix init
```

---

## Document Structure

```
project/
├── FRAMEWORK.md              # 설계 문서 (인간이 읽음) — 5 Layer Architecture
├── CLAUDE.md                 # 실행 문서 (Claude Code가 읽음) — Governor 지침
├── .sentix/
│   ├── config.toml           # Layer 활성화 설정
│   ├── providers/
│   │   ├── claude.toml       # Claude API 어댑터 (기본)
│   │   ├── openai.toml       # OpenAI API 어댑터
│   │   └── ollama.toml       # Local First 어댑터 (폐쇄망)
│   ├── rules/
│   │   └── hard-rules.md     # 불변 규칙 6개 격리
│   └── plugins/              # 프로젝트별 커스텀 플러그인
├── tasks/
│   ├── lessons.md            # 실패 패턴 자동 축적 (Layer 2)
│   ├── patterns.md           # 사용자 행동 패턴 (Layer 3, 자동 생성)
│   ├── predictions.md        # 활성 예측 (Layer 3, 자동 생성)
│   ├── visual-preferences.md # 시각 선호도 (Layer 4, 자동 생성)
│   ├── roadmap.md            # 고도화 계획
│   ├── security-report.md    # 보안 스캔 결과
│   ├── tickets/              # planner 생성 티켓
│   ├── governor-state.json   # Governor 현재 상태 (복원용, .gitignore)
│   ├── pattern-log.jsonl     # 원시 이벤트 로그 (append-only, .gitignore)
│   └── agent-metrics.jsonl   # 에이전트 실행 기록 (Layer 5, .gitignore)
├── env-profiles/             # 배포 환경 프로필 (선택)
│   ├── active.toml → *.toml  # 심볼릭 링크 (.gitignore)
│   ├── template.toml         # 빈 템플릿 (주석 가이드)
│   └── *.toml                # 환경별 프로필
├── agent-profiles/           # 에이전트 프로그램/설정 (선택)
│   └── default.toml
└── scripts/
    └── deploy.sh             # 범용 배포 스크립트 (선택)
```

**2개 문서만 유지:**
- `FRAMEWORK.md` — 설계 (인간이 읽음)
- `CLAUDE.md` — 실행 (Claude Code가 읽음)

---

## CLI

```bash
sentix init              # 프로젝트에 Sentix 설치 (기술 스택 자동 감지)
sentix run "요청"         # Governor 파이프라인 실행
sentix status            # Governor 상태 + Memory Layer 요약 + 진화 단계
sentix doctor            # 설치 상태 진단 (deprecated 파일 감지 포함)
sentix metrics           # 에이전트 성공률/재시도율/토큰 사용량 분석
sentix plugin list       # 등록된 커맨드 + 프로젝트 플러그인 목록
sentix plugin create     # 커스텀 플러그인 스캐폴딩
```

**플러그인 아키텍처:**
- `registerCommand(name, { description, run })` — 커맨드 등록
- `registerHook(event, fn)` — before:command / after:command 훅
- 로딩 순서: `src/commands/` → `src/plugins/` → `.sentix/plugins/` (프로젝트별)
- 외부 의존성 0. Node.js 18+ ESM만 사용.

---

## 인간 개입 지점

| 상황 | 개입 여부 | 이유 |
|---|---|---|
| 기능 요청/버그 리포트 | ✅ 입력 | 파이프라인 시작점 |
| 티켓 생성 | ❌ | planner 자동 |
| 코드 구현 | ❌ | dev/dev-swarm 자동 |
| 코드 리뷰 | ❌ | pr-review 자동 검증 |
| 배포 (SSM/SSH/local) | ❌ | scripts/deploy.sh 자동 |
| 배포 (VPN/폐쇄망) | ✅ 스크립트 실행 | 네트워크 제한 |
| 보안 스캔 | ❌ | security 자동 |
| 보안 critical 판단 | ✅ 확인 | dev-fix 3회 실패 시만 |
| 재시도 | ❌ | severity 기반 자동 |
| 고도화 계획 | ❌ | roadmap 자동 |
| 다음 티켓 실행 | ❌ (선택적 ✅) | 자동 가능, 방향 조정 시 개입 |
| 멀티 프로젝트 충돌 | ❌ | INTERFACE.md 기반 자동 감지 |

---

## Contributing

- **env-profiles**: 새 환경 프로필 추가 (AWS ECS, GCP, k8s 등)
- **providers**: 새 AI 어댑터 추가 (Gemini, Mistral 등)
- **plugins**: CLI 플러그인 (`sentix plugin create`로 시작)
- **lessons patterns**: 공통 실패 패턴 공유

---

## License

MIT

---

*Sentix — 요청 하나, 자율 실행, 결과 확인.*
*by JANUS*
