# Sentix

**AI가 알아서 코드를 짜고, 검사하고, 배포까지 하는 개발·배포 총괄 프레임워크.**

> 당신은 "뭐 해줘" 한 마디만 하면 됩니다. 나머지는 Sentix가 합니다.

---

## 빠른 시작

```bash
npx sentix init        # 프로젝트에 설치 (1분)
```

**끝입니다.** 이제 Claude Code, Cursor, Windsurf 등에서 평소처럼 대화하세요.

```
당신: "로그인에 세션 만료 추가해줘"

→ Sentix가 자동으로 기획 → 코드 → 검토 → 테스트 → 버전 관리까지 수행합니다.
```

별도 명령어 없이, CLAUDE.md가 있는 프로젝트에서 대화를 시작하면 자동으로 작동합니다.

> `sentix run "요청"`은 **선택사항**입니다 — 체인 파이프라인(PLAN→DEV→GATE→REVIEW→FINALIZE) + 검증 게이트 + 메트릭 기록이 필요할 때만 사용합니다.

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

## 환경별 설치 및 사용법

Sentix는 **어디서든** 작동합니다. 환경에 따라 설치 방법과 자동화 수준이 다릅니다.

| 환경 | 설치 | 사용 | 업데이트 | 자동화 수준 |
|---|---|---|---|---|
| **Claude Code / Cursor / Windsurf** | `npx sentix init` | 그냥 대화 | `npm install -g sentix@latest` → `sentix update` | 완전 자동 |
| **claude.ai 웹** | Project Knowledge에 파일 업로드 | 그냥 대화 | 파일 교체 → 새 대화 | 반자동 |
| **Claude 모바일 앱** | CLAUDE.md 붙여넣기 | 그냥 대화 | 최신 CLAUDE.md 복사 → 붙여넣기 | 안내 모드 |
| **Claude API / MCP** | system prompt에 CLAUDE.md 포함 | API 호출 | CLAUDE.md 교체 또는 URL fetch | 완전 자동 (도구 제공 시) |

### 1. Claude Code / Cursor / Windsurf (완전 자동)

**설치:**

```bash
# 프로젝트 폴더에서:
npx sentix init
```

이것만 하면 전부 자동으로 처리됩니다:

```
npx sentix init
  ↓ CLAUDE.md, .sentix/, tasks/, docs/ 생성
  ↓ 기술 스택 자동 감지 (Node.js, Python, Go, Rust)
  ↓ FRAMEWORK.md 등 프레임워크 파일 자동 동기화
  ↓ git pre-commit hook 설치 (검증 게이트)
  ↓ 설치 상태 자동 진단 (sentix doctor)
  ↓ 완료
```

> **`npx` vs 글로벌 설치:**
> - `npx sentix ...` — 설치 없이 바로 실행 (매번 `npx` 붙여야 함)
> - `npm install -g sentix` — 한 번 설치하면 그 뒤부터 `sentix ...`만으로 실행 가능

**사용:** 별도 명령어 없이, CLAUDE.md가 있는 프로젝트에서 **대화를 시작하면 자동으로 Governor 모드가 됩니다.**

```
당신: "로그인에 세션 만료 추가해줘"

Claude (Governor):
  1. 요청 분석 → FEATURE 파이프라인 선택
  2. 티켓 생성 + 코드 직접 구현 + 테스트 실행
  3. 버전 올림 + "완료됐습니다" 보고
```

**업데이트:**

```bash
# Step 1: sentix 패키지 자체를 최신으로
npm install -g sentix@latest

# Step 2: 프로젝트 프레임워크 파일 동기화
sentix update          # 실제 적용
sentix update --dry    # 미리보기만
```

> **`sentix update`를 했는데 구버전이 계속 올라온다면?**
> `sentix update`는 프레임워크 파일만 동기화하는 명령입니다.
> sentix 패키지 자체는 `npm install -g sentix@latest`로 먼저 업데이트해야 합니다.

> **npx로 사용 중이라면?** 캐시 때문에 구버전이 실행될 수 있습니다:
> ```bash
> npx sentix@latest update    # 최신 버전 강제 사용
> ```

