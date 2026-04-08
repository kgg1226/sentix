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

이것만 하면 **전부 자동으로** 처리됩니다:

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
>
> ```bash
> # 글로벌 설치 (선택)
> npm install -g sentix
>
> # 그 뒤부터는 npx 없이 사용 가능:
> sentix init
> sentix doctor
> sentix run "요청"
> ```

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

`sentix init`이 끝나면 자동으로 `doctor`가 실행됩니다. 모든 항목이 ✓ 이면 성공입니다.

나중에 다시 확인하고 싶으면:

```bash
sentix doctor
```

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

현재 어떤 단계를 실행 중인지, 티켓 상태, 학습 데이터가 얼마나 쌓였는지 **정제된 카드 UI**로 보여줍니다:

```
 Sentix Status  ·  Governor 대시보드

  phase        idle           활성 티켓      0
  다음 액션    sentix run     블로커         없음

┌──────────────── 파이프라인 ────────────────┐
│ ○ planner → ○ dev → ○ gate → ○ pr-review → ○ finalize │
└────────────────────────────────────────────┘

  ● 준비 완료  sentix run "<요청>" 으로 새 작업 시작
```

다른 주요 명령도 동일한 카드 언어를 공유합니다:

| 명령 | 시각 요소 |
|---|---|
| `sentix` (인자 없음) | 친화적 진입점 — 상황별 권장 액션 자동 추천 |
| `sentix doctor` | 건강도 바 (`████████████████  96%`) + 경고 리스트 |
| `sentix metrics` | 통과율/성공률 **막대 그래프** + phase별 재시도 통계 |
| `sentix config` / `profile` / `layer` | 분산 설정을 **카드 한 장**에 집약 |
| `sentix evolve` | 총 이슈 / 테스트 / 게이트 / 과대 파일 한 번에 검사 |

---

## CLI 명령어 전체 목록

> 모든 주요 명령은 **통일된 카드 UX**(건강도 바, 파이프라인 다이어그램, 정제된 요약)로 출력됩니다. 어느 명령을 써도 같은 시각 언어라 탐색이 쉽습니다.

### 기본

| 명령어 | 하는 일 |
|---|---|
| `sentix` | **친화적 진입점** — 현재 상태 요약 + 권장 다음 액션 자동 추천 |
| `sentix init` | 프로젝트에 Sentix 설치 (자동으로 기술 스택 감지) |
| `sentix run "요청"` | AI 파이프라인 실행 |
| `sentix status` | Governor 대시보드 (phase / 활성 티켓 / 파이프라인 다이어그램) |
| `sentix doctor` | 설치 진단 (건강도 바 + 경고 리스트) |
| `sentix metrics` | AI 성공률/재시도 통계 + 막대 그래프 시각화 |
| `sentix evolve` | 자기 분석 — 과대 파일/테스트/게이트 이슈 스캔 |
| `sentix update` | 프레임워크 파일을 최신 sentix로 업데이트 |
| `sentix update --dry` | 업데이트 미리보기 (변경 없이 확인만) |
| `sentix context` | 연동 프로젝트 컨텍스트 가져오기 |
| `sentix context --list` | 연동 프로젝트 접근 상태 확인 |

### 설정/환경 관리

기존엔 `.sentix/config.toml`, `agent-profiles/`, `env-profiles/`, `.claude/` 4곳에 설정이 흩어져 있어 매번 파일을 직접 편집해야 했습니다. 이제 CLI로 한 번에:

| 명령어 | 하는 일 |
|---|---|
| `sentix config` | 분산된 설정을 한 카드에서 확인 |
| `sentix config set <key> <value>` | TOML 직접 편집 없이 설정 변경 |
| `sentix profile` | 현재 환경 프로필 + 목록 |
| `sentix profile use <name>` | 프로필 빠른 전환 (env-profiles/active.toml 갱신) |
| `sentix layer` | 진화 레이어 상태 (Layer 1~5 토글) |
| `sentix layer enable <n>` / `disable <n>` | 레이어 켜기/끄기 |
| `sentix safety status` | 안전어 설정 상태 |
| `sentix safety set <word>` | 안전어 설정/변경 |

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
├── scripts/hooks/        ← Claude Code Hooks (P23 — 실질적 강제)
│   ├── session-start.sh       ← SessionStart: Governor 역할 자동 주입
│   ├── user-prompt-reminder.sh ← UserPromptSubmit: 매 요청 리마인더
│   └── require-ticket.js      ← PreToolUse: 직접 Write/Edit 차단
│
├── .claude/
│   ├── settings.json     ← 훅 등록 (SessionStart / UserPromptSubmit / PreToolUse)
│   ├── agents/           ← planner, dev, pr-review, dev-fix, security
│   └── rules/            ← 조건부 규칙 (frontmatter paths 패턴)
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

