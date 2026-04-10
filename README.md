# Sentix

**AI 코딩을 프로덕션 품질로 끌어올리는 파이프라인 프레임워크.**

> 파괴 방지 + 결정론적 검증 + 입력 강화 + 자동 학습 + 다중 생성 + 이종 검증
> — 6겹의 품질 레이어로 AI 코딩의 하한과 상한을 모두 관리합니다.

---

## 빠른 시작

```bash
npx sentix init        # 프로젝트에 설치 (1분)
```

**끝.** 이제 Claude Code, Cursor, Windsurf 등에서 평소처럼 대화하세요.

```
당신: "로그인에 세션 만료 추가해줘"
→ Sentix가 자동으로 기획 → 코드 → 검증 → 리뷰 → 학습까지 수행합니다.
```

> `sentix run "요청"`은 **선택사항** — 체인 파이프라인 + 검증 게이트 + 메트릭이 필요할 때만.

---

## 이게 뭔가요?

AI에게 코드를 시키면 두 가지 문제가 있습니다:

| 문제 | 증상 |
|---|---|
| **하한이 불안정하다** | 기존 기능 삭제, 테스트 깨뜨림, 범위 밖 파일 수정, 같은 실수 반복 |
| **상한이 평범하다** | 모호한 요청 → 모호한 결과, 프로젝트 규칙 무시, 자기 리뷰 사각지대 |

Sentix는 **6개 레이어**로 두 문제를 모두 다룹니다:

| 레이어 | 역할 | 환경 |
|---|---|---|
| **L1** 파괴 방지 | 하드 룰 6개 + PreToolUse 훅으로 물리적 강제 | CLI |
| **L2** 결정론적 검증 | eval/구문오류/테스트회귀/보안취약점 — 기계가 100% 잡음 | CLI |
| **L3** 입력 강화 | constraints.md 자동 주입 + 빈약한 요청에 구조화 질문 | CLI |
| **L4** 자동 학습 | 검증 실패 → 제약 자동 추가 → 다음엔 같은 실수 방지 | CLI |
| **L5** 다중 생성 | dev × 3 (단순/견고/우아) → Quality Gate 점수로 선택 | CLI, `--multi-gen` |
| **L6** 이종 검증 | 다른 AI 모델로 독립 리뷰 + 적대적 프롬프트 | CLI + API 키, `--cross-review` |

> L1의 하드 룰은 CLAUDE.md가 있으면 어떤 환경에서든 작동합니다.
> L2~L6은 Claude Code CLI + `sentix run`이 필요합니다.

---

## 어떻게 작동하나요?

```
사용자 요청
  ↓
[L3 Spec Questions]  — 빈약한 요청에 구조화 질문 자동 생성
  ↓
[L3 Spec Enricher]   — 프로젝트 제약 + 과거 실패 패턴 주입
  ↓
planner → dev ─── 또는 ───→ dev × 3 [L5 Multi-Gen]
                  ↓
          [L2 Quality Gate] — 기계적 검증 5종
                  ↓
          [L4 Feedback Loop] — 실패 패턴 → constraints 자동 추가
                  ↓
          pr-review [L6 적대적 프롬프트]
                  ↓
          [L6 Cross-Review] — 다른 AI 모델로 독립 리뷰 (opt-in)
                  ↓
          finalize → 학습 기록 → 완료
```

핵심은 **에이전트를 여러 개 쓰는 것이 아니라** (같은 AI가 역할만 바꿉니다), **단계 사이에 기계적 검증을 끼우는 것**입니다.

---

## 안전장치 — 하드 룰 6개

AI도 이 규칙은 무시할 수 없습니다:

| # | 규칙 | 강제 방식 |
|---|---|---|
| 1 | 작업 전 테스트 스냅샷 필수 | 게이트 검사 |
| 2 | 범위 밖 파일 수정 금지 | git diff 분석 |
| 3 | 기존 export/API 삭제 금지 | git diff 분석 |
| 4 | 기존 테스트 삭제 금지 | git diff 분석 |
| 5 | 한 번에 50줄 넘게 삭제 금지 | git diff 분석 |
| 6 | **기존 기능 삭제 금지** | PreToolUse 훅 |

