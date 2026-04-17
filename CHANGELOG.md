# Changelog

## [2.1.0] — 2026-04-17

### New Features

- propagate patternDirective through all dev paths
- project scanner with auto-suggestions on init
- auto-resolve pre-gate failures (test snapshot + ticket)
- 5 pipeline optimizations — finalize codify, skip-review, auto-route, delegation, bash block
- show per-phase and total token usage in pipeline output
- auto-update README version on sentix update
- add selection menu for request enrichment
- make sentix run the default for all code changes
- generate actionable directives from usage patterns
- auto-analyze usage patterns from event log
- protect protection mechanisms from LLM tampering
- 6-layer quality system — Quality Gate, Spec Enricher, Feedback Loop, Multi-Gen, Cross-Review
- add adversarial review protocol + cross-review with external AI models
- add Layer 5 — run dev N times, score with Quality Gate, select best
- add request analysis and structured questions for planner
- auto-add Quality Gate failures to constraints.md
- add constraints injection and input quality enhancement
- add deterministic quality checks between dev and pr-review
- Sentix Governor 강제 실행을 위한 Claude Code 훅 3종
- 남은 5개 명령 카드 통일
- list/create/debug/impact 출력을 카드로 통일
- 시작/완료/검증 게이트 출력을 카드로 정제
- 정제된 카드 + 막대 그래프 시각화
- 카드 UI 유틸리티 추출 + safety status 카드 통일
- sentix (인자 없음) 친화적 진입점
- 정제된 진단 카드 + 건강도 시각화
- 진화 레이어 빠른 토글 명령
- 환경 프로필 빠른 전환 명령
- 분산된 설정을 한 곳에서 - sentix config 명령
- 정제된 대시보드 + 파이프라인 다이어그램
- replan trigger + auto rule promotion + dev.refine() elegance challenge
- CLAUDE.md 428→121줄 다이어트 + .claudeignore + 스킬 분리
- 6 framework improvements from license-manager field feedback
- cross-project context with auto-generated profiles
- dev-swarm parallel execution with git worktrees
- self-evolve with Claude subscription — no API cost
- self-evolve with Claude API auto-fix for critical issues
- conditional rules with frontmatter paths pattern
- governor directive forces agent-methods reading on all sessions
- sentix update detects worktrees and updates main repo too
- `feat-001`: dev 완료 후 결정론적 품질 게이트(Quality Gate) 추가 — lint, test, coverage, security 검사를 pr...
- `feat-002`: 입력 품질 강화 — constraints.md 자동 주입 + Spec Enricher로 planner 전 요청 구조화
- `feat-003`: 피드백 루프 — Quality Gate 실패 패턴을 constraints.md에 자동 추가하는 선순환 구조
- `feat-004`: 인터랙티브 Spec Enricher — sentix run 시 planner 전에 구조화 질문으로 요청을 풍성하게 보강
- `feat-005`: 다중 생성(Multi-Gen) — dev를 N번 독립 실행하여 최선의 결과를 선택하는 Layer 5
- `feat-006`: 패턴 분석 엔진 — pattern-log.jsonl 자동 분석 → patterns.md 자동 업데이트 → 프롬프트 주입
- `feat-007`: dev-swarm + pipeline-prompts 에 patternDirective 전파 — pipeline.js의 generatePat...

### Bug Fixes