## Claude Code Hooks — 실질적 강제

### 왜 훅이 필요한가

예전 Sentix는 **"문서 기반 강제"** 였습니다. CLAUDE.md에 규칙을 써두고 "Claude가 읽고 따를 것이다" 라고 믿는 방식.

문제는 이것이 **실제로는 자주 무시된다는 것** 입니다. 실제 사례:

```
사용자: "블로그 사이트 하나 만들어줘"
Claude: (CLAUDE.md의 Governor SOP를 무시하고 바로 Next.js 프로젝트를 생성)
```

Claude Code의 기본 시스템 프롬프트에 있는 `output efficiency` 같은 지침이
프로젝트 CLAUDE.md보다 강하게 작용해서, **"간단한 요청"** 으로 판단되면 Sentix
파이프라인을 건너뛰고 바로 파일 생성으로 직행해버립니다.

### 해결: 3계층 훅

Claude Code의 Hooks 시스템을 사용해 **실행 시점에** Sentix를 강제합니다.

| 훅 | 시점 | 역할 |
|---|---|---|
| `SessionStart` | 세션 시작 1회 | Governor 역할 + 하드 룰 6 + 파이프라인 정의를 Claude 컨텍스트에 **자동 주입**. Claude가 "문서를 읽어야 함" 이 아니라 "이미 읽힌 상태" 로 세션을 시작합니다. |
| `UserPromptSubmit` | 매 사용자 프롬프트 | 짧은 Sentix 리마인더 주입. 세션이 길어질수록 망각되는 Governor 역할을 매 턴 상기시킵니다. |
| `PreToolUse` (`Write \| Edit \| MultiEdit`) | 도구 호출 직전 | 활성 Governor 사이클이 없으면 **exit 2로 차단**. 에이전트 우회 + 직접 Write/Edit을 실행 단계에서 막습니다. |

### 훅이 차단하는 것 / 허용하는 것

`scripts/hooks/require-ticket.js` 가 다음 로직으로 판단합니다:

| 경로 | 판정 |
|---|---|
| `tasks/`, `.sentix/`, `__tests__/`, `scripts/hooks/`, `.claude/rules/` | ✓ 항상 허용 (로그/설정/부트스트랩) |
| `README.md`, `CHANGELOG.md`, `lessons.md`, `patterns.md`, `handoff.md` | ✓ 항상 허용 (사용자 facing 문서) |
| 그 외 모든 경로 (`src/`, `docs/`, `bin/`, 프로젝트 코드) | ⛔ `tasks/governor-state.json` 에 `status="in_progress"` 가 없으면 차단 |

차단 시 Claude는 다음 메시지를 받습니다:

```
╔══════════════════════════════════════════════════════════════╗
║  [SENTIX:BLOCKED] Direct Write/Edit 차단됨                    ║
╚══════════════════════════════════════════════════════════════╝

  대상:  src/components/Login.tsx
  이유:  Governor 사이클이 없습니다 (tasks/governor-state.json 없음)

  해결:
    1. 새 요청으로 사이클 시작:   sentix run "<요청 내용>"
    2. 기존 버그 수정:           sentix ticket create "<버그>"
    3. 새 기능:                  sentix feature add "<기능>"
```

### 활성화 방법

새로 `sentix init` 한 프로젝트는 자동 설치됩니다. 기존 프로젝트는:

```bash
sentix update        # scripts/hooks/*.sh, require-ticket.js 동기화
```

