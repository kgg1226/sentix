# Sentix

**AI가 알아서 코드를 짜고, 검사하고, 배포까지 하는 개발·배포 총괄 프레임워크.**

> 당신은 "뭐 해줘" 한 마디만 하면 됩니다. 나머지는 Sentix가 합니다.

---

## 이게 뭔가요?

프로그래밍 프로젝트에서, AI에게 일을 시킬 때 이런 과정이 필요합니다:

```
보통의 방법 (사람이 다 해야 함):
  1. 무엇을 만들지 정리한다         ← 사람
  2. 코드를 짠다                  ← AI한테 시킴
  3. 코드가 맞는지 검토한다         ← 사람
  4. 서버에 올린다                 ← 사람
  5. 보안에 문제 없는지 확인한다     ← 사람
  6. 다음에 뭘 할지 생각한다        ← 사람
```

Sentix를 쓰면:

```
Sentix 방법 (사람은 첫 줄만):
  1. "로그인에 세션 만료 추가해줘"   ← 사람 (이것만!)
  2. 무엇을 만들지 정리한다         ← planner (AI)
  3. 코드를 짠다                  ← dev (AI)
  4. 코드가 맞는지 검토한다         ← pr-review (AI)
  5. 서버에 올린다                 ← devops (자동 스크립트)
  6. 보안에 문제 없는지 확인한다     ← security (AI)
  7. 다음에 뭘 할지 제안한다        ← roadmap (AI)
  8. "완료됐습니다" 보고            ← 사람에게 결과만 전달
```

**한 줄 요약: AI 에이전트들이 따라야 할 "업무 규칙서"입니다.**

---

## 어떻게 작동하나요?

Governor라는 "총감독"이 있고, 6명의 "직원(에이전트)"이 있습니다.

```
당신: "이거 해줘"
  │
  ▼
┌──────────────────────────┐
│       총감독 (Governor)    │  ← 전체 상황을 파악하고 지시
└────────────┬─────────────┘
             │
   ┌─────────┼─────────┬──────────┬──────────┐
   ▼         ▼         ▼          ▼          ▼
 기획자    개발자    검토자     보안관     전략가
(planner)  (dev)  (pr-review) (security) (roadmap)

   각 직원은 자기 일만 하고, 결과를 총감독에게 보고합니다.
   직원끼리 직접 대화하지 않습니다.
```

실패하면? 자동으로 수정합니다 (dev-fix).
또 실패하면? 재시도합니다 (심각하면 3회, 보통이면 10회).
그래도 안 되면? 사람에게 알립니다.

---

## 설치 방법

### 필요한 것

