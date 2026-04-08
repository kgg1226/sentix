# INTERFACE.md — Sentix API Contract

> 이 파일은 다른 프로젝트가 이 프로젝트를 참조할 때 읽는 계약서다.
> 멀티 프로젝트 교차 참조 시 Governor가 이 파일을 기반으로 충돌 여부를 판단한다.
> `sentix context`가 이 파일을 가져와 tasks/context/에 캐시한다.

---

## Project

```
name: sentix
version: 2.0.21
type: framework
```

## Tech Stack

```
runtime: Node.js 18+
language: JavaScript (ESM)
package_manager: npm
framework: CLI (plugin architecture)
test: npm test
build: none (no build step)
```

## Directory Structure

```
bin/            CLI 엔트리포인트
src/
  commands/     CLI 명령어 (auto-loaded)
  lib/          핵심 라이브러리 (pipeline, verify-gates, safety, changelog)
  plugins/      내장 플러그인 (auto-version, logger)
docs/           프레임워크 문서 (governor-sop, agent-methods, agent-scopes)
.claude/
  agents/       네이티브 에이전트 프로필 (planner, dev, pr-review, dev-fix, security)
  rules/        조건부 규칙 (paths frontmatter)
  skills/       커스텀 스킬 (self-evolve)
.sentix/
  config.toml   Layer 활성화 설정
  rules/        하드 룰
  providers/    AI 어댑터 (claude, openai, ollama)
tasks/
  tickets/      티켓 시스템
  lessons.md    실패 패턴 (세션 간 자동 주입)
  patterns.md   행동 패턴
  context/      연동 프로젝트 캐시
scripts/        배포/검증 스크립트
```

## Key Patterns

```
pipeline: planner → dev → gate → pr-review → finalize
agents: 별도 claude 프로세스로 spawn, 각 phase마다 독립 세션
state: tasks/governor-state.json으로 파이프라인 상태 추적
learning: lessons.md가 다음 세션에 자동 주입
versioning: CI가 커밋 메시지에서 자동 감지하여 npm 배포
```

## Exported APIs

```
현재 없음 (프레임워크 프로젝트 — CLI 도구 배포)
npm: sentix (global CLI)
```

## Schemas

```
티켓: TICKET_ID, TITLE, SCOPE, ACCEPTANCE, COMPLEXITY, FLAGS
governor-state: schema_version, cycle_id, status, current_phase, plan[]
pattern-log: {ts, event, ...fields} (JSONL)
```

## Dependencies on Other Projects

| 프로젝트 | 참조 대상 | 용도 |
|---|---|---|
| (없음) | — | — |

---

## Changelog

| 날짜 | 변경 | 영향 범위 |
|---|---|---|
| 2026-03-31 | agent-methods.md, .claude/agents/, pipeline 병렬화 | sentix update 대상 |
| 2026-03-30 | v2.1.0 npm 자동 배포 | 하위 프로젝트 |
| 2025-03-25 | v2.0.0 초기 작성 | — |

---

> 이 파일이 변경되면 deploy.yml의 cascade job이
> registry.md에 등록된 연동 프로젝트에 자동으로 repository_dispatch를 보낸다.