`.claude/settings.json` 에 아래 세 훅이 등록되어 있어야 합니다 (sentix update가 자동 반영):

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [{"type": "command", "command": "bash scripts/hooks/session-start.sh"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "bash scripts/hooks/user-prompt-reminder.sh"}]}],
    "PreToolUse": [{
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{"type": "command", "command": "node scripts/hooks/require-ticket.js"}]
    }]
  }
}
```

### 설치 검증

```bash
sentix doctor
```

"권장 정리" 카드에 다음 6개 항목이 모두 `✓` 여야 합니다:

```
┌────────── 권장 정리  9✓ ──────────┐
│ ✓ SessionStart 훅 (Governor 역할 자동 주입)
│ ✓ UserPromptSubmit 훅 (매 요청 리마인더)
│ ✓ PreToolUse 훅 (티켓 없는 Write/Edit 차단)
│ ✓ 훅 스크립트: scripts/hooks/session-start.sh
│ ✓ 훅 스크립트: scripts/hooks/user-prompt-reminder.sh
│ ✓ 훅 스크립트: scripts/hooks/require-ticket.js
└──────────────────────────────────┘
```

### 안전장치: Fail-Open

훅 자체에 버그가 있거나 `governor-state.json` 이 파손되면 작업을 **차단하지 않고 통과**시킵니다 (로그만 남김). 훅 개발 실수가 전체 개발을 막으면 안 되기 때문입니다.

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
| `docs/*.md` (SOP, scopes, methods, severity, architecture) | 폴더별 `CLAUDE.md` |
| `scripts/hooks/*` (session-start, user-prompt, require-ticket) | `.claude/settings.json` (수동 등록 필요) |
| `.claude/agents/*` (planner, dev, pr-review, dev-fix, security) | |
| `.claude/rules/*.md` (조건부 규칙) | |

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

**Q: `sentix` 명령이 안 됩니다 ("용어가 인식되지 않습니다")**
A: 글로벌 설치가 안 되어 있으면 매번 `npx`를 붙여야 합니다:
```bash
npx sentix doctor    # npx로 실행 (설치 없이)

# 또는 글로벌 설치 후 npx 없이 사용:
npm install -g sentix
sentix doctor        # 바로 실행 가능
```

**Q: `sentix update`가 "source not found"로 전부 건너뛰기합니다**
A: npm 패키지 버전이 오래된 경우입니다. 최신 버전으로 업데이트하세요:
```bash
npm cache clean --force
npm install -g sentix@latest
sentix --version     # 최신 버전 확인
sentix update        # 다시 시도
```

**Q: `sentix doctor`에서 FRAMEWORK.md가 MISSING입니다**
A: `sentix init`은 FRAMEWORK.md를 생성하지 않습니다. `sentix update`로 가져옵니다:
```bash
sentix update        # sentix 원본에서 FRAMEWORK.md 등 동기화
```

**Q: npm publish 시 403 Forbidden (2FA) 에러가 납니다**
A: npm 계정에 2FA가 활성화되어 있으면 Granular Access Token이 필요합니다:
1. npmjs.com → 프로필 → Access Tokens → Generate New Token
2. Granular Access Token 선택, publish 권한 부여
3. `npm publish --//registry.npmjs.org/:_authToken=YOUR_TOKEN`

**Q: `sentix evolve`는 뭔가요?**
A: sentix가 자기 자신의 코드를 분석하고 개선점을 찾는 명령입니다:
```bash
sentix evolve          # 분석만
sentix evolve --auto   # 분석 + critical 이슈 자동 수정
```

---

## 런타임 모드

Sentix는 두 가지 모드로 작동합니다. 용도에 따라 전환하세요.

| | Framework Mode (기본) | Engine Mode |
|---|---|---|
| **AI 호출** | Claude Code/Cursor가 담당 | sentix가 직접 API 호출 |
| **비용** | $0 추가 (구독만) | API 토큰 비용 |
| **파이프라인** | 체인 실행 (PLAN→DEV→GATE→REVIEW→FINALIZE) | 상태 머신 오케스트레이션 |
| **검증 게이트** | 각 phase 사이에 실행 + pre-commit hook | 블로킹 + 자동 재시도 |
| **멀티 프로바이더** | 불가 (Claude Code만) | Claude + OpenAI + Ollama 선택 |
| **퓨전 리뷰** | 불가 | 여러 AI 동시 리뷰 → Best-of-N |
| **Headless CI** | Claude Code CLI 필요 | API 키만 있으면 어디서든 |
| **필요 조건** | Claude Code 설치 | API 키 환경변수 |

### 모드 전환

```bash
# config.toml에서 기본값 설정
# .sentix/config.toml → [runtime] mode = "framework" 또는 "engine"

# CLI 플래그로 즉시 전환
sentix run "요청"              # config 기본 모드
sentix run "요청" --engine     # 이번만 engine 모드
sentix run "요청" --single     # 이번만 단일 호출 (legacy)
```

### Engine mode 설정

```bash
# 1. .sentix/config.toml 에서 모드 변경
#    [runtime]
#    mode = "engine"

# 2. API 키 환경변수 설정
export ANTHROPIC_API_KEY=sk-ant-...   # Claude API
# 또는
export OPENAI_API_KEY=sk-...          # OpenAI

# 3. 확인
sentix doctor   # → Runtime: engine, Provider: claude, API key: set
```

---

## 정리

```
1. npx sentix init                 ← 설치 + 동기화 + 진단 (전부 자동, 1분)
2. sentix run "하고 싶은 것"         ← 사용 (끝!)
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