- [Node.js](https://nodejs.org/) 18 이상
- Git
- Claude 접근 (아래 중 하나):
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — 완전 자동
  - [claude.ai](https://claude.ai) 웹/모바일 — 안내 모드
  - Claude API — 도구 연결 시 완전 자동

### 방법 1: 명령어 한 줄 (가장 쉬움)

```bash
# 당신의 프로젝트 폴더에서:
npx sentix init
```

이것만 하면 됩니다. 필요한 파일이 자동으로 만들어집니다.

### 방법 2: 설치 스크립트

```bash
# Mac / Linux
bash install-sentix.sh /path/to/your-project

# Windows PowerShell
.\install-sentix.ps1 -Target C:\path\to\your-project
```

### 방법 3: 수동 복사

```bash
# 1. 규칙서 2개 복사
cp FRAMEWORK.md CLAUDE.md /path/to/your-project/

# 2. 설정 폴더 복사
cp -r .sentix/ /path/to/your-project/.sentix/

# 3. 학습 폴더 생성
mkdir -p /path/to/your-project/tasks/tickets
```

### 설치 확인

```bash
cd /path/to/your-project
npx sentix doctor
```

모든 항목이 ✓ 이면 성공입니다.

---

## 사용 방법

Sentix는 **어디서든** 작동합니다. 환경에 따라 자동으로 모드가 결정됩니다.

### 환경별 사용법

| 환경 | 방법 | 자동화 수준 |
|---|---|---|
| **Claude Code / Cursor / Windsurf** | CLAUDE.md가 있는 프로젝트에서 대화하면 자동 작동 | 완전 자동 |
| **claude.ai 웹** | CLAUDE.md를 Project Knowledge에 업로드하고 대화 | 반자동 (실행은 사용자) |
| **Claude 모바일 앱** | CLAUDE.md 내용을 대화에 붙여넣고 요청 | 안내 모드 |
| **Claude API** | system prompt에 CLAUDE.md 포함 | 완전 자동 (도구 제공 시) |

### 1. Claude Code / Cursor / Windsurf (완전 자동)

**설정:** 없음. CLAUDE.md가 있는 프로젝트 폴더에서 대화를 시작하면 자동으로 Governor 모드가 됩니다.

```
당신: "로그인에 세션 만료 추가해줘"

Claude (Governor):
  1. 요청 분석 → FEATURE 파이프라인 선택
  2. node bin/sentix.js feature add "세션 만료 추가"  → 티켓 생성
  3. 코드 직접 구현
  4. 테스트 실행
  5. node bin/sentix.js version bump minor            → 버전 올림
  6. "완료됐습니다" 보고
```

### 2. claude.ai 웹 (반자동)

**설정 방법:**

1. [claude.ai](https://claude.ai)에서 프로젝트를 생성합니다
2. 프로젝트 설정 → **Project Knowledge**에 아래 파일들을 업로드합니다:
   - `CLAUDE.md` (필수)
   - `FRAMEWORK.md` (권장)
   - `tasks/lessons.md` (있다면)
3. 대화를 시작하면 Claude가 자동으로 Governor로서 행동합니다

```
당신: "로그인에 세션 만료 추가해줘"

Claude (Governor):
  1. [SENTIX:FEATURE] feat-001: 세션 만료 추가 (complexity: medium)
  2. 코드 변경을 코드 블록으로 제시
  3. "npm run test를 실행해서 결과를 공유해주세요"
  4. [SENTIX:VERSION] "이 명령어를 실행하세요: node bin/sentix.js version bump minor"
  5. 완료 보고
```

> 코드 실행은 사용자가 직접 합니다. Claude는 무엇을 어디에 적용할지 안내합니다.

### 3. Claude 모바일 앱 (안내 모드)

**설정 방법:**

1. CLAUDE.md 파일의 내용을 복사합니다
2. 새 대화를 시작하고, 첫 메시지에 CLAUDE.md 내용을 붙여넣습니다:
   ```
   아래 CLAUDE.md를 읽고 Governor로서 행동해줘.

   [CLAUDE.md 내용 붙여넣기]
   ```
3. 그 다음부터 평소처럼 요청하면 됩니다

> 파일 접근이 불가능하므로, 모든 코드는 코드 블록으로 제시되고 실행은 사용자가 합니다.

### 4. Claude API (완전 자동)

```python
# system prompt에 CLAUDE.md 내용을 포함시킵니다
import anthropic

client = anthropic.Anthropic()

with open("CLAUDE.md") as f:
    claude_md = f.read()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    system=claude_md,
    messages=[{"role": "user", "content": "로그인에 세션 만료 추가해줘"}],
    # tools를 제공하면 파일 읽기/쓰기, 명령 실행도 가능
)
```

> `tools`에 파일시스템/터미널 도구를 제공하면 CLI 모드처럼 완전 자동화됩니다.

### 상태 확인 (CLI 모드)

```bash
sentix status
```

현재 어떤 단계를 실행 중인지, 티켓 상태, 학습 데이터가 얼마나 쌓였는지 보여줍니다.

---

## CLI 명령어 전체 목록

### 기본

| 명령어 | 하는 일 |
|---|---|
| `sentix init` | 프로젝트에 Sentix 설치 (자동으로 기술 스택 감지) |
| `sentix run "요청"` | AI 파이프라인 실행 |
| `sentix status` | 현재 상태 보기 (Governor + 티켓 + 학습) |
| `sentix doctor` | 설치가 제대로 됐는지 확인 |
| `sentix metrics` | AI 성공률/재시도 통계 보기 |
| `sentix update` | 프레임워크 파일을 최신 sentix로 업데이트 |
| `sentix update --dry` | 업데이트 미리보기 (변경 없이 확인만) |
| `sentix context` | 연동 프로젝트 컨텍스트 가져오기 |
| `sentix context --list` | 연동 프로젝트 접근 상태 확인 |

### 버전 관리

| 명령어 | 하는 일 |
|---|---|
| `sentix version current` | 현재 버전 + git tag 확인 |
| `sentix version bump [major\|minor\|patch]` | 버전 올림 + CHANGELOG + git tag |
| `sentix version changelog` | CHANGELOG 미리보기 |

### 버그/이슈 티켓

| 명령어 | 하는 일 |
|---|---|
| `sentix ticket create "설명"` | 버그 티켓 생성 (severity 자동 분류) |
| `sentix ticket list` | 티켓 목록 (필터링 가능) |
| `sentix ticket debug <id>` | AI가 자동으로 디버깅 |

### 기능 추가

| 명령어 | 하는 일 |
|---|---|
| `sentix feature add "설명"` | 기능 티켓 + 복잡도 평가 + 영향 분석 |
| `sentix feature list` | 기능 목록 |
| `sentix feature impact "설명"` | 영향 분석만 실행 |

### 플러그인

| 명령어 | 하는 일 |
|---|---|
| `sentix plugin list` | 플러그인 목록 보기 |
| `sentix plugin create 이름` | 나만의 플러그인 만들기 |

각 명령어에 `--help`를 붙이면 상세 설명이 나옵니다:

```bash
sentix version --help
```

---

## 설치하면 생기는 파일들

```
내 프로젝트/
├── FRAMEWORK.md          ← 설계 문서 (사람이 읽는 전체 구조 설명)
├── CLAUDE.md             ← AI가 읽는 실행 인덱스 (환경 자동 적응 + 상세는 docs/ 참조)
├── INTERFACE.md          ← 다른 프로젝트와 연결할 때 쓰는 계약서
├── registry.md           ← 연결된 프로젝트 목록
│
├── docs/                 ← 상세 규칙 (CLAUDE.md에서 참조, 필요할 때만 로드)
│   ├── governor-sop.md   ← 파이프라인별 SOP 상세 + 실행 예시
│   ├── agent-scopes.md   ← 에이전트별 파일 범위 매트릭스
│   ├── severity.md       ← severity 분기 로직
│   └── architecture.md   ← Mermaid 아키텍처 다이어그램
│
├── .sentix/              ← 설정 폴더
│   ├── config.toml       ← 기능 켜기/끄기 + 자동 버전 범프 설정
│   ├── providers/        ← AI 선택 (Claude, OpenAI, Ollama)
│   └── rules/            ← 절대 어기면 안 되는 규칙 6개
│
├── tasks/                ← AI가 학습하는 폴더 (자동으로 채워짐)
│   ├── lessons.md        ← 실패에서 배운 것
│   ├── patterns.md       ← 사용자 행동 패턴
│   ├── roadmap.md        ← 앞으로 할 일 계획
│   └── tickets/          ← 작업 티켓 + index.json (자동 관리)
│
└── (기존 프로젝트 파일들은 그대로)
```

**기존 프로젝트 파일은 건드리지 않습니다.** 새 파일만 추가됩니다.

---

## AI는 어떤 걸 쓸 수 있나요?

`.sentix/providers/` 폴더에서 설정합니다:

| AI | 파일 | 특징 |
|---|---|---|
| **Claude** (기본) | `claude.toml` | 가장 정확함. Claude Code 필요 |
| **OpenAI** | `openai.toml` | GPT-4o 사용. API 키 필요 |
| **Ollama** | `ollama.toml` | 인터넷 없이 로컬에서 실행 가능 |

---

## 배포는 어떻게 하나요?

`env-profiles/` 폴더에 환경을 설정하면, AI가 알아서 배포합니다.

| 환경 | 설정값 | 설명 |
|---|---|---|
| AWS EC2 | `method = "ssm"` | AWS 명령어로 자동 배포 |
| NAS/서버 | `method = "ssh"` | SSH로 자동 배포 |
| VPN 내부 | `method = "manual"` | 스크립트만 만들어줌 (직접 실행) |
| 내 컴퓨터 | `method = "local"` | Docker로 바로 실행 |

```bash
# 환경 전환은 이것만:
cd env-profiles
ln -sf local-dev.toml active.toml   # 로컬 개발용
# ln -sf nas-onprem.toml active.toml  # NAS 배포용
```

---

## 절대 어기면 안 되는 규칙 6개

AI도 이 규칙은 무시할 수 없습니다:

| # | 규칙 | 왜? |
|---|---|---|
| 1 | 작업 전에 테스트 결과를 저장해둬야 한다 | 나중에 비교하려고 |
| 2 | 맡은 범위 밖의 파일은 건드리면 안 된다 | 다른 기능이 망가질 수 있어서 |
| 3 | 이미 있는 API를 삭제하면 안 된다 | 다른 곳에서 쓰고 있을 수 있어서 |
| 4 | 이미 있는 테스트를 삭제하면 안 된다 | 테스트가 실패하면 코드를 고쳐야지, 테스트를 지우면 안 됨 |
| 5 | 한 번에 50줄 넘게 삭제하면 안 된다 | 큰 삭제는 별도 작업으로 분리 |
| 6 | **이미 있는 기능을 삭제하면 안 된다** | 버그는 고치는 거지, 없애는 게 아님 |

---

## 학습 기능

Sentix는 사용할수록 똑똑해집니다:

| 뭘 배우나? | 어디에 저장? | 예시 |
|---|---|---|
| 실패에서 배운 것 | `tasks/lessons.md` | "이 라이브러리는 이렇게 쓰면 에러남" |
| 사용자 행동 패턴 | `tasks/patterns.md` | "매주 월요일마다 보안 스캔을 요청함" |
| 다음에 할 것 예측 | `tasks/predictions.md` | "이번에도 테스트 커버리지 올려달라고 할 것 같음" |

**"이거 기억해"라고 말할 필요 없습니다.** 자동으로 기억합니다.

---

## 컨텍스트 관리

Sentix는 AI의 토큰 낭비를 줄이기 위해 **Lazy Loading** 구조를 사용합니다.

```
CLAUDE.md (경량 인덱스, ~100줄)
  ├── "상세 SOP → docs/governor-sop.md"       ← 필요할 때만 로드
  ├── "에이전트 범위 → docs/agent-scopes.md"   ← 필요할 때만 로드
  ├── "severity → docs/severity.md"            ← 필요할 때만 로드
  └── "아키텍처 → docs/architecture.md"         ← Mermaid 다이어그램
```

또한 주요 폴더에 **폴더별 CLAUDE.md**를 두어, AI가 해당 디렉토리에 진입했을 때 필요한 컨텍스트만 로드합니다:

| 폴더 | CLAUDE.md 내용 |
|------|---------------|
| `src/` | 모듈 구조, registry 패턴, context API |
| `src/commands/` | 명령어 추가법, 기존 명령어 목록 |
| `.github/workflows/` | 워크플로우 개요, 공급망 보안 정책 |
| `agent-profiles/` | TOML 포맷, 에이전트 설정 |

---

## 테스트

```bash
npm test
```

Node.js 내장 테스트 러너를 사용합니다. `__tests__/` 디렉토리에 테스트 파일이 있습니다.

---

## 업데이트 방법

Sentix가 업데이트되면 (보안 강화, 워크플로우 개선 등), 이미 설치된 프로젝트에도 적용해야 합니다.

### 방법 1: sentix update (최신 sentix 설치 시)

```bash
sentix update          # 실제 적용
sentix update --dry    # 미리보기만
```

### 방법 2: 독립 스크립트 (구형 sentix에서도 동작)

```bash
# sentix 버전에 관계없이 항상 동작합니다
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash

# 미리보기
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash -s -- --dry
```

### 방법 3: 자동 동기화 (registry 등록 시)

sentix의 `registry.md`에 등록된 프로젝트는 프레임워크 파일 변경 시 자동으로 PR을 받습니다.

### 무엇이 업데이트되나요?

| 업데이트 됨 (프레임워크 공통) | 안 됨 (프로젝트 고유) |
|---|---|
| `.github/workflows/deploy.yml` | `CLAUDE.md` |
| `.github/workflows/security-scan.yml` | `.sentix/config.toml` |
| `.sentix/rules/hard-rules.md` | `.sentix/providers/` |
| `FRAMEWORK.md` | `env-profiles/`, `tasks/` |
| `docs/*.md` (SOP, scopes, severity, architecture) | 폴더별 `CLAUDE.md` |

**프로젝트 고유 설정은 절대 덮어쓰지 않습니다.**

---

## 여러 프로젝트를 연결하면?

프로젝트 A의 API를 바꿀 때, 프로젝트 B가 그 API를 쓰고 있으면:

```
프로젝트 A: "인증 API 바꿔줘"
  ↓
Sentix: "잠깐, 프로젝트 B가 이 API 쓰고 있네."
  ↓
Sentix: "프로젝트 B가 안 망가지게 호환되는 방식으로 바꿀게."
  ↓
배포 후: 프로젝트 B에도 자동으로 테스트 실행
```

이걸 위해 `INTERFACE.md` (API 계약서)와 `registry.md` (연결 목록)가 있습니다.

### 다른 프로젝트 파일 읽기

```bash
# 연동 프로젝트 목록 + 접근 상태 확인
sentix context --list

# 프로젝트 컨텍스트 가져오기 (INTERFACE.md, README.md)
sentix context asset-manager

# 스키마까지 포함 (package.json, config, lessons.md)
sentix context asset-manager --full
```

로컬(`../asset-manager/`)에 있으면 파일시스템으로, 없으면 GitHub에서 가져옵니다.
가져온 파일은 `tasks/context/asset-manager/`에 캐시되어 AI가 바로 참조할 수 있습니다.

또한 sentix 프레임워크 자체가 업데이트되면:

```
sentix: 보안 워크플로우 강화 (Trivy 추가, SHA 핀 고정)
  ↓
sync-framework: registry.md에 등록된 프로젝트 감지
  ↓
프로젝트 A, B, C: 자동 PR 생성 (변경 내역 + diff 포함)
  ↓
각 프로젝트 담당자: 리뷰 후 병합
```

---

## 개발 서버 (개발자용)

대시보드를 만들 때 쓰는 테스트 서버입니다:

```bash
npm run dev    # http://localhost:4400 에서 실행
```

| 주소 | 내용 |
|---|---|
| `/api/status` | 전체 상태 요약 |
| `/api/governor` | 현재 실행 중인 작업 |
| `/api/tickets` | 전체 티켓 목록 (버그 + 기능) |
| `/api/features` | 기능 티켓만 필터링 |
| `/api/version` | 현재 버전 정보 |
| `/api/lessons` | 학습한 실패 패턴 |
| `/api/patterns` | 사용자 행동 패턴 |
| `/api/predictions` | 다음 요청 예측 |
| `/api/metrics` | AI 성공률 통계 |
| `/api/pattern-log` | 최근 이벤트 로그 (100건) |
| `/api/security` | 보안 리포트 |
| `/api/roadmap` | 로드맵 |
| `/health` | 서버 정상 여부 |

---

## FAQ

**Q: 기존 프로젝트에 Sentix를 설치하면 기존 코드가 바뀌나요?**
A: 아닙니다. 새 파일만 추가됩니다. 기존 코드는 그대로입니다.

**Q: Claude Code가 없으면 쓸 수 없나요?**
A: 아닙니다. Sentix는 환경에 맞게 자동 적응합니다:
- **Claude Code / Cursor** — 완전 자동 (파이프라인 직접 실행)
- **claude.ai 웹/모바일** — 안내 모드 (코드 블록 + 실행 지시)
- **Claude API** — 도구(tool) 제공 시 완전 자동
CLAUDE.md를 읽은 Claude는 어떤 환경이든 Governor로서 동작합니다.

**Q: 무료인가요?**
A: Sentix 자체는 무료(MIT). AI 사용 비용은 AI 제공자(Anthropic, OpenAI 등)에 따라 다릅니다.

**Q: 어떤 프로그래밍 언어를 지원하나요?**
A: 자동 감지: Node.js, Python, Go, Rust. 그 외 언어도 CLAUDE.md를 수동으로 편집하면 사용 가능합니다.

**Q: 위험하지 않나요? AI가 마음대로 코드를 바꾸면?**
A: 6개 하드 룰이 있습니다. 기존 기능 삭제 금지, 범위 밖 수정 금지, 테스트 삭제 금지 등.
이 규칙은 AI도 무시할 수 없습니다.

---

## 정리

```
1. sentix init                     ← 설치 (1분)
2. CLAUDE.md 기술 스택 확인           ← 확인 (1분)
3. sentix doctor                   ← 검증 (10초)
4. sentix run "하고 싶은 것"         ← 사용 (끝!)
```

---

## Contributing

- **env-profiles**: 새 배포 환경 추가 (AWS ECS, GCP, k8s 등)
- **providers**: 새 AI 추가 (Gemini, Mistral 등)
- **plugins**: 커스텀 플러그인 (`sentix plugin create`로 시작)

---

## License

MIT

---

*Sentix — 한 마디면 충분합니다.*
*by JANUS*
