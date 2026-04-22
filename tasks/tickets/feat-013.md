# feat-013: .claude/agents/planner.md + dev.md + pr-review.md 의 agent 프롬프트에 참조 문서 구조 반영: ...

- **Status:** open
- **Complexity:** low
- **Deploy flag:** false
- **Security flag:** false
- **Created:** 2026-04-22T01:51:27.190Z

## Description

.claude/agents/planner.md + dev.md + pr-review.md 의 agent 프롬프트에 참조 문서 구조 반영: (1) Agentic Loop — Gather Context → Plan → Act → Verify → Stop (narration 의무) (2) Description↔Discernment 루프 — 매 산출물 직전 Product/Process/Performance 자기검사 (3) 3P 프레임 — Product/Process/Performance 슬롯 고정 (4) Calibrated Trust — 고확신/저확신 언어 구분. 기존 snapshot→implement→test→verify→refine→report 순서는 그대로 유지하고 그 위에 상위 원칙으로 덧댐. SCOPE: .claude/agents/*.md 3개 파일.

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

<!-- N/A — low/medium complexity -->

## Acceptance Criteria

<!-- Populated by planner agent -->