규칙 2~5는 `sentix run` 실행 후 **코드가 자동 검증**합니다. AI에게 부탁하는 것이 아니라 git diff를 분석하는 결정론적 코드가 위반 여부를 판단합니다.

---

## 품질 시스템 상세

<details>
<summary><b>Quality Gate — 5가지 결정론적 검사</b></summary>

| 검사 | 잡는 것 | AI가 놓치는 이유 |
|---|---|---|
| Banned patterns | `eval()`, `innerHTML`, 하드코딩 시크릿 | "의도적이겠지"라고 넘김 |
| Debug artifacts | `src/` 안의 `console.log` | 넣어놓고 안 지움 |
| Syntax check | `.js` 구문 오류 | "괄호 맞겠지"라고 확신 |
| npm audit | 보안 취약점 | CVE DB를 실시간으로 못 봄 |
| Test regression | 테스트 수 감소 | "다 통과했을 것"이라 추정 |

</details>

<details>
<summary><b>Spec Enricher — 프로젝트 제약 자동 주입</b></summary>

`.sentix/constraints.md`에 프로젝트 규칙을 관리하면 모든 파이프라인에 자동 주입됩니다:

```markdown
## Security
- eval() 사용 금지
- 비밀번호 하드코딩 금지

## Architecture
- 외부 npm 의존성 추가 금지 (zero-dep 정책)
```

</details>

<details>
<summary><b>Feedback Loop — 실패에서 자동 학습</b></summary>

```
1회차: dev가 eval() 사용 → Quality Gate에서 잡힘
       → constraints.md에 "eval() 사용 금지" 자동 추가

2회차: 프롬프트에 "eval() 사용 금지" 주입됨
       → dev가 처음부터 eval() 안 씀 → 통과
```

시간이 지날수록 `constraints.md`가 프로젝트 고유 지식으로 성장합니다.

</details>

<details>
<summary><b>Multi-Gen — 다중 생성 + 최선 선택 (--multi-gen)</b></summary>

```
Gen 1 [단순한 접근]   → score 85 (issues: 1)
Gen 2 [견고한 접근]   → score 95 (issues: 0)  ★ 선택
Gen 3 [우아한 접근]   → score 80 (issues: 2)
```

```bash
sentix run "요청" --multi-gen              # 3가지 접근법
sentix run "요청" --multi-gen --gen-count 2  # 2가지
```

</details>

<details>
<summary><b>Cross-Review — 이종 모델 독립 리뷰 (--cross-review)</b></summary>

같은 모델이 쓰고 리뷰하면 사각지대가 같습니다. 다른 모델(OpenAI, Ollama 등)로 독립 리뷰:

```bash
sentix run "요청" --cross-review           # config 기본 provider
sentix run "요청" --cross-review openai    # 명시적 지정
sentix run "요청" --cross-review ollama    # 로컬 모델
```

리뷰어에게 **"최소 2개 문제를 찾아라"** 의무 부여 (적대적 프롬프트).

</details>

---

## CLI 명령어

> CLI는 **선택사항**입니다. 대화만 해도 자동 작동합니다.

| 명령어 | 하는 일 |
|---|---|
| `sentix` | 현재 상태 + 권장 다음 액션 |
| `sentix run "요청"` | 파이프라인 실행 |
| `sentix status` | Governor 대시보드 |
| `sentix doctor` | 설치 진단 (6레이어 상태 포함) |
| `sentix ticket create "설명"` | 버그 티켓 |
| `sentix feature add "설명"` | 기능 티켓 |
| `sentix version bump patch` | 버전 올림 |
| `sentix metrics` | AI 성공률 통계 |

<details>
<summary>전체 명령어 목록</summary>

| 명령어 | 하는 일 |
|---|---|
| `sentix init` | 프로젝트 설치 |
| `sentix resume` | 중단된 파이프라인 재개 |
| `sentix update` | 프레임워크 파일 동기화 |
| `sentix config` | 설정 조회/변경 |
| `sentix profile use <name>` | 환경 프로필 전환 |
| `sentix layer enable <n>` | 레이어 켜기/끄기 |
| `sentix safety set <단어>` | LLM 인젝션 방지 안전어 |
| `sentix context` | 멀티 프로젝트 컨텍스트 |
| `sentix plugin list` | 플러그인 목록 |
| `sentix evolve` | 자가 분석/개선 |
| `sentix version current` | 현재 버전 확인 |
| `sentix version changelog` | CHANGELOG 미리보기 |