- status filters closed+resolved; swarm worker timeout uses PHASE_TIMEOUT
- 6 structural bugs surfaced by self-hosting attempt
- increase recovery key to 26 chars
- use crypto.randomBytes for recovery key generation
- check quality layers in sentix package, not project root
- show stderr+stdout on phase failure for debugging
- increase agent timeout from 5min to 15min
- add --permission-mode acceptEdits to agent spawns
- resolve pipeline agents being blocked by own hooks
- include scripts/hooks/ in npm publish files
- add .gen-*.patch to prevent multi-gen temp files from commit
- resolve 3 audit findings in L5/L6 + update README and handoff
- resolve 4 integration bugs found during exhaustive audit
- add constraintsContext to buildReplanPrompt
- allow direct edits to README.md and CHANGELOG.md
- JSDoc 주석 내 */ 토큰 충돌 수정
- restore --provenance with Node 24 for supply chain protection
- tamper detection + recovery key for safety word
- safety word reset requires current word verification
- include .claude/agents and settings.json in npm package
- add CI failure lessons to prevent repeat mistakes
- publish without git push — npm only, no 403
- publish.yml git log fallback for repos without tags
- publish.yml YAML syntax — replace sed with node script
- `bug-001`: Quality Gate/Spec Enricher/Feedback Loop 통합 버그 4건 수정 — loadConstraints 미보호, d...
- `bug-002`: verify-gates의 no-export-deletion이 시그니처 확장(파라미터 추가)을 삭제로 오판 — diff에서 export 라인...
- `bug-003`: quality-gate parseTestOutput이 node --test 출력을 파싱 못해 항상 0/0 보고 — cycle-2026-04...
- `bug-004`: REVIEW phase spawnSync claude 15분 ETIMEDOUT 빈발 — cycle-2026-04-17-846에서 Revie...
- `bug-005`: dev 에이전트가 티켓 본문을 무시하고 planner 해석에만 의존 — bug-001(loadConstraints 미보호/constrain...
- `bug-006`: require-ticket.js hook이 sentix 프로젝트 범위 밖 경로(예: ~/.claude/projects/-Users-sila...
- `bug-007`: integrity-guard가 dev 산출물을 자동 복원 — cycle-2026-04-17-339(bug-006)에서 dev가 script...

### Documentation

- update handoff for next session
- clarify npx sentix run must be explicit in chat (4 languages)
- clarify local vs global install requirements
- add 'How to use in Claude Code chat' section (4 languages)
- add English, Japanese, Chinese translations
- define Sentix as Adaptive Guardrail for AI Coding
- clarify sentix run vs conversation mode feature availability
- add version badge
- consolidate install/update/commands at top
- complete rewrite for readability — 1038 → 332 lines
- rewrite intro as 4-layer quality framework, not just safety belt
- rewrite intro to be honest about what Sentix does and doesn't do
- add Quality System section — Quality Gate, Spec Enricher, Feedback Loop, Spec Questions
- add session handoff for quality system sprint
- reflect P1-P23 — card UX + hooks enforcement
- UX 명령 그룹 표에 P14 명령 반영
- UX 명령 그룹 표 갱신
- UX 명령 그룹 (status/config/profile/layer) 문서화
- restructure README for clarity and reading flow
- add per-environment update instructions to README
- clarify two-step update process in README

### Improvements

- resolve feat-001..006 + file feat-007 for stash WIP
- mark bug-001..007 resolved + update handoff
- record bug tickets + lessons from 2026-04-17 session
- adaptive context loading based on request complexity
- comprehensive token reduction via .claudeignore + prompt compression
- inject diff summary instead of letting reviewer run git diff
- massive token reduction — remove CLAUDE.md reads + agent-methods.md injection
- fix bin/sentix.js file permissions (npm link)
- test(lesson-promoter): add 12 tests for L4 auto-rule promotion
- test: add missing edge case coverage for quality gate and feedback loop
- merge: resolve conflicts with main (ec1f0a8 framework improvements)
- 4개 lib 모듈로 분산 (621 → 255)
- 템플릿/스택감지/훅 3개 lib 모듈로 분리 (579 → 200)
- debug + render 로직 분리 (450 → 248)
- 분석 로직을 lib/feature-impact.js 로 분리 (422 → 293)
- generateProjectProfile 을 lib 로 추출 (388 → 283)
- 카드 렌더링 lib 분리 + safety gate 추출 (376 → 281)
- stats/render 모듈 분리 (356 → 102)
- 렌더링을 lib/safety-render.js 로 분리 (346 → 228)
- inline 박스/색상 코드를 ui-box 로 일괄 마이그레이션
- merge: resolve conflicts with main (chained pipeline + hotfix mode)

---

## [2.0.22] — 2026-03-30

### New Features

- native Claude Code agents + hooks + JSON pipeline output
- sentix update syncs agents, hooks, methods to downstream projects

### Improvements

- `.claude/settings.json` — PostToolUse hook으로 Edit/Write 시 하드룰 실시간 검증
- `.claude/agents/` — planner, dev, pr-review, dev-fix, security 5개 네이티브 에이전트
- `pipeline.js` — `--output-format json` + `--agent` 자동 활용, 토큰 사용량 추적
- `update.js` — 에이전트/hooks/agent-methods.md를 하위 프로젝트에 동기화

---

## [2.0.21] — 2026-03-30

### New Features

- `docs/agent-methods.md` — 에이전트별 메서드 수준 명세 (Anthropic Building Effective Agents 기반)

### Improvements

- Generator-Evaluator 분리 원칙 명문화
- planner의 WHAT/WHERE만 정의, HOW 금지 규칙
- pr-review에 4가지 품질 채점 기준 추가 (정확성/일관성/간결성/테스트)
- Sprint Contract 패턴: dev 전 pr-review.contract() 사전 검증
- 복잡도 기반 리뷰 강도 조절 (low/mid/high)
- CLAUDE.md, FRAMEWORK.md에서 agent-methods.md 필수 참조
- pipeline.js에서 모든 phase 프롬프트에 agent-methods.md 주입

### CI/CD

- npm publish를 NPM_TOKEN + workflow_dispatch로 전환
- main 머지 시 버전 변경 감지 → 자동 npm 배포

---

## [2.0.1] — 2025-03-25

### New Features

- `src/dev-server.js` — Dev server for dashboard testing (Governor state, Memory Layer, metrics as JSON API on port 4400)
- `npm run dev` / `npm run start` / `npm run doctor` scripts added to package.json

### Security Fixes

- `run.js`: Replace `execSync` with `spawnSync` to prevent shell injection
- `deploy.sh`: Replace `eval "$cmd"` with `bash -c` + per-command error handling
- `deploy.sh`: Fix TOML parser to strip inline comments (prevent value pollution)
- `deploy.sh`: Section-aware `parse_toml KEY SECTION` — fixes ambiguous duplicate keys (e.g., `name` in both `[environment]` and `[project]`)
- `run.js`: Add concurrent execution guard (governor-state.json lock check)
- `run.js`: Add Claude Code CLI availability check before pipeline execution

### Bug Fixes

- `init.js`: `detectFramework()` now actually parses package.json dependencies (detects Next.js, Express, NestJS, Fastify, Koa, Hono, React, Vue, Svelte)
- `status.js`: Fix TOML parsing — per-section `enabled` check instead of global string search
- `doctor.js`: Exit code 1 when issues found (was always 0)
- `plugin.js`: Validate sanitized plugin name is non-empty
- `context.js`: Use top-level `appendFile` import instead of dynamic `import()`
- `context.js`: Atomic `writeJSON` via write-to-temp-then-rename
- `registry.js`: Isolate hook errors (one hook failure no longer crashes entire command)
- `metrics.js`: Warn when malformed JSONL lines are skipped

### Improvements

- Add `src/version.js` — centralized version from package.json (was hardcoded in 4 places)
- Add `NO_COLOR` env var and non-TTY support to logging
- Add JSONL log rotation to logger plugin (20k → 10k entries)
- Add per-command `--help` flag support (`sentix doctor --help`)
- Add `install-sentix.ps1` — Windows PowerShell installer

### Missing Files Created

- `tasks/patterns.md` — Pattern Engine data (was referenced but missing)
- `tasks/predictions.md` — Active predictions (was referenced but missing)
- `INTERFACE.md` — API contract template for multi-project cross-reference
- `registry.md` — Project registry for cascade deployment
- `sentix init` and `install-sentix.sh` now create INTERFACE.md + registry.md

### Documentation

- `FRAMEWORK.md`: Add governor-state.json schema with field definitions + `schema_version`
- `FRAMEWORK.md`: Add pre-fix snapshot definition
- `FRAMEWORK.md`: Add pattern-log.jsonl event type schema (7 event types)
- `README.md`: Mark Layer 4 (Visual) and Layer 5 (Evolution) as `planned` with activation instructions
- `CLAUDE.md`: Add deploy-output.md to learning files list
- `agent-profiles/default.toml`: Add pattern-engine agent definition

---

## [2.0.0] — 2025-03-25

### Document Normalization (9 → 2)

문서 체계를 정규화했다. 9개 개별 문서를 2개로 통합.

**통합된 문서:**
- `FRAMEWORK.md` — 유일한 설계 문서 (5 Layer Architecture, Governor, Pattern Engine, Visual Perception, Self-Evolution, Learning Pipeline 전부 통합)
- `CLAUDE.md` — 유일한 실행 문서 (Governor 지침, 7단계 파이프라인, 파괴 방지 6개 하드 룰)

**삭제된 문서 (FRAMEWORK.md에 통합):**
- `AGENTS.md`
- `DESIGN.md`
- `PATTERN-ENGINE.md`
- `VISUAL-PERCEPTION.md`
- `LEARNING-PIPELINE.md`
- `SELF-EVOLUTION.md`

### 구조 추가

- `.sentix/config.toml` — Layer 활성화 설정
- `.sentix/providers/claude.toml` — Claude API 어댑터
- `.sentix/providers/openai.toml` — OpenAI API 어댑터
- `.sentix/providers/ollama.toml` — Local First 어댑터
- `.sentix/rules/hard-rules.md` — 불변 규칙 6개 별도 격리
- `tasks/lessons.md`, `tasks/roadmap.md`, `tasks/security-report.md` — Memory Layer 초기 파일
- `install-sentix.sh` — 기존 프로젝트에 Sentix 설치 스크립트

### sentix CLI 추가

외부 의존성 0, Node.js 18+ ESM 기반 플러그인 아키텍처 CLI:

- `sentix init` — 프로젝트에 Sentix 설치 (기술 스택 자동 감지)
- `sentix run` — Governor 파이프라인 실행
- `sentix status` — Governor 상태 + Memory Layer 요약
- `sentix doctor` — 설치 상태 진단
- `sentix metrics` — 에이전트 성공률/재시도율 분석
- `sentix plugin` — 플러그인 관리

플러그인 시스템:
- `registry.registerCommand()` — 커맨드 등록
- `registry.registerHook()` — before:command, after:command 훅
- 로딩 순서: `src/commands/` → `src/plugins/` → `.sentix/plugins/`

### Migration Guide (v1 → v2)

```
1. AGENTS.md 참조를 FRAMEWORK.md로 변경
2. 삭제된 6개 파일 제거 (FRAMEWORK.md에 통합됨)
3. CLAUDE.md의 기술 스택 템플릿을 프로젝트에 맞게 수정
4. .sentix/ 디렉토리 추가 (install-sentix.sh 또는 sentix init)
5. tasks/ 구조 업데이트 (lessons.md, roadmap.md, security-report.md)
```

---

## [1.0.0] — 2025-03-24

### Initial Release

- Governor 아키텍처 (AGENTS.md)
- 설계 원칙 (DESIGN.md)
- Pattern Engine (PATTERN-ENGINE.md)
- Visual Perception (VISUAL-PERCEPTION.md)
- Learning Pipeline (LEARNING-PIPELINE.md)
- Self-Evolution Engine (SELF-EVOLUTION.md)
- 환경 프로필 시스템 (env-profiles/)
- 에이전트 프로필 (agent-profiles/)
- 배포 스크립트 (scripts/deploy.sh)
- CI/CD (deploy.yml, security-scan.yml)
