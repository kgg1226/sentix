# Handoff — 스프린트 2026-04-22 (Claude Academy 정합화) — **완료**

> 이 세션이 중단되어도 다른 세션/CLI에서 `sentix ticket list` + 이 파일을 읽어 바로 이어갈 수 있게 설계.

---

## 스프린트 결과 — 종료

| 종료 조건 | 충족 |
|---|---|
| 레포만 보면 전체 원칙을 추적할 수 있다 | ✅ `docs/core-principles.md` + `docs/system-prompt-template.md` 이관 |
| `sentix init` 한 번으로 신규 프로젝트가 모든 정합성 자산을 받는다 | ✅ feat-014 — system-prompt-template 배포 + doctor 체크 |
| README 의 기술적 주장은 100% 코드 근거를 가진다 | ✅ feat-010 — 5열 표 / Integrity 분리 / 모든 셀이 코드 근거 |
| 추론 vs 사실 기반의 경계가 파이프라인 단계별로 명확하다 | ✅ feat-013 — planner=추론 허용 / dev·pr-review=사실 기반 only |

검증: 231/231 tests pass, 모든 게이트 통과, integrity snapshot 갱신됨.

---

## 스프린트 목표 (원본)

**Sentix 프레임워크를 Claude Academy 17강(2026-04, Anthropic 교육 내용)의 원칙에 정합시킨다.**
참조 문서 2종 (`Sentix_Claude_Core_Principles.md`, `Sentix_System_Prompt.md`) 의 모든 원칙을
레포 자산·규칙·에이전트 프롬프트·init 배포 경로에 손실 없이 반영한다.

---

## 스프린트 범위 — 5개 feature 티켓 + 4단계 Phase

| Phase | Ticket | 주제 | SCOPE |
|---|---|---|---|
| 1 | **feat-010** | README 환경별 기능 지원 표 100% 정확성 재구성 (5열, 4개 언어, Integrity 분리 등) | `README.md` |
| 2a | **feat-011** | `docs/core-principles.md` + `docs/system-prompt-template.md` 신규 이관 | `docs/` 신규 2개 파일 |
| 2b | **feat-012** | CLAUDE.md / FRAMEWORK.md / hard-rules.md 에 4D / handling_uncertainty / anti_patterns 블록 추가 | `CLAUDE.md`, `FRAMEWORK.md`, `.sentix/rules/hard-rules.md` |
| 3a | **feat-013** | planner / dev / pr-review 에이전트 프롬프트에 agentic_loop + 3P + discernment 반영 | `.claude/agents/*.md` 3개 |
| 3b | **feat-014** | `sentix init` 이 system-prompt-template 배포, `sentix doctor` 에 존재 체크 | `src/lib/init-templates.js`, `src/commands/init.js`, `src/commands/doctor.js`, `__tests__/` |
| 4a | — | 이 handoff 최종 정리 | `tasks/handoff.md` |
| 4b | — | 사용자 대상 변경 README 동기화 (memory 규칙) | `README.md` |
| 4c | — | PR #29 에 모든 커밋 push + 상태 확인 | — |

## 의존성 그래프

```
feat-011 (docs 이관)
   ↓
feat-012 (CLAUDE.md/FRAMEWORK.md 블록)
   ↓
feat-013 (agent prompts) ─────┐
                              ↓
feat-014 (init 배포)          ──→  handoff.md 최종 (Phase 4a)
feat-010 (README 5열 표) ─────┘       ↓
                                   README 사용자 대상 동기화 (Phase 4b)
                                      ↓
                                   PR #29 push (Phase 4c)
```

- **feat-010** 은 독립 실행 가능 (README만 건듬) → 언제든 Phase 1로 선착수 가능
- **feat-011 → feat-012 → feat-013** 은 의존 순서대로 진행해야 참조 일관성 유지
- **feat-014** 는 feat-011/012가 끝난 뒤 (배포 대상이 확정돼야 배포 로직 작성)

## 실행 방법

각 티켓은 한 번의 `sentix run` 으로 처리하거나, 규모가 작으면 핫픽스(직접 Edit)로 처리한다.
스프린트 특성상 문서 비중이 크므로 Phase 1·2a·2b·4a·4b 는 핫픽스 경로가 적절.
Phase 3a·3b 는 에이전트 프롬프트와 init 로직 변경 포함 — `sentix run` 권장.

하드 룰 6개는 모든 Phase 에 그대로 적용. 특히 Phase 2b 는 `CLAUDE.md/FRAMEWORK.md` 변조
성격이므로 integrity-guard snapshot 갱신이 필요 — finalize에서 자동 처리됨 (bug-007 hotfix 결과).

## 이전 세션 요약 (2026-04-17)

- self-hosting 실패 → 6개 구조 버그 핫픽스 (bug-002~007)
- feat-007 (patternDirective 전파) + feat-008 (sentix ticket close) 추가
- PR #29 오픈: `feat/self-hosting-2026-04-17` → `main`
- 이번 스프린트의 모든 commit은 **같은 PR #29 브랜치에 누적** (새 PR 만들지 않음)

## CLI에서 스프린트 상태 조회

```bash
sentix ticket list --status open        # 열린 feat-010 ~ feat-014 확인
sentix ticket debug feat-010            # 특정 티켓 상세
cat tasks/handoff.md                    # 이 문서
git log --oneline origin/main..HEAD     # PR 누적 커밋
git status --short                      # 다음 commit 대상
```

## 중단 후 재개 프로토콜

1. 새 세션 시작 시 이 파일과 `sentix ticket list --status open` 먼저 본다
2. TodoWrite 는 세션별로 재작성 (영속 아님) — 이 handoff가 단일 출처(single source of truth)
3. 마지막 commit 메시지와 `git diff HEAD~1 HEAD --stat` 로 직전 작업 단위 복원
4. 다음 티켓은 표의 Phase 순서를 따른다

---

## 다음 스프린트 후보 — 대형 파일 리팩터링 (sentix evolve 권고)

`sentix evolve` / `sentix status` 가 자동 감지한 대형 파일 6개. 하드 룰 5
("순삭제 50줄 초과 시 리팩터링은 별도 phase 분리") 를 따라 각 파일 별로 독립 sprint
또는 백로그 티켓으로 처리한다.

| 파일 | 라인수 | 특징 |
|---|---:|---|
| `src/lib/pipeline.js` | ~483 | 핵심 — 분해 시 전체 영향. dev-swarm/multi-gen 분기 분리 후보 |
| `src/commands/run.js` | ~418 | 사용자 진입점 — args 파싱 / 실행기 / UI 분리 후보 |
| `src/lib/quality-gate.js` | ~373 | 5 checks 별 모듈화 가능 (`checks/` 디렉토리) |
| `src/commands/doctor.js` | ~337 | 카드 별 check 함수 분해 가능 |
| `src/lib/verify-gates.js` | ~323 | gate 별 모듈화 (scope/export/test/net) |
| `src/commands/version.js` | ~312 | bump / changelog / tag 분리 |

**권장 처리 방식**:
- 각 파일은 별 ticket(`refactor-001` ~ `refactor-006`) 으로 분리
- 한 ticket 당 1개 파일 — sentix run 사이클 timeout 회피
- `--multi-gen 3` 으로 다양한 분해 안 비교 후 채택
- 하드 룰 3 (export 보존) 위반 없이 모듈 분리 (re-export 활용)

이 항목은 이번 스프린트(feat-010~014)와 분리된 별도 단위로, 다음 세션에서 새 sprint
계획을 짜는 시점에 우선순위 결정.
