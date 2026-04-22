# feat-010: README의 '환경별 기능 지원' 표를 5열(Terminal sentix run / Claude Bash sentix run / Conv...

- **Status:** open
- **Complexity:** medium
- **Deploy flag:** true
- **Security flag:** false
- **Created:** 2026-04-22T01:51:01.544Z

## Description

README의 '환경별 기능 지원' 표를 5열(Terminal sentix run / Claude Bash sentix run / Conversation / claude.ai Web / API)로 재구성하고 Integrity를 verify+restore와 snapshot 갱신 두 행으로 분리. 각 셀은 코드 근거를 가진 100% 정확한 상태만 기재 (PreToolUse 훅은 pipeline 중 pass-through / Interactive enrichment는 TTY 전제 등). EN/KR/JA/CN 4개 언어 모두 동일 정확도 유지. SCOPE: README.md 만.

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

<!-- N/A — low/medium complexity -->

## Acceptance Criteria

<!-- Populated by planner agent -->