### 2. claude.ai 웹 (반자동)

**설치:**

1. [claude.ai](https://claude.ai)에서 프로젝트를 생성합니다
2. 프로젝트 설정 → **Project Knowledge**에 아래 파일들을 업로드합니다:
   - `CLAUDE.md` (필수)
   - `FRAMEWORK.md` (권장)
   - `tasks/lessons.md` (있다면)

**사용:** 대화를 시작하면 Claude가 자동으로 Governor로서 행동합니다.

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

**업데이트:**

```
1. GitHub에서 최신 파일 다운로드:
   https://github.com/kgg1226/sentix → Releases → Latest

2. claude.ai → 해당 프로젝트 → Project Knowledge

3. 기존 파일 삭제 후 최신 파일로 다시 업로드 (CLAUDE.md, FRAMEWORK.md)

4. 새 대화를 시작하면 최신 규칙이 적용됩니다.
```

> Project Knowledge는 기존 대화에 소급 적용되지 않습니다. 업데이트 후 **새 대화**를 시작하세요.

### 3. Claude 모바일 앱 (안내 모드)

**설치 + 사용:**

1. CLAUDE.md 파일의 내용을 복사합니다
2. 새 대화를 시작하고, 첫 메시지에 CLAUDE.md 내용을 붙여넣습니다:
   ```
   아래 CLAUDE.md를 읽고 Governor로서 행동해줘.

   [CLAUDE.md 내용 붙여넣기]
   ```
3. 그 다음부터 평소처럼 요청하면 됩니다

> 파일 접근이 불가능하므로, 모든 코드는 코드 블록으로 제시되고 실행은 사용자가 합니다.

**업데이트:** GitHub에서 최신 CLAUDE.md의 Raw 내용을 복사하여 새 대화에 붙여넣습니다.

### 4. Claude API / MCP (완전 자동)

**설치 + 사용:**

```python
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

**업데이트:** CLAUDE.md 파일을 교체하거나, GitHub에서 직접 가져옵니다:

```python
import urllib.request
url = "https://raw.githubusercontent.com/kgg1226/sentix/main/CLAUDE.md"
system_prompt = urllib.request.urlopen(url).read().decode()
```

### 기타 설치 방법

<details>
<summary>설치 스크립트 / 수동 복사</summary>

**설치 스크립트:**

```bash
# Mac / Linux
bash install-sentix.sh /path/to/your-project

# Windows PowerShell
.\install-sentix.ps1 -Target C:\path\to\your-project
```

**수동 복사:**

```bash
cp FRAMEWORK.md CLAUDE.md /path/to/your-project/
cp -r .sentix/ /path/to/your-project/.sentix/
mkdir -p /path/to/your-project/tasks/tickets
```

</details>

<details>
<summary>기타 업데이트 방법 (독립 스크립트 / 자동 동기화)</summary>

**독립 스크립트** (구형 sentix에서도 동작):

```bash
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash -s -- --dry
```

**자동 동기화:** sentix의 `registry.md`에 등록된 프로젝트는 프레임워크 파일 변경 시 자동으로 PR을 받습니다.

**업데이트 범위:**

| 업데이트 됨 (프레임워크 공통) | 안 됨 (프로젝트 고유) |
|---|---|
| `FRAMEWORK.md`, `docs/*.md` | `CLAUDE.md` |
| `.sentix/rules/hard-rules.md` | `.sentix/config.toml`, `.sentix/providers/` |
| `.github/workflows/*.yml` | `env-profiles/`, `tasks/` |

프로젝트 고유 설정은 절대 덮어쓰지 않습니다.

</details>

---

## 안전장치

### 절대 어기면 안 되는 규칙 6개

AI도 이 규칙은 무시할 수 없습니다:

| # | 규칙 | 왜? |
|---|---|---|
| 1 | 작업 전에 테스트 결과를 저장해둬야 한다 | 나중에 비교하려고 |
| 2 | 맡은 범위 밖의 파일은 건드리면 안 된다 | 다른 기능이 망가질 수 있어서 |
| 3 | 이미 있는 API를 삭제하면 안 된다 | 다른 곳에서 쓰고 있을 수 있어서 |
| 4 | 이미 있는 테스트를 삭제하면 안 된다 | 테스트가 실패하면 코드를 고쳐야지, 테스트를 지우면 안 됨 |
| 5 | 한 번에 50줄 넘게 삭제하면 안 된다 | 큰 삭제는 별도 작업으로 분리 |
| 6 | **이미 있는 기능을 삭제하면 안 된다** | 버그는 고치는 거지, 없애는 게 아님 |

### 검증 게이트 — AI가 아닌 코드가 강제합니다

위 규칙 중 2~5번은 `sentix run` 실행 후 **코드가 자동으로 검증**합니다.
AI에게 "지켜줘"라고 부탁하는 것이 아니라, git diff를 분석하는 결정론적 코드가 위반 여부를 판단합니다.

```
AI 작업 완료
  ↓
검증 게이트 (코드가 판단)
  ✓ 변경 파일이 허용 범위 안에 있는가?
  ✓ 기존 export가 삭제되지 않았는가?
  ✓ 테스트가 삭제되지 않았는가?
  ✓ 순삭제가 50줄 이내인가?
  → 위반 시 경고 + 상세 출력
```

검증 결과는 `sentix metrics`에서 확인할 수 있습니다.

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

## CLI 명령어 전체 목록

> CLI 명령어는 **선택사항**입니다. Claude Code/Cursor에서 대화만 해도 Governor가 필요에 따라 자동으로 호출합니다.
> 직접 실행하고 싶을 때만 사용하세요.

### 기본

| 명령어 | 하는 일 |
|---|---|
| `sentix init` | 프로젝트에 Sentix 설치 (자동으로 기술 스택 감지) |
| `sentix run "요청"` | 체인 파이프라인 실행 (PLAN→DEV→GATE→REVIEW→FINALIZE) |
| `sentix resume` | 중단된 파이프라인 재개 |
| `sentix status` | 현재 상태 보기 (Governor + 티켓 + 학습) |
| `sentix doctor` | 설치가 제대로 됐는지 확인 |
| `sentix metrics` | AI 성공률/재시도 통계 보기 |
| `sentix update` | 프레임워크 파일을 최신 sentix로 동기화 |

### 버전 관리

| 명령어 | 하는 일 |
|---|---|
| `sentix version current` | 현재 버전 + git tag 확인 |
| `sentix version bump [major\|minor\|patch]` | 버전 올림 + CHANGELOG + git tag |
| `sentix version changelog` | CHANGELOG 미리보기 |

### 티켓 / 기능

| 명령어 | 하는 일 |
|---|---|
| `sentix ticket create "설명"` | 버그 티켓 생성 (severity 자동 분류) |
| `sentix ticket list` | 티켓 목록 (필터링 가능) |
| `sentix ticket debug <id>` | AI가 자동으로 디버깅 |
| `sentix feature add "설명"` | 기능 티켓 + 복잡도 평가 + 영향 분석 |
| `sentix feature list` | 기능 목록 |

### 기타

| 명령어 | 하는 일 |
|---|---|
| `sentix context` | 연동 프로젝트 컨텍스트 가져오기 |
| `sentix plugin list` | 플러그인 목록 보기 |
| `sentix plugin create 이름` | 나만의 플러그인 만들기 |
| `sentix safety set <안전어>` | LLM 인젝션 방지 안전어 설정 |

각 명령어에 `--help`를 붙이면 상세 설명이 나옵니다.

---

## 고급 기능

### 런타임 모드

Sentix는 두 가지 모드로 작동합니다:

| | Framework Mode (기본) | Engine Mode |
|---|---|---|
| **AI 호출** | Claude Code/Cursor가 담당 | sentix가 직접 API 호출 |
| **비용** | $0 추가 (구독만) | API 토큰 비용 |
| **파이프라인** | 체인 실행 (PLAN→DEV→GATE→REVIEW→FINALIZE) | 상태 머신 오케스트레이션 |
| **멀티 프로바이더** | 불가 (Claude Code만) | Claude + OpenAI + Ollama 선택 |
| **Headless CI** | Claude Code CLI 필요 | API 키만 있으면 어디서든 |

```bash
sentix run "요청"              # config 기본 모드
sentix run "요청" --engine     # 이번만 engine 모드
sentix run "요청" --single     # 이번만 단일 호출 (legacy)
```

Engine mode 설정:

```bash
# .sentix/config.toml → [runtime] mode = "engine"
export ANTHROPIC_API_KEY=sk-ant-...   # 또는 OPENAI_API_KEY
sentix doctor                         # 확인
```

### 배포

`env-profiles/` 폴더에 환경을 설정하면, AI가 알아서 배포합니다.

| 환경 | 설정값 | 설명 |
|---|---|---|
| AWS EC2 | `method = "ssm"` | AWS 명령어로 자동 배포 |
| NAS/서버 | `method = "ssh"` | SSH로 자동 배포 |
| VPN 내부 | `method = "manual"` | 스크립트만 만들어줌 (직접 실행) |
| 내 컴퓨터 | `method = "local"` | Docker로 바로 실행 |

```bash
cd env-profiles
ln -sf local-dev.toml active.toml   # 환경 전환
```

### AI 프로바이더

`.sentix/providers/` 폴더에서 설정합니다:

| AI | 파일 | 특징 |
|---|---|---|
| **Claude** (기본) | `claude.toml` | 가장 정확함. Claude Code 필요 |
| **OpenAI** | `openai.toml` | GPT-4o 사용. API 키 필요 |
| **Ollama** | `ollama.toml` | 인터넷 없이 로컬에서 실행 가능 |

### 멀티 프로젝트 연동

프로젝트 A의 API를 바꿀 때, 프로젝트 B가 그 API를 쓰고 있으면:

```
프로젝트 A: "인증 API 바꿔줘"
  ↓
Sentix: "잠깐, 프로젝트 B가 이 API 쓰고 있네."
  ↓
Sentix: "프로젝트 B가 안 망가지게 호환되는 방식으로 바꿀게."
```

```bash
sentix context --list                  # 연동 프로젝트 접근 상태 확인
sentix context asset-manager           # 컨텍스트 가져오기
sentix context asset-manager --full    # 스키마까지 포함
```

### 컨텍스트 관리

Sentix는 AI의 토큰 낭비를 줄이기 위해 **Lazy Loading** 구조를 사용합니다.

```
CLAUDE.md (경량 인덱스, ~100줄)
  ├── "상세 SOP → docs/governor-sop.md"       ← 필요할 때만 로드
  ├── "에이전트 범위 → docs/agent-scopes.md"   ← 필요할 때만 로드
  ├── "severity → docs/severity.md"            ← 필요할 때만 로드
  └── "아키텍처 → docs/architecture.md"         ← Mermaid 다이어그램
```

주요 폴더에 **폴더별 CLAUDE.md**를 두어, AI가 해당 디렉토리에 진입했을 때 필요한 컨텍스트만 로드합니다.

---

## 설치하면 생기는 파일들

```
내 프로젝트/
├── FRAMEWORK.md          ← 설계 문서 (사람이 읽는 전체 구조 설명)
├── CLAUDE.md             ← AI가 읽는 실행 인덱스 (이 파일이 핵심)
├── INTERFACE.md          ← 다른 프로젝트와 연결할 때 쓰는 계약서
├── registry.md           ← 연결된 프로젝트 목록
│
├── docs/                 ← 상세 규칙 (필요할 때만 로드)
│   ├── governor-sop.md   ← 파이프라인별 SOP 상세
│   ├── agent-scopes.md   ← 에이전트별 파일 범위
│   ├── severity.md       ← severity 분기 로직
│   └── architecture.md   ← Mermaid 아키텍처 다이어그램
│
├── .sentix/              ← 설정 폴더
│   ├── config.toml       ← 기능 켜기/끄기 + 런타임 모드
│   ├── providers/        ← AI 선택 (Claude, OpenAI, Ollama)
│   └── rules/            ← 절대 어기면 안 되는 규칙 6개
│
├── tasks/                ← AI가 학습하는 폴더 (자동으로 채워짐)
│   ├── lessons.md        ← 실패에서 배운 것
│   ├── patterns.md       ← 사용자 행동 패턴
│   ├── roadmap.md        ← 앞으로 할 일 계획
│   └── tickets/          ← 작업 티켓 + index.json
│
└── (기존 프로젝트 파일들은 그대로)
```

**기존 프로젝트 파일은 건드리지 않습니다.** 새 파일만 추가됩니다.

---

## FAQ

**Q: 기존 프로젝트에 Sentix를 설치하면 기존 코드가 바뀌나요?**
A: 아닙니다. 새 파일만 추가됩니다. 기존 코드는 그대로입니다.

**Q: `sentix run`을 꼭 써야 하나요?**
A: 아닙니다. Claude Code/Cursor/Windsurf에서 **그냥 대화하면 자동으로 작동**합니다.
`sentix run`은 체인 파이프라인 + 검증 게이트 + 메트릭 기록이 필요할 때 쓰는 선택사항입니다.

**Q: Claude Code가 없으면 쓸 수 없나요?**
A: 아닙니다. Sentix는 환경에 맞게 자동 적응합니다:
- **Claude Code / Cursor** — 완전 자동 (파이프라인 직접 실행)
- **claude.ai 웹/모바일** — 안내 모드 (코드 블록 + 실행 지시)
- **Claude API** — 도구(tool) 제공 시 완전 자동

**Q: 무료인가요?**
A: Sentix 자체는 무료(MIT). AI 사용 비용은 AI 제공자(Anthropic, OpenAI 등)에 따라 다릅니다.

**Q: 어떤 프로그래밍 언어를 지원하나요?**
A: 자동 감지: Node.js, Python, Go, Rust. 그 외 언어도 CLAUDE.md를 수동으로 편집하면 사용 가능합니다.

**Q: 위험하지 않나요? AI가 마음대로 코드를 바꾸면?**
A: 6개 하드 룰이 있습니다. 기존 기능 삭제 금지, 범위 밖 수정 금지, 테스트 삭제 금지 등.
이 규칙은 AI도 무시할 수 없습니다.

**Q: `sentix` 명령이 안 됩니다 ("용어가 인식되지 않습니다")**
A: 글로벌 설치가 안 되어 있으면 매번 `npx`를 붙여야 합니다:
```bash
npx sentix doctor    # npx로 실행 (설치 없이)

# 또는 글로벌 설치 후 npx 없이 사용:
npm install -g sentix
sentix doctor
```

**Q: `sentix update`가 "source not found"로 전부 건너뛰기합니다**
A: sentix 패키지가 오래된 경우입니다:
```bash
npm install -g sentix@latest
sentix update
```

**Q: `sentix doctor`에서 FRAMEWORK.md가 MISSING입니다**
A: `sentix init`은 FRAMEWORK.md를 생성하지 않습니다. `sentix update`로 가져옵니다:
```bash
sentix update
```

**Q: `sentix evolve`는 뭔가요?**
A: sentix가 자기 자신의 코드를 분석하고 개선점을 찾는 명령입니다:
```bash
sentix evolve          # 분석만
sentix evolve --auto   # 분석 + critical 이슈 자동 수정
```

---

## 개발 서버 (Sentix 개발자용)

대시보드를 만들 때 쓰는 테스트 서버입니다:

```bash
npm run dev    # http://localhost:4400 에서 실행
```

| 주소 | 내용 |
|---|---|
| `/api/status` | 전체 상태 요약 |
| `/api/governor` | 현재 실행 중인 작업 |
| `/api/tickets` | 전체 티켓 목록 |
| `/api/version` | 현재 버전 정보 |
| `/api/lessons` | 학습한 실패 패턴 |
| `/api/metrics` | AI 성공률 통계 |
| `/health` | 서버 정상 여부 |

---

## 테스트

```bash
npm test
```

Node.js 내장 테스트 러너를 사용합니다. `__tests__/` 디렉토리에 테스트 파일이 있습니다.

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
