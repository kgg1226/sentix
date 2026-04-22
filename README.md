# Sentix

**Adaptive Guardrail for AI Coding** — A framework that enforces boundaries when AI writes code, learns from mistakes, and improves itself over time.

[English](#english) | [한국어](#한국어) | [日本語](#日本語) | [中文](#中文)

---

<a id="english"></a>

## What is Sentix?

| | |
|---|---|
| **Definition** | Adaptive Guardrail for AI Coding |
| **Identity** | Not a harness (direction), not an agent (autonomy) — **boundary enforcement + verification + learning** |
| **Core Principle** | Instead of telling AI "do it this way," mechanically enforce "never do this" |
| **Differentiator** | Not just blocking — adaptive: learns from failures to prevent the same mistake next time |

### Features

| Feature | Description |
|---|---|
| **Destruction Prevention** | Physically blocks deletion of existing features, tests, and out-of-scope files |
| **Deterministic Verification** | Catches eval/syntax errors/test regression/security vulnerabilities — 100% by machine |
| **Input Enrichment** | Vague request → interactive selection menu → rich specification |
| **Auto-Learning** | Verification failure → constraint auto-added → same mistake prevented next time |
| **Multi-Generation** | Same request implemented 3 ways → best one selected by Quality Gate score |
| **Cross-Model Review** | Independent review by different AI model + adversarial prompting |
| **Pattern Learning** | Usage pattern analysis → behavioral directives auto-generated |
| **Integrity Monitoring** | Protected file tampering/deletion detected → auto-restored from git |

### Feature Availability by Environment

| Feature | `sentix run` | Conversation | claude.ai Web | API |
|---|:---:|:---:|:---:|:---:|
| 6 Hard Rules (CLAUDE.md) | ✅ | ✅ | ⚠️ manual | ⚠️ manual |
| PreToolUse Hook (Write/Edit block) | ✅ | ✅ | ❌ | ❌ |
| Interactive Input Enrichment | ✅ | ❌ | ❌ | ❌ |
| Quality Gate (5 checks) | ✅ | ❌ | ❌ | ❌ |
| Feedback Loop (auto-learning) | ✅ | ❌ | ❌ | ❌ |
| Multi-Gen (multiple generations) | ✅ | ❌ | ❌ | ❌ |
| Cross-Review (external model) | ✅ | ❌ | ❌ | ❌ |
| Pattern Analysis + Directives | ✅ | ❌ | ❌ | ❌ |
| Integrity Monitoring + Restore | ✅ | ✅ | ❌ | ❌ |

### Install / Update / Commands

```bash
# Install (choose one)
npm install sentix          # Local install (for Claude Code app/web)
npm install -g sentix       # Global install (for terminal CLI)
sentix init                 # or: npx sentix init

# Update
npm install sentix@latest   # Local update
npm install -g sentix@latest # Global update
sentix update               # Sync framework files
```

### Which install do I need?

| Environment | Install | Command |
|---|---|---|
| **Claude Code App / Web** | Local (`npm install sentix`) | `npx sentix run "request"` |
| **Terminal CLI** | Global (`npm install -g sentix`) | `sentix run "request"` |
| **Both** | Both (no conflict) | Either works |

> **Important**: Global install (`-g`) is NOT accessible from Claude Code app/web.
> If you use Claude Code app/web, you MUST install locally (`npm install sentix`).

### How to use in Claude Code chat

#### One-time setup — make Claude route through `sentix run` automatically

Run `sentix init` once in your project root:

```bash
npm install sentix
npx sentix init
```

This installs three things that keep Claude on the Governor pipeline without you re-typing the rule each request:

| Installed by `sentix init` | What it does |
|---|---|
| `CLAUDE.md` / `.claude/rules/*` | Loaded at every session start — tells Claude it is already the Sentix Governor and must route code changes through `sentix run`. |
| `.claude/settings.json` hooks | `SessionStart` injects the Governor role, `UserPromptSubmit` re-states the rule on every turn, `PreToolUse` blocks raw Write/Edit without an active ticket. |
| `tasks/` + `.sentix/` scaffolding | Ticket index, lessons, constraints, integrity snapshot — all the state Claude reads/writes during a cycle. |

After this, a fresh chat session automatically starts in Governor mode. You can still ask in plain language:

```
You: "Fix the login bug"
Claude: (Governor routes this to) sentix run "Fix the login bug"
→ Pipeline: PLAN → DEV → GATE → REVIEW → FINALIZE
```

#### Explicit fallback

If Claude drifts or you want to force the pipeline explicitly:

```
You: "Run npx sentix run 'Make a login page' in terminal"
```

#### App / Web specifics

> **Global install is not visible to Claude Code app/web.** You must install locally (`npm install sentix`) so `npx sentix` resolves inside the project's `node_modules/.bin`.

> Memory files (persistent preferences across sessions) live in `~/.claude/projects/<project>/memory/`. Sentix's `require-ticket` hook treats paths outside the project root as out-of-scope and lets them through, so memory writes are never blocked.

---

<a id="한국어"></a>

## Sentix란?

| 항목 | 설명 |
|---|---|
| **정의** | AI 코딩 가드레일 (Adaptive Guardrail) |
| **정체성** | 하네스(방향 지시)도, 에이전트(자율 행동)도 아닌 — **경계 강제 + 검증 + 학습** |
| **핵심 원리** | AI에게 "이렇게 해라"가 아니라 "이것만은 하지 마라"를 기계적으로 강제 |
| **차별점** | 단순 차단이 아닌 adaptive — 실패에서 배워서 다음에 같은 실수를 방지 |

### 기능 요약

| 기능 | 설명 |
|---|---|
| **파괴 방지** | 기존 기능 삭제, 테스트 파괴, 범위 초과를 물리적으로 차단 |
| **결정론적 검증** | eval/구문오류/테스트회귀/보안취약점을 기계가 100% 잡음 |
| **입력 구체화** | 모호한 요청 → 인터랙티브 선택지 → 풍성한 스펙 |
| **자동 학습** | 검증 실패 → 제약 자동 추가 → 다음엔 같은 실수 방지 |
| **다중 생성** | 같은 요청을 3가지 접근으로 구현 → 최선 선택 |
| **이종 검증** | 다른 AI 모델로 독립 리뷰 + 적대적 프롬프트 |
| **패턴 학습** | 사용 패턴 분석 → 행동 지시문 자동 생성 |
| **무결성 감시** | 보호 파일 변조/삭제 감지 → git에서 자동 복원 |

### 환경별 기능 지원

| 기능 | `sentix run` | 대화 모드 | claude.ai 웹 | API |
|---|:---:|:---:|:---:|:---:|
| 하드 룰 6개 (CLAUDE.md 지시) | ✅ | ✅ | ⚠️ 수동 | ⚠️ 수동 |
| PreToolUse 훅 (Write/Edit 차단) | ✅ | ✅ | ❌ | ❌ |
| 인터랙티브 입력 구체화 | ✅ | ❌ | ❌ | ❌ |
| Quality Gate (5종 검사) | ✅ | ❌ | ❌ | ❌ |
| Feedback Loop (자동 학습) | ✅ | ❌ | ❌ | ❌ |
| Multi-Gen (다중 생성) | ✅ | ❌ | ❌ | ❌ |
| Cross-Review (이종 모델) | ✅ | ❌ | ❌ | ❌ |
| 패턴 분석 + 행동 지시 | ✅ | ❌ | ❌ | ❌ |
| 무결성 감시 + 자동 복원 | ✅ | ✅ | ❌ | ❌ |

### 설치 / 업데이트 / 명령어

```bash
# 설치 (둘 중 선택)
npm install sentix          # 로컬 설치 (Claude Code 앱/웹용)
npm install -g sentix       # 글로벌 설치 (터미널 CLI용)
sentix init                 # 또는: npx sentix init

# 업데이트
npm install sentix@latest   # 로컬 업데이트
npm install -g sentix@latest # 글로벌 업데이트
sentix update               # 프레임워크 파일 동기화
```

### 어떤 설치가 필요한가?

| 환경 | 설치 방법 | 명령어 |
|---|---|---|
| **Claude Code 앱 / 웹** | 로컬 (`npm install sentix`) | `npx sentix run "요청"` |
| **터미널 CLI** | 글로벌 (`npm install -g sentix`) | `sentix run "요청"` |
| **둘 다** | 둘 다 설치 (충돌 없음) | 어느 쪽이든 작동 |

> **중요**: 글로벌 설치(`-g`)는 Claude Code 앱/웹에서 접근 불가합니다.
> Claude Code 앱/웹을 사용한다면 반드시 로컬 설치(`npm install sentix`)가 필요합니다.

### Claude Code 채팅에서 사용하는 법

#### 한 번만 설정 — 채팅에서 Claude가 자동으로 `sentix run` 을 거치게 하기

프로젝트 루트에서 `sentix init` 을 **한 번** 실행하면, 이후 모든 세션이 자동으로 Governor 모드로 시작합니다:

```bash
npm install sentix
npx sentix init
```

`sentix init` 이 자동 설치하는 3가지:

| 설치 항목 | 역할 |
|---|---|
| `CLAUDE.md` / `.claude/rules/*` | 세션 시작 시 자동 로드되어, Claude가 이미 Sentix Governor임을 인지하고 코드 변경은 반드시 `sentix run` 경로로 돌리도록 지시 |
| `.claude/settings.json` 훅 3종 | `SessionStart` 가 Governor 역할 주입, `UserPromptSubmit` 가 매 요청마다 규칙 리마인드, `PreToolUse` 가 활성 티켓 없는 Write/Edit 차단 |
| `tasks/` + `.sentix/` 구조 | 티켓 인덱스, 교훈, 제약, integrity snapshot — 사이클 중 Claude가 읽고 쓰는 상태 저장소 |

설정 후에는 자연어로 요청해도 자동으로 파이프라인을 탑니다:

```
나: "로그인 버그 고쳐줘"
Claude: (Governor 판단) sentix run "로그인 버그 고쳐줘"
→ 파이프라인: PLAN → DEV → GATE → REVIEW → FINALIZE
```

#### 명시적 실행 (fallback)

Claude가 경로를 벗어나거나 강제로 파이프라인을 타게 하고 싶으면:

```
나: "터미널에서 npx sentix run '로그인 페이지 만들어줘' 실행해"
```

#### 앱 / 웹 사용 시 참고

> **글로벌 설치는 Claude Code 앱/웹에서 보이지 않습니다.** 반드시 프로젝트에 로컬 설치(`npm install sentix`) 해야 `npx sentix` 가 `node_modules/.bin` 에서 해결됩니다.

> 세션 간 기억(memory 파일)은 `~/.claude/projects/<프로젝트>/memory/` 에 저장됩니다. Sentix의 `require-ticket` 훅은 프로젝트 루트 밖 경로를 보호 범위 밖으로 간주해 통과시키므로, memory 쓰기가 막히지 않습니다.

---

<a id="日本語"></a>

## Sentixとは？

| 項目 | 説明 |
|---|---|
| **定義** | AIコーディング・ガードレール（Adaptive Guardrail） |
| **アイデンティティ** | ハーネス（方向指示）でもエージェント（自律行動）でもない — **境界強制 + 検証 + 学習** |
| **基本原則** | AIに「こうしろ」ではなく「これだけはするな」を機械的に強制 |
| **差別化要素** | 単なるブロックではなくadaptive — 失敗から学び、次回同じミスを防止 |

### 機能一覧

| 機能 | 説明 |
|---|---|
| **破壊防止** | 既存機能の削除、テスト破壊、スコープ外の変更を物理的にブロック |
| **決定論的検証** | eval/構文エラー/テスト回帰/セキュリティ脆弱性をマシンが100%検出 |
| **入力具体化** | 曖昧なリクエスト → インタラクティブ選択肢 → 豊富な仕様 |
| **自動学習** | 検証失敗 → 制約自動追加 → 次回は同じミスを防止 |
| **多重生成** | 同じリクエストを3つのアプローチで実装 → 最善を選択 |
| **異種検証** | 異なるAIモデルによる独立レビュー + 敵対的プロンプト |
| **パターン学習** | 使用パターン分析 → 行動指示を自動生成 |
| **整合性監視** | 保護ファイルの改ざん/削除を検知 → gitから自動復元 |

### 環境別機能サポート

| 機能 | `sentix run` | 会話モード | claude.ai Web | API |
|---|:---:|:---:|:---:|:---:|
| ハードルール6個 (CLAUDE.md) | ✅ | ✅ | ⚠️ 手動 | ⚠️ 手動 |
| PreToolUseフック (Write/Editブロック) | ✅ | ✅ | ❌ | ❌ |
| インタラクティブ入力具体化 | ✅ | ❌ | ❌ | ❌ |
| Quality Gate (5種検査) | ✅ | ❌ | ❌ | ❌ |
| Feedback Loop (自動学習) | ✅ | ❌ | ❌ | ❌ |
| Multi-Gen (多重生成) | ✅ | ❌ | ❌ | ❌ |
| Cross-Review (異種モデル) | ✅ | ❌ | ❌ | ❌ |
| パターン分析 + 行動指示 | ✅ | ❌ | ❌ | ❌ |
| 整合性監視 + 自動復元 | ✅ | ✅ | ❌ | ❌ |

### インストール / アップデート / コマンド

```bash
# インストール (どちらか選択)
npm install sentix          # ローカル (Claude Code アプリ/ウェブ用)
npm install -g sentix       # グローバル (ターミナルCLI用)
sentix init                 # または: npx sentix init

# アップデート
npm install sentix@latest   # ローカル更新
sentix update               # フレームワークファイル同期

# 使用方法
sentix run "リクエスト"              # パイプライン実行
sentix run "リクエスト" --multi-gen  # 多重生成モード
sentix run "リクエスト" --cross-review # 異種モデルレビュー
sentix doctor                        # インストール診断
```

> **重要**: グローバルインストール (`-g`) は Claude Code アプリ/ウェブから見えません。アプリ/ウェブを使う場合はローカルインストール (`npm install sentix`) が必須です。詳細な自動ルーティング設定は上の英語/韓国語セクションを参照してください。

### Claude Codeチャットでの使い方

チャットで`npx sentix run`を明示的に指定する必要があります：

```
あなた：「ターミナルで npx sentix run 'ログインページを作って' を実行して」
Claude：（Bashツールで実行）
→ パイプライン開始：PLAN → DEV → GATE → REVIEW → FINALIZE
```

> **重要**：「ログインページを作って」だけ入力すると、Claudeはsentixなしで直接コーディングします。
> 必ず`npx sentix run`をリクエストに含めてください。

---

<a id="中文"></a>

## Sentix是什么？

| 项目 | 说明 |
|---|---|
| **定义** | AI编程护栏（Adaptive Guardrail） |
| **定位** | 既不是缰绳（方向指引），也不是代理（自主行为）— **边界强制 + 验证 + 学习** |
| **核心原则** | 不是告诉AI"这样做"，而是机械性地强制"绝对不能做这个" |
| **差异化** | 不仅仅是阻断 — 具有自适应性：从失败中学习，防止下次犯同样的错误 |

### 功能概述

| 功能 | 说明 |
|---|---|
| **破坏防护** | 物理阻断现有功能删除、测试破坏、超出范围的修改 |
| **确定性验证** | eval/语法错误/测试回归/安全漏洞 — 机器100%捕获 |
| **输入具体化** | 模糊请求 → 交互式选择菜单 → 丰富的规格说明 |
| **自动学习** | 验证失败 → 自动添加约束 → 下次防止同样的错误 |
| **多重生成** | 同一请求用3种方法实现 → 选择最佳方案 |
| **异构验证** | 不同AI模型独立审查 + 对抗性提示 |
| **模式学习** | 使用模式分析 → 自动生成行为指令 |
| **完整性监控** | 受保护文件篡改/删除检测 → 从git自动恢复 |

### 各环境功能支持

| 功能 | `sentix run` | 对话模式 | claude.ai Web | API |
|---|:---:|:---:|:---:|:---:|
| 6条硬规则 (CLAUDE.md) | ✅ | ✅ | ⚠️ 手动 | ⚠️ 手动 |
| PreToolUse钩子 (Write/Edit阻断) | ✅ | ✅ | ❌ | ❌ |
| 交互式输入具体化 | ✅ | ❌ | ❌ | ❌ |
| Quality Gate (5项检查) | ✅ | ❌ | ❌ | ❌ |
| Feedback Loop (自动学习) | ✅ | ❌ | ❌ | ❌ |
| Multi-Gen (多重生成) | ✅ | ❌ | ❌ | ❌ |
| Cross-Review (异构模型) | ✅ | ❌ | ❌ | ❌ |
| 模式分析 + 行为指令 | ✅ | ❌ | ❌ | ❌ |
| 完整性监控 + 自动恢复 | ✅ | ✅ | ❌ | ❌ |

### 安装 / 更新 / 命令

```bash
# 安装 (二选一)
npm install sentix          # 本地安装 (供 Claude Code 应用/网页使用)
npm install -g sentix       # 全局安装 (供终端 CLI 使用)
sentix init                 # 或: npx sentix init

# 更新
npm install sentix@latest   # 本地更新
sentix update               # 框架文件同步

# 使用
sentix run "请求"                # 管道执行
sentix run "请求" --multi-gen    # 多重生成模式
sentix run "请求" --cross-review # 异构模型审查
sentix doctor                    # 安装诊断
```

> **重要**：全局安装 (`-g`) 在 Claude Code 应用/网页中不可见。如使用应用/网页，必须本地安装 (`npm install sentix`)。自动路由详细设置请参考上方英文/韩文部分。

### 在Claude Code聊天中如何使用

聊天中必须明确指定`npx sentix run`：

```
你："在终端执行 npx sentix run '做一个登录页面'"
Claude：（通过Bash工具执行）
→ 管道启动：PLAN → DEV → GATE → REVIEW → FINALIZE
```

> **重要**：如果只输入"做一个登录页面"，Claude会不经过sentix直接编码。
> 请务必在请求中包含`npx sentix run`。

---

## Pipeline Architecture

```
User Request
  ↓
[Spec Enricher]        — Load .sentix/constraints.md + past lessons
  ↓
[Spec Questions]       — Structured clarifying questions for vague requests
  ↓
[Pattern Directive]    — Generated from tasks/pattern-log.jsonl
  ↓
planner → dev ── or ──→ dev-swarm (parallel worktrees)
                └─ or ─→ dev × N  [Multi-Gen, --multi-gen [N]]
                  ↓
          [Quality Gate]     — 5 deterministic checks
                  ↓
          [verify-gates]     — Scope / export / test / net-deletion
                  ↓
          [Feedback Loop]    — Failures → constraints.md auto-appended
                  ↓
          pr-review (adversarial — reviewer must find ≥ 2 issues)
                  ↓
          [Cross-Review]     — Independent review by external model (opt-in, --cross-review)
                  ↓
          finalize → integrity snapshot + lesson promotion → Done
```

---

## Hard Rules

| # | Rule | Enforcement |
|---|---|---|
| 1 | Test snapshot required before changes | Pre-execution gate (auto-creates if missing) |
| 2 | No out-of-scope file modifications | git diff analysis (only when planner defines SCOPE) |
| 3 | No export/API deletion | git diff analysis (signature extensions are excluded) |
| 4 | No test deletion | git diff analysis |
| 5 | Max 50 lines net deletion | git diff analysis |
| 6 | **No existing feature deletion** | Dev/review agent prompts (LLM-enforced, not a hard hook) |

---

<details>
<summary><b>Quality System Details</b></summary>

### Quality Gate — 5 Deterministic Checks

| Check | Catches | Why AI Misses It |
|---|---|---|
| Banned patterns | `eval()`, `innerHTML`, hardcoded secrets | AI assumes "it's intentional" |
| Debug artifacts | `console.log` in `src/` | AI adds them and forgets to remove |
| Syntax check | `.js` syntax errors | AI is "sure the brackets match" |
| npm audit | Security vulnerabilities | AI can't access CVE DB in real-time |
| Test regression | Decreased test count | AI assumes "tests probably pass" |

### Multi-Gen

Runs dev N times (default 3; override with `-mg N` or `--multi-gen N`), scores each generation via the Quality Gate, and applies the highest-scoring patch.

```
Gen 1 [Simplest]  → score 85 (issues: 1)
Gen 2 [Robust]    → score 95 (issues: 0)  ★ Selected
Gen 3 [Elegant]   → score 80 (issues: 2)
```

### Cross-Review

```bash
sentix run "request" --cross-review openai  # External model review
```

Reviewer is **required to find at least 2 issues** (adversarial prompting).

</details>

<details>
<summary><b>CLI Commands</b></summary>

| Command | Description |
|---|---|
| `sentix` | Status + recommended next action |
| `sentix run "request"` | Pipeline execution |
| `sentix status` | Governor dashboard |
| `sentix doctor` | Installation diagnostics |
| `sentix ticket create "desc"` | Bug ticket |
| `sentix ticket close <id> [--force]` | Close a resolved ticket (or force-close any state) |
| `sentix feature add "desc"` | Feature ticket |
| `sentix version bump patch` | Version bump |
| `sentix metrics` | AI success rate stats |
| `sentix init` | Project setup |
| `sentix update` | Framework file sync |
| `sentix config` | Settings |
| `sentix safety set <word>` | Anti-injection safety word |
| `sentix evolve` | Self-analysis |

</details>

<details>
<summary><b>Project Structure</b></summary>

```
my-project/
├── CLAUDE.md              ← AI execution rules (core)
├── FRAMEWORK.md           ← Detailed design document
├── .sentix/
│   ├── config.toml        ← Layer enable/disable
│   ├── constraints.md     ← Project constraints (auto-learning)
│   ├── providers/         ← AI selection (Claude, OpenAI, Ollama)
│   └── rules/             ← Hard rules + auto-generated rules
├── .claude/
│   ├── settings.json      ← Hook registration
│   ├── agents/            ← planner, dev, pr-review agents
│   └── rules/             ← Conditional rules
├── scripts/hooks/         ← SessionStart, UserPromptSubmit, PreToolUse hooks
├── tasks/
│   ├── lessons.md         ← Lessons from failures
│   ├── patterns.md        ← Usage patterns
│   └── tickets/           ← Work tickets
├── docs/                  ← SOP, agent scopes, severity
└── (existing project files unchanged)
```

</details>

<details>
<summary><b>FAQ</b></summary>

**Q: Does it change existing code?**
A: `sentix init` adds framework files (CLAUDE.md, `.claude/`, `.sentix/`, `scripts/hooks/`, `tasks/`) and, if a `CLAUDE.md` already exists, merges its rules. Your source tree is not modified — only the scaffolding around it.

**Q: Is `sentix run` required?**
A: Inside Claude Code with `sentix init` done, the installed hooks + CLAUDE.md strongly bias Claude toward routing code changes through `sentix run`. It is not a hard guarantee — if Claude still tries a direct Write/Edit, the PreToolUse hook blocks it when no active ticket exists.

**Q: Without Claude Code?**
A: claude.ai web/mobile: guidance mode only (you must manually paste the hard rules and run the pipeline yourself). API: same — no hooks, no auto-enforcement.

**Q: Is it free?**
A: Sentix itself is MIT-licensed and has zero external dependencies. AI costs depend on your provider (Claude/OpenAI/Ollama).

**Q: Which languages?**
A: The project scanner auto-recognizes `.js`, `.ts`, `.jsx`, `.tsx`, `.py`, `.go`, `.rs`, `.java`, `.rb` files. Hard rules and pipeline are language-agnostic; per-language conventions go in `CLAUDE.md`.

</details>

---

## Test

```bash
npm test    # 212 tests, Node.js built-in test runner (node --test)
```

## Contributing

- **providers**: Add new AI (Gemini, Mistral, etc.)
- **plugins**: Custom plugins (`sentix plugin create`)

## License

MIT — *by JANUS*
