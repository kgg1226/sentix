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

---

## Governor Architecture

```
사람: "요청"
  │
  ▼
┌─────────────────────────────────────┐
│            GOVERNOR                  │
│  전체 상태 보유. 동적 판단.            │
│  에이전트 소환 → 결과 수거 → 분기.     │
└──────────┬──────────────────────────┘
           │
     ┌─────┼─────┬─────────┬──────────┐
     ▼     ▼     ▼         ▼          ▼
  planner  dev  pr-review  security  roadmap
     │     │     │         │          │
     └─────┴─────┴─────────┴──────────┘
           │
           ▼
        에이전트 간 직접 통신 없음
        전부 Governor를 경유
```

Governor는 모든 것을 안다. 에이전트는 Governor가 준 것만 안다.

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
│   │   └── ollama.toml       # Local First 어댑터
│   └── rules/
│       └── hard-rules.md     # 불변 규칙 6개 격리
├── tasks/
│   ├── lessons.md            # 실패 패턴 자동 축적
│   ├── roadmap.md            # 고도화 계획
│   ├── security-report.md    # 보안 스캔 결과
│   └── tickets/              # planner 생성 티켓
├── env-profiles/             # 배포 환경 프로필 (선택)
├── agent-profiles/           # 에이전트 설정 (선택)
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
sentix status            # Governor 상태 + Memory Layer 요약
sentix doctor            # 설치 상태 진단
sentix metrics           # 에이전트 성공률/재시도율 분석
sentix plugin list       # 플러그인 목록
sentix plugin create     # 커스텀 플러그인 생성
```

---

## 6 Hard Rules (파괴 방지)

Governor도 우회할 수 없는 불변 규칙:

1. **작업 전 테스트 스냅샷 필수**
2. **티켓 SCOPE 밖 파일 수정 금지**
3. **기존 export/API 삭제 금지**
4. **기존 테스트 삭제/약화 금지**
5. **순삭제 50줄 제한**
6. **기존 기능/핸들러 삭제 금지** — "버그가 있는 기능은 고치는 것이지, 없애는 것이 아니다."

---

## Environment Profiles

한 번 설정하면 배포 방식이 자동으로 결정된다.

| method | 동작 | 대상 |
|---|---|---|
| `ssm` | AWS SSM 자동 실행 | 오픈 EC2 |
| `ssh` | SSH 자동 실행 | NAS, 온프레미스 |
| `manual` | 스크립트 생성 → 알림 | VPN, 폐쇄망 |
| `local` | 로컬 Docker 실행 | 개발 환경 |

---

## Learning Loops

Sentix는 세 가지를 자동으로 학습한다:

| Layer | 파일 | 학습 대상 |
|---|---|---|
| Failure | `lessons.md` | 실패 패턴 → 같은 실수 방지 |
| Behavior | `patterns.md` | 사용자 행동 → 선제 준비 |
| Visual | `visual-preferences.md` | 시각 선호 → 맞춤 생성 |

인간이 "이거 기억해"라고 지시할 필요 없다.

---

## Contributing

- **env-profiles**: 새 환경 프로필 추가 (AWS ECS, GCP, k8s 등)
- **providers**: 새 AI 어댑터 추가 (Gemini, Mistral 등)
- **plugins**: CLI 플러그인 (sentix plugin create로 시작)
- **lessons patterns**: 공통 실패 패턴 공유

---

## License

MIT

---

*Sentix — 요청 하나, 자율 실행, 결과 확인.*
*by JANUS*
