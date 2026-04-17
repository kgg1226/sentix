---
description: "npm 관련 작업 시 자동 로드 (lessons.md에서 3회 반복 감지)"
---

# Auto-Generated Rule: npm

> 이 파일은 lessons.md에서 동일 패턴이 3회 반복되어 자동 생성됨.
> 수동 편집 가능하지만, 같은 패턴이 또 반복되면 덮어쓰지 않고 업데이트됨.

## Observed Failures

- **2026-04-17 — 파이프라인 "성공" 종료 ≠ 티켓 해결 (cycle-2026-04-17-846)** — **이슈**: bug-001 critical 4개 항목 수정 요청으로 sentix run 실행 → PLAN/DEV/GATE/REVIEW/FINALIZE 모두 "completed"로 종료. 그러나 실제 산출물은 사용자
- **시드 교훈 (공통 패턴)** — ### [2025-01-01] Dockerfile COPY 순서 — 빌드 캐시 무효화
- **2026-03-30 — CI workflow 연속 실패 (7회)** — **이슈**: publish.yml을 수정할 때마다 다른 에러 발생. YAML 문법, OIDC 인증, git 권한, shallow clone 등.

## Prevention Rules

1. npm 관련 작업 전에 lessons.md의 해당 패턴 먼저 확인
2. 같은 실수 반복 시 재계획(replan) 트리거
3. 수정 전 반드시 테스트 스냅샷 확보
