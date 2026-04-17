# feat-007: dev-swarm + pipeline-prompts 에 patternDirective 전파 — pipeline.js의 generatePat...

- **Status:** closed
- **Complexity:** low
- **Deploy flag:** false
- **Security flag:** false
- **Created:** 2026-04-17T08:25:04.353Z

## Description

dev-swarm + pipeline-prompts 에 patternDirective 전파 — pipeline.js의 generatePatternDirective 결과를 runDevSwarm/buildDevPrompt/buildDevSwarmFallbackPrompt/buildSwarmWorkerPrompt 모두에 전달. 현재 HEAD는 constraintsContext만 전달하고 pattern directive는 순차 dev에만 사용됨. stash@{0}에 참고용 WIP 있음 (2026-04-17 cycle-846 산출물, dev 스코프 이탈로 분리 보관).

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

<!-- N/A — low/medium complexity -->

## Acceptance Criteria

<!-- Populated by planner agent -->