</details>

---

## 환경별 설치

| 환경 | 설치 | 자동화 수준 |
|---|---|---|
| **Claude Code / Cursor / Windsurf** | `npx sentix init` | 완전 자동 (L1~L6) |
| **claude.ai 웹** | Project Knowledge에 CLAUDE.md 업로드 | 안내 모드 (L1만) |
| **Claude 모바일** | CLAUDE.md 붙여넣기 | 안내 모드 (L1만) |
| **Claude API** | system prompt에 CLAUDE.md 포함 | 도구 제공 시 자동 |

<details>
<summary>환경별 상세 설치 방법</summary>

### Claude Code / Cursor / Windsurf

```bash
npx sentix init
# CLAUDE.md, .sentix/, tasks/, docs/ 자동 생성
# 기술 스택 자동 감지 (Node.js, Python, Go, Rust)
```

### claude.ai 웹

1. 프로젝트 생성 → Project Knowledge에 `CLAUDE.md`, `FRAMEWORK.md` 업로드
2. 대화 시작 → 자동으로 Governor 모드

### Claude API

```python
import anthropic
client = anthropic.Anthropic()

with open("CLAUDE.md") as f:
    system = f.read()

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    system=system,
    messages=[{"role": "user", "content": "로그인에 세션 만료 추가해줘"}],
)
```

### 업데이트

```bash
npm install -g sentix@latest   # 패키지 업데이트
sentix update                  # 프레임워크 파일 동기화
```

</details>

---

## 프로젝트 구조

```
내 프로젝트/
├── CLAUDE.md              ← AI가 읽는 실행 규칙 (핵심)
├── FRAMEWORK.md           ← 상세 설계 문서
├── .sentix/
│   ├── config.toml        ← 레이어 활성화/비활성화
│   ├── constraints.md     ← 프로젝트 제약 (자동 학습)
│   ├── providers/         ← AI 선택 (Claude, OpenAI, Ollama)
│   └── rules/             ← 하드 룰 + 자동 생성 규칙
├── .claude/
│   ├── settings.json      ← 훅 등록
│   ├── agents/            ← planner, dev, pr-review 에이전트
│   └── rules/             ← 조건부 규칙
├── scripts/hooks/         ← SessionStart, PreToolUse 훅
├── tasks/
│   ├── lessons.md         ← 실패에서 배운 것
│   ├── patterns.md        ← 사용자 행동 패턴
│   └── tickets/           ← 작업 티켓
├── docs/                  ← SOP, 에이전트 범위, severity
└── (기존 프로젝트 파일은 그대로)
```

---

## FAQ

<details>
<summary>자주 묻는 질문</summary>

**Q: 기존 코드가 바뀌나요?**
A: 아닙니다. 새 파일만 추가됩니다.

**Q: `sentix run`을 꼭 써야 하나요?**
A: 아닙니다. 대화만 해도 자동 작동. `sentix run`은 체인 파이프라인이 필요할 때만.

**Q: Claude Code가 없으면?**
A: claude.ai 웹/모바일에서는 안내 모드(L1만), API에서는 도구 제공 시 자동.

**Q: 무료인가요?**
A: Sentix 자체는 MIT 무료. AI 비용은 제공자에 따라 다릅니다.

**Q: 어떤 언어를 지원하나요?**
A: 자동 감지: Node.js, Python, Go, Rust. 그 외는 CLAUDE.md 수동 편집.

**Q: `sentix` 명령이 안 됩니다**
A: `npm install -g sentix` 또는 매번 `npx sentix ...` 사용.

**Q: `sentix doctor`에서 FRAMEWORK.md MISSING**
A: `sentix update`로 가져옵니다.

</details>

---

## 테스트

```bash
npm test    # 159 tests, Node.js 내장 테스트 러너
```

## Contributing

- **providers**: 새 AI 추가 (Gemini, Mistral 등)
- **plugins**: 커스텀 플러그인 (`sentix plugin create`)

## License

MIT — *by JANUS*
