# Handoff — 이전 세션 인수인계

## 2026-04-17 세션 — self-hosting 실전 테스트 + 구조 버그 핫픽스

### 상황 요약
- sentix run으로 bug-001 (Quality Gate/Spec Enricher/Feedback Loop 통합 버그 4건) 수정 시도 → 파이프라인 exit 0이지만 실제 산출물은 티켓과 무관한 patternDirective 전파 작업. dev 스코프 이탈.
- 이어서 bug-006(hook 범위 초과) sentix run → 파이프라인 exit 0이지만 dev의 require-ticket.js 수정이 사라지고 1,2차 REVIEW 15분 타임아웃.
- 2번의 pipeline 실패 과정에서 **구조적 결함 6건** 노출 → bug-002~007로 티켓화 → 핫픽스로 일괄 해결.

### 핫픽스 (commit b157087)
| 티켓 | 파일 | 요약 |
|------|------|------|
| bug-002 | `src/lib/verify-gates.js` | 시그니처 확장(파라미터 추가)을 export 삭제로 오판하던 버그. `addedLines` 추적 + `extractExportId`로 동일 식별자 매칭 시 제외. |
| bug-003 | `src/lib/quality-gate.js` | `parseTestOutput`이 `# tests N`만 지원. Node test runner의 `ℹ tests N` (U+2139) 요약 포맷 추가 지원, 마지막 매치 채택. |
| bug-004 | `src/lib/pipeline-worker.js` | Phase별 타임아웃 맵. `review: 30분` (기존 일괄 15분). |
| bug-005 | `src/lib/pipeline-prompts.js` | dev 프롬프트에 "티켓 본문에서 파일/함수/acceptance 1:1 추출, 스코프 이탈 금지, 모호하면 STOP" 명시. |
| bug-006 | `scripts/hooks/require-ticket.js` | `safeRealpath`로 심볼릭 링크(`/var`↔`/private/var`) 정규화 후 cwd 밖이면 즉시 통과. |
| bug-007 | `src/lib/pipeline.js` | Finalize phase에서 `snapshotIntegrity` 자동 호출 → dev 정식 산출물이 다음 세션에 원복되지 않음. |

### 검증
- Tests: 191/191 pass (이전 186/191, 5 fail이던 require-ticket-hook 전체 복구)
- 실전: `~/.claude/projects/.../memory/` 로 Write 실제 성공 확인

### 다음 세션 권장 작업

1. **stash 처리**: `stash@{0}` 에 patternDirective 전파 작업 보관 중 (pipeline → pipeline-swarm → pipeline-prompts). dev 스코프 이탈 산출물이지만 기능적으로는 의미 있음. 평가 후 feat 티켓화 또는 drop.
2. **티켓 상태 정리**: bug-001~007 는 resolved 상태. 다음 세션에 리뷰 후 closed 전환.
3. **self-hosting 재시도**: bug-005(dev 스코프) + bug-007(integrity) 수정이 실제로 작동하는지 **작은 사이클**로 확인. 예: 간단한 주석 수정 정도의 sentix run.
4. **feat-001~006 재평가**: feat-001(Quality Gate)은 이미 구현됨, feat-002~006은 일부 overlap 가능.

### 교훈 (lessons.md에도 기록됨)
- 파이프라인 exit 0은 "절차 완료"이지 "티켓 해결"이 아님
- 매 사이클 후 반드시 `git diff` 를 티켓 acceptance와 1:1 대조
- 메타 버그 발견 시 즉시 티켓 생성 (사용자 지시: "항상 절대적으로 기록")
