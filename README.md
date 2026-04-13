# Sentix `v2.16`

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
| 6 Hard Rules (CLAUDE.md) | ✅ | ✅ | ✅ | ✅ |
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

After `sentix init`, open the folder in Claude Code and just talk normally:

```
You: "Make a login page"
Claude: (automatically runs npx sentix run "Make a login page" via Bash)
→ Pipeline starts: PLAN → DEV → GATE → REVIEW → FINALIZE
```

**You don't need to type `sentix run` yourself.** Claude reads the hooks and automatically routes code change requests through the pipeline.

If Claude doesn't use `sentix run` automatically, you can tell it:
```
You: "Use sentix run to make a login page"
```

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
| 하드 룰 6개 (CLAUDE.md 지시) | ✅ | ✅ | ✅ | ✅ |
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

`sentix init` 후 Claude Code로 폴더를 열고 그냥 대화하세요:

```
나: "로그인 페이지 만들어줘"
Claude: (자동으로 Bash에서 sentix run "로그인 페이지 만들어줘" 실행)
→ 파이프라인 시작: PLAN → DEV → GATE → REVIEW → FINALIZE
```

**`sentix run`을 직접 타이핑할 필요 없습니다.** Claude가 훅을 읽고 코드 변경 요청을 자동으로 파이프라인에 넘깁니다.

만약 Claude가 `sentix run`을 자동으로 안 쓰면:
```
나: "sentix run으로 로그인 페이지 만들어줘"
```

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
| ハードルール6個 (CLAUDE.md) | ✅ | ✅ | ✅ | ✅ |
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
# インストール
npm install -g sentix && sentix init
# または: npx sentix init

# アップデート
npm install -g sentix@latest && sentix update

# 使用方法
sentix run "リクエスト"              # パイプライン実行
sentix run "リクエスト" --multi-gen  # 多重生成モード
sentix run "リクエスト" --cross-review # 異種モデルレビュー
sentix doctor                        # インストール診断
```

### Claude Codeチャットでの使い方

`sentix init`後、Claude Codeでフォルダを開いて普通に会話してください：

```
あなた：「ログインページを作って」
Claude：（自動的にBashで sentix run "ログインページを作って" を実行）
→ パイプライン開始：PLAN → DEV → GATE → REVIEW → FINALIZE
```

**`sentix run`を自分で入力する必要はありません。** Claudeがフックを読み取り、コード変更リクエストを自動的にパイプラインに送ります。

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
| 6条硬规则 (CLAUDE.md) | ✅ | ✅ | ✅ | ✅ |
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
# 安装
npm install -g sentix && sentix init
# 或者: npx sentix init

# 更新
npm install -g sentix@latest && sentix update

# 使用
sentix run "请求"                # 管道执行
sentix run "请求" --multi-gen    # 多重生成模式
sentix run "请求" --cross-review # 异构模型审查
sentix doctor                    # 安装诊断
```

### 在Claude Code聊天中如何使用

`sentix init`后，用Claude Code打开文件夹，正常对话即可：

```
你："做一个登录页面"
Claude：（自动通过Bash执行 sentix run "做一个登录页面"）
→ 管道启动：PLAN → DEV → GATE → REVIEW → FINALIZE
```

**不需要自己输入`sentix run`。** Claude会读取钩子，自动将代码变更请求路由到管道。

---

## Pipeline Architecture

```
User Request
  ↓
[L3 Spec Questions]  — Structured questions for vague requests
  ↓
[L3 Spec Enricher]   — Project constraints + past failure patterns
  ↓
planner → dev ─── or ───→ dev × 3 [L5 Multi-Gen]
                  ↓
          [L2 Quality Gate] — 5 deterministic checks
                  ↓
          [L4 Feedback Loop] — Failure patterns → constraints auto-added
                  ↓
          pr-review [L6 Adversarial Prompt]
                  ↓
          [L6 Cross-Review] — Independent review by external AI (opt-in)
                  ↓
          finalize → Learning record → Done
```

---

## Hard Rules

| # | Rule | Enforcement |
|---|---|---|
| 1 | Test snapshot required before changes | Gate check |
| 2 | No out-of-scope file modifications | git diff analysis |
| 3 | No export/API deletion | git diff analysis |
| 4 | No test deletion | git diff analysis |
| 5 | Max 50 lines net deletion | git diff analysis |
| 6 | **No existing feature deletion** | PreToolUse hook |

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
├── scripts/hooks/         ← SessionStart, PreToolUse hooks
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
A: No. Only adds new files.

**Q: Is `sentix run` required?**
A: In conversation mode, Claude automatically routes code changes through `sentix run`.

**Q: Without Claude Code?**
A: claude.ai web/mobile: guidance mode (L1 only). API: full auto with tools.

**Q: Is it free?**
A: Sentix itself is MIT free. AI costs depend on the provider.

**Q: Which languages?**
A: Auto-detect: Node.js, Python, Go, Rust. Others via manual CLAUDE.md edit.

</details>

---

## Test

```bash
npm test    # 191 tests, Node.js built-in test runner
```

## Contributing

- **providers**: Add new AI (Gemini, Mistral, etc.)
- **plugins**: Custom plugins (`sentix plugin create`)

## License

MIT — *by JANUS*
