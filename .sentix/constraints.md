# Project Constraints — 자동 주입 규칙
#
# 이 파일의 모든 항목은 planner/dev 프롬프트에 자동으로 주입됩니다.
# 시간이 지나면서 lessons.md의 반복 패턴이 여기에 추가됩니다.
#
# 형식: 카테고리별 마크다운 리스트
# 각 항목은 "하지 마라" (금지) 또는 "반드시 하라" (필수) 형태

## Security (보안)

- eval(), new Function() 사용 금지 — 코드 인젝션 위험
- innerHTML 직접 대입 금지 — XSS 위험, textContent 또는 sanitizer 사용
- 비밀번호, API 키, 토큰을 코드에 하드코딩 금지 — 환경 변수 사용
- 사용자 입력을 검증 없이 파일 경로, 셸 명령, SQL에 삽입 금지

## Code Quality (코드 품질)

- src/, lib/, app/ 내 console.log 금지 — ctx.log 또는 프로젝트 로거 사용
- any 타입 사용 금지 (TypeScript 프로젝트) — 구체적 타입 명시
- 매직 넘버 금지 — 상수로 추출하여 이름 부여
- 500줄 이상의 파일 생성 금지 — 모듈 분리

## Architecture (아키텍처)

- 외부 npm 의존성 추가 금지 — Node.js 내장 모듈만 사용 (zero-dep 정책)
- 동기 I/O를 핫 경로에서 사용 금지 — readFileSync는 초기화 시에만
- 순환 import 금지 — 모듈 의존성은 단방향

## Testing (테스트)

- 새 기능에는 반드시 테스트 추가
- happy path만이 아니라 edge case도 테스트
- 테스트에서 setTimeout/sleep 사용 금지 — 결정론적 검증만

## Patterns from Lessons (학습된 패턴)

<!-- 아래는 피드백 루프에 의해 자동 추가됩니다 -->
