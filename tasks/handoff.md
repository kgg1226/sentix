# Handoff — 이전 세션 인수인계

## 완료된 작업 (이번 세션)

### 실전 테스트 기반 버그 수정
- fix: scripts/hooks/ npm publish 누락 → package.json files에 추가
- fix: DEV 에이전트가 자기 훅에 차단됨 → SENTIX_PIPELINE 환경 변수 + --permission-mode acceptEdits
- fix: phase 타임아웃 5분 → 15분
- fix: doctor가 잘못된 경로에서 L2~L6 체크 → 패키지 내부 경로로 변경
- fix: recovery key가 동일값 → crypto.randomBytes로 변경

### 토큰 경량화
- perf: "Read CLAUDE.md first" 제거 (7곳) — ~100K tokens 절감
- perf: agent-methods.md 전문 주입 제거 — ~23K tokens 절감
- perf: REVIEW에 diff 요약 주입 (git diff 직접 실행 방지)
- perf: .claudeignore 확장 (FRAMEWORK.md, README.md, docs/*.md, 데이터 파일)
- perf: lessons/patterns/constraints 길이 제한 강화
- perf: 적응형 컨텍스트 로딩 (간단한 요청은 경량 모드)

### UX 개선
- feat: 인터랙티브 선택지 입력 구체화
- feat: 토큰 사용량 per-phase + 총합 표시
- feat: sentix update 시 README 버전 자동 갱신
- docs: README 4개 언어 + 환경별 OX 표 + 로컬/글로벌 설치 차이

## 다음 세션 권장 작업

1. **에이전트 간 위임 프로토콜** — gate 위반 시 적절한 에이전트에게 자동 재라우팅
2. **FINALIZE를 코드로 대체** — Claude 소환 없이 git commit + 학습 기록
3. **--skip-review 플래그** — 간단한 작업에서 REVIEW 건너뛰기
4. **복잡도 기반 자동 경로** — low → hotfix (PLAN+REVIEW 스킵), high → full pipeline
5. **Bash 우회 차단** — echo >/tee로 파일 쓰기 감지

## 수용된 한계

- Claude가 채팅에서 sentix run을 자동 실행하지 않는 문제 → 사용자가 명시적으로 "npx sentix run" 포함해야 함
- 글로벌 설치는 Claude Code 앱/웹에서 접근 불가 → 로컬 설치 필수
