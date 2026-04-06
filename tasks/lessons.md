# Lessons — 자동 축적되는 실패 패턴

> dev-fix가 실행될 때마다 LESSON_LEARNED가 여기에 기록된다.
> 동일 패턴 3회 반복 → roadmap에 구조적 개선 항목으로 자동 승격.
> 다음 planner 실행 시 이 파일이 컨텍스트로 자동 주입된다.

---

## 기록 형식

```
### [YYYY-MM-DD] PATTERN_NAME
- **심각도**: critical | warning | suggestion
- **설명**: 무엇이 왜 실패했는가
- **수정**: 어떻게 수정했는가
- **예방**: 같은 실수를 반복하지 않으려면
```

---

## 시드 교훈 (공통 패턴)

### [2025-01-01] Dockerfile COPY 순서 — 빌드 캐시 무효화

- **심각도**: warning
- **설명**: Dockerfile에서 소스코드 COPY를 의존성 설치 전에 배치하면, 코드 변경 시마다 npm install이 재실행되어 빌드 시간이 급증한다.
- **수정**: COPY package*.json → RUN npm install → COPY . 순서로 변경
- **예방**: Dockerfile 작성 시 변경 빈도가 낮은 레이어를 상단에 배치한다.

### [2025-01-01] Prisma P2002 unique constraint violation 미처리

- **심각도**: critical
- **설명**: upsert 대신 create를 사용하면 unique constraint 위반 시 P2002 에러가 발생한다. 중복 데이터 삽입 시나리오를 고려하지 않으면 운영 환경에서 500 에러가 발생한다.
- **수정**: try-catch로 P2002를 잡고 upsert로 대체하거나, 명시적 중복 체크 로직을 추가한다.
- **예방**: DB write 로직에는 항상 unique constraint 시나리오를 검토한다.

### [2025-01-01] .env 미로드 — 프로덕션 환경변수 누락

- **심각도**: critical
- **설명**: 로컬에서는 dotenv가 .env를 자동 로드하지만, Docker/프로덕션에서는 .env 파일이 없거나 dotenv가 호출되지 않아 환경변수가 undefined가 된다.
- **수정**: Docker에서는 --env-file 또는 환경변수를 직접 주입한다.
- **예방**: 앱 시작 시 필수 환경변수 존재 여부를 검증하는 startup check를 추가한다.

---

<!-- 아래에 LESSON_LEARNED가 자동으로 추가됨 -->

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
