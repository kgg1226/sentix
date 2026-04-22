# feat-009: 상태변경 명령어(ticket create/close, version bump, feature add, resume, evolve)에 ana...

- **Status:** open
- **Complexity:** medium
- **Deploy flag:** false
- **Security flag:** false
- **Created:** 2026-04-21T01:39:58.448Z

## Description

상태변경 명령어(ticket create/close, version bump, feature add, resume, evolve)에 analyze-validate-execute-verify 4단계 에이전트 루틴 래퍼 도입. 신규 모듈 src/lib/command-routine.js에서 각 phase 종료 시 state.json 일관성과 영향 파일 무결성을 자기검증하고, 실패 시 롤백 후 원인/해결방안 출력. 읽기전용 명령어(list, status 등)는 제외.

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

<!-- N/A — low/medium complexity -->

## Acceptance Criteria

<!-- Populated by planner agent -->
