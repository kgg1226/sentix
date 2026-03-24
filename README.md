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
  └─ planner       티켓 생성 (scope, complexity, deploy 판단)
  └─ dev / swarm   구현 (복잡하면 병렬, 단순하면 단독)
  └─ pr-review     scope 검증 + 자동 머지
  └─ devops        환경에 맞게 배포 (또는 건너뜀)
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
| 에이전트 관계 | 독립 (통신 없음) | 리더-워커 (메시징) | **직렬 핸드오프 + 조건부 분기** |
| 품질 게이트 | 없음 | 없음 | **security, pr-review, health check** |
| 배포 | 범위 밖 | 범위 밖 | **환경 어댑터 (SSM/SSH/manual/local)** |
| 학습 | 없음 | 없음 | **lessons.md 자동 축적** |
| 재시도 | 없음 | 없음 | **severity 기반 자동 (critical 3회, warning 10회)** |

Sentix는 자율 주행 차량이다. 목적지를 말하면 차가 알아서 간다.

---

## Quick Start

### 1. 프로젝트에 Sentix 구조 추가

```bash
git clone https://github.com/kgg1226/sentix-template.git .sentix-config
cp -r .sentix-config/{AGENTS.md,env-profiles,agent-profiles,scripts} ./
mkdir -p tasks/{tickets,messages} && touch tasks/lessons.md
```

### 2. 환경 프로필 설정

```bash
cd env-profiles

# 당신의 환경에 맞는 프로필 선택
ln -sf local-dev.toml active.toml       # 로컬 Docker
# ln -sf open-cloud.toml active.toml    # 오픈 EC2 (SSM)
# ln -sf nas-onprem.toml active.toml    # NAS (SSH)
# ln -sf my-custom.toml active.toml     # 직접 작성

cd ..
```

### 3. 실행

**CI 환경 (GitHub Actions):**
```bash
# .github/workflows/deploy.yml, security-scan.yml 복사
# push to master → 자동 실행
```

**CI 불가 환경 (VPN, 폐쇄망):**
```bash
sentix daemon --profile active
# 로컬에서 파이프라인 자율 실행
```

---

## 핵심 파일 구조

```
project/
├── AGENTS.md                    # 에이전트 라우팅 규칙 (SSoT)
├── env-profiles/
│   ├── active.toml → local.toml # 현재 활성 배포 환경
│   ├── template.toml            # 빈 템플릿 (주석 가이드)
│   └── *.toml                   # 환경별 프로필
├── agent-profiles/
│   └── default.toml             # 에이전트별 프로그램/설정
├── scripts/
│   └── deploy.sh                # 범용 배포 스크립트 (프로필 기반)
├── tasks/
│   ├── tickets/                 # planner가 생성하는 티켓
│   ├── messages/                # 에이전트 간 비동기 질의
│   ├── lessons.md               # 자동 축적되는 실패 패턴
│   ├── security-report.md       # 최신 보안 스캔 결과
│   ├── deploy-output.md         # 배포 결과 또는 manual 스크립트
│   └── roadmap.md               # 고도화 계획 + 다음 티켓
├── .github/workflows/
│   ├── deploy.yml               # CI 배포 파이프라인
│   └── security-scan.yml        # CI 보안 스캔
└── DESIGN.md                    # 설계 원칙
```

---

## 에이전트 파이프라인

### 기본 플로우 (직렬)
```
요청 → planner → dev → pr-review → devops → security → roadmap
                                      ↑                    │
                                      └── dev-fix ←────────┘
```

### 복잡한 작업 (dev-swarm)
```
요청 → planner (COMPLEXITY: high)
         └→ dev-lead
              ├→ worker-db   ──┐
              ├→ worker-ui   ──┤──→ merge → pr-review → ...
              └→ worker-api ←─┘ (blocked-by db)
```

### 조건부 분기
```
DEPLOY_FLAG: false  → devops 건너뜀 → security 직행
access.method: manual → 스크립트 생성 → [MANUAL_PENDING] → security
severity: critical → dev-fix 3회 → 실패 시 roadmap 에스컬레이션
severity: suggestion → 로깅만 → 파이프라인 계속
```

---

## 환경 프로필

한 번 설정하면 배포 방식이 자동으로 결정된다.

| access.method | 동작 | 대상 환경 |
|---|---|---|
| `ssm` | AWS SSM 자동 실행 | 오픈 EC2 |
| `ssh` | SSH 자동 실행 | NAS, 온프레미스 |
| `manual` | 스크립트 생성 → 알림 | VPN 내부, 폐쇄망 |
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

## 학습 루프

Sentix는 실패에서 배운다. 인간이 가르칠 필요 없다.

```
1. dev-fix 실행 → LESSON_LEARNED 자동 기록
2. lessons.md에 패턴 축적
3. 다음 planner 실행 시 lessons.md가 컨텍스트로 주입
4. 동일 패턴 3회 반복 → roadmap에 구조적 개선 항목 자동 승격
```

예시 (`tasks/lessons.md`):
```
- [dev-fix] Docker build OOM on t4g.small → swap 2GB 필수 확인 후 빌드
- [dev-fix] Prisma 7 breaking change: findFirst → findFirstOrThrow 자동 교체 금지
- [dev-fix] SQLite foreign key 에러 → PRAGMA foreign_keys=ON 누락 패턴
```

---

## 인간 개입 지점

| 상황 | 개입 여부 | 이유 |
|---|---|---|
| 기능 요청/버그 리포트 | ✅ 입력 | 파이프라인 시작점 |
| 티켓 생성 | ❌ | planner 자동 |
| 코드 구현 | ❌ | dev/dev-swarm 자동 |
| 코드 리뷰 | ❌ | pr-review 자동 검증 |
| 배포 (SSM/SSH) | ❌ | scripts/deploy.sh 자동 |
| 배포 (VPN) | ✅ 스크립트 실행 | 네트워크 제한 |
| 보안 스캔 | ❌ | security 자동 |
| 보안 critical 판단 | ✅ 확인 | dev-fix 3회 실패 시만 |
| 재시도 | ❌ | severity 기반 자동 |
| 고도화 계획 | ❌ | roadmap 자동 |
| 다음 티켓 실행 | ❌ (선택적 ✅) | 자동 실행 가능, 방향 조정 원하면 개입 |

---

## Contributing

Sentix는 JANUS 팀이 개발하고 오픈소스로 공개한다.

기여 방법:
- **env-profiles**: 새 환경 프로필 추가 (AWS ECS, GCP, k8s 등)
- **agent-profiles**: 새 에이전트 조합 (Codex, Aider 등)
- **security checks**: 보안 스캔 항목 추가
- **lessons patterns**: 공통 실패 패턴 공유

---

## License

MIT

---

*Sentix — 요청 하나, 자율 실행, 결과 확인.*
*by JANUS*
