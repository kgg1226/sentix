# Lessons — 자동 축적되는 실패 패턴

> dev-fix가 실행될 때마다 LESSON_LEARNED가 여기에 기록된다.
> 동일 패턴 3회 반복 → roadmap에 구조적 개선 항목으로 자동 승격.
> 다음 planner 실행 시 이 파일이 컨텍스트로 자동 주입된다.

---

<!-- 아래에 자동으로 추가됨 -->

## 2026-03-30 — CI workflow 연속 실패 (7회)

**이슈**: publish.yml을 수정할 때마다 다른 에러 발생. YAML 문법, OIDC 인증, git 권한, shallow clone 등.

**근본 원인**: CI 코드를 로컬에서 검증하지 않고 main에 직접 push → 실패 → 수정 → 실패 반복.

**교훈**:
1. **CI workflow는 한 번에 동작하는 가장 단순한 방식으로 작성한다.** 복잡한 YAML (sed 멀티라인, OIDC, git push) 대신 단일 node 스크립트.
2. **GitHub Actions에서 main push는 403이 기본이다.** `GITHUB_TOKEN`으로 보호된 브랜치에 push 불가. git commit/push를 CI에 넣지 않는다.
3. **npm publish는 npm 버전 기준으로 bump한다.** git의 package.json이 아닌 `npm view` 결과 기준.
4. **`--provenance` 플래그는 OIDC 버그(npm/cli#8976)로 E404를 유발한다.** 사용하지 않는다.
5. **workflow 변경은 반드시 문법 검증 후 push한다.** `actionlint` 또는 로컬 테스트 선행.
6. **한 번에 여러 개를 바꾸지 않는다.** OIDC 전환 + 버전 자동화 + CHANGELOG 생성을 동시에 하면 디버깅 불가.

**패턴**: "CI를 고치려다 CI를 더 부순다" → 가장 단순한 방식부터 동작 확인 후 점진적 확장.
