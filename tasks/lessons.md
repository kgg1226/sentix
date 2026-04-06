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
