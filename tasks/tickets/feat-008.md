# feat-008: sentix ticket close <id> 서브명령 추가 — 현재 CLI에 ticket create/list/debug 만 있고 clos...

- **Status:** open
- **Complexity:** low
- **Deploy flag:** false
- **Security flag:** false
- **Created:** 2026-04-17T08:42:09.324Z

## Description

sentix ticket close <id> 서브명령 추가 — 현재 CLI에 ticket create/list/debug 만 있고 close 없음. 수동 index.json 편집 없이 status 전환하도록 src/commands/ticket.js에 close 서브명령 등록. ticket-index.js의 updateTicket 재사용. SCOPE: src/commands/ticket.js + __tests__/ticket-index.test.js (테스트 있으면 보강). resolved→closed 또는 open→closed(요청 시 강제) 지원.

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

<!-- N/A — low/medium complexity -->

## Acceptance Criteria

<!-- Populated by planner agent -->
