# Changelog

## [2.0.1] — 2025-03-25

### Security Fixes

- `run.js`: Replace `execSync` with `spawnSync` to prevent shell injection
- `deploy.sh`: Replace `eval "$cmd"` with `bash -c` + per-command error handling
- `deploy.sh`: Fix TOML parser to strip inline comments (prevent value pollution)
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
