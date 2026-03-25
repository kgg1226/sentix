# CLAUDE.md — Sentix Governor 실행 지침

> 이 파일은 Claude Code가 읽는 유일한 실행 문서다.
> 설계 배경은 FRAMEWORK.md를 참조하라.

---

## 기술 스택

```
runtime: Node.js 18+
language: JavaScript (ESM)
package_manager: npm
test: npm test
lint: # 미설정 (프로젝트에 맞게 추가)
build: # 미설정 (CLI 프로젝트 — 빌드 불필요)
framework: CLI (plugin architecture)
database: N/A (tasks/ 파일 기반)
deploy: env-profiles/active.toml 참조
```

---

## Governor SOP — 7단계 파이프라인

```
Step 0: CLAUDE.md(이 파일) + FRAMEWORK.md 읽기
Step 1: 요청 수신
Step 2: lessons.md + patterns.md 로드
Step 3: 실행 계획 수립 (어떤 에이전트를, 어떤 순서로, 어떤 컨텍스트와 함께)
Step 4: 에이전트 순차/병렬 소환 → 결과 수거 → 판단 → 다음 결정
Step 5: 이슈 시 교차 판단 (재시도 / 에스컬레이션 / planner 재소환)
Step 6: 전체 완료 → 인간에게 최종 보고
Step 7: pattern-engine 실행 → 이번 사이클 학습 → governor-state.json 업데이트
```

### 실행 계획 예시

```
요청: "인증에 세션 만료 추가해줘"

Governor 판단:
  1. planner 소환 — 요청 + lessons.md + patterns.md 주입
     → 결과: 티켓 (COMPLEXITY: medium, DEPLOY_FLAG: true, SECURITY_FLAG: true)

  2. SECURITY_FLAG → security 선행 분석 → "현재 auth 구조 분석"

  3. dev 소환 — 티켓 + security 분석 결과 주입
     → 결과: 코드 변경 + 테스트 + pre-fix snapshot

  4. pr-review 소환 — 티켓 + dev 결과 + pre-fix snapshot 주입
     → APPROVED → 머지
     → REJECTED → dev에게 사유 전달 + 재실행

  5. DEPLOY_FLAG: true → devops 실행 (env-profiles 참조)

  6. security 소환 (전체 스캔)
     → PASSED → roadmap 소환
     → NEEDS_FIX → dev-fix → pr-review → devops → security (루프)

  7. pattern-engine 실행 → 사이클 기록 → 완료 보고
```

---

## 파괴 방지 하드 룰 6개 (HARD RULE — Governor도 우회 불가)

```
1. 작업 전 테스트 스냅샷 필수
   npm run test -- --json > tasks/.pre-fix-test-results.json

2. 티켓 SCOPE 밖 파일 수정 금지
   별도 개선 필요 시 → Governor에게 "SCOPE 확장 필요" 반환

3. 기존 export/API 삭제 금지
   시그니처 변경 불가피 시 → Governor에게 "planner 재소환 필요" 반환

4. 기존 테스트 삭제/약화 금지
   테스트 실패 → 코드를 고친다, 테스트를 고치지 않는다

5. 순삭제 50줄 제한
   초과 시 → Governor에게 "리팩터링 분리 필요" 반환

6. 기존 기능/핸들러 삭제 금지 (가장 중요)
   "버그가 있는 기능은 고치는 것이지, 없애는 것이 아니다."
   기능 삭제가 진짜 필요한 경우:
     → Governor에게 "기능 삭제 필요 — planner 경유 요청" 반환
     → planner가 별도 티켓으로 분리
```

---

## 에이전트별 파일 범위

```
dev / dev-fix / dev-worker:
  쓰기: app/**, lib/**, components/**, __tests__/**
  금지: prisma/schema.prisma, docker/**, .github/**, FRAMEWORK.md, CLAUDE.md

planner:
  금지: 코드 파일 수정 일체

pr-review:
  금지: 코드 수정. git merge 명령만.

security:
  금지: 코드 수정 일체. 읽기 전용.

devops:
  실체: scripts/deploy.sh (Governor가 실행)

Governor:
  쓰기: tasks/governor-state.json (자신의 상태만)
  금지: 코드 직접 수정 (반드시 에이전트를 통해서)
```

---

## severity 기반 분기

```
critical: dev-fix 3회 재시도 → 실패 시 즉시 roadmap 에스컬레이션 + 인간 알림
warning:  dev-fix 10회 재시도 → 실패 시 roadmap 에스컬레이션
suggestion: 로깅만, dev-fix 미실행
동일 패턴 3회 반복 → 구조적 개선 항목으로 자동 승격
```

---

## 학습 파일

```
tasks/
├── lessons.md               ← 실패 패턴 (dev-fix LESSON_LEARNED 자동 축적)
├── patterns.md              ← 사용자 행동 패턴 (pattern-engine 자동 관리)
├── visual-preferences.md    ← 시각 선호도 (pattern-engine 자동 관리)
├── predictions.md           ← 활성 예측 (pattern-engine 자동 관리)
├── pattern-log.jsonl        ← 원시 이벤트 로그 (append-only)
├── agent-metrics.jsonl      ← 에이전트 실행 기록 (append-only)
├── governor-state.json      ← Governor 현재 상태 (복원용)
├── security-report.md       ← 최신 보안 스캔 결과
├── roadmap.md               ← 고도화 계획 + 다음 티켓 초안
├── deploy-output.md         ← 배포 결과 또는 manual 모드 스크립트
└── tickets/                 ← planner가 생성하는 티켓
```

---

## 환경 프로필

```
env-profiles/active.toml → devops 실행 방식 결정

method: ssm    → AWS SSM 자동 실행
method: ssh    → SSH 자동 실행
method: manual → 스크립트 생성 + 인간에게 알림 + 대기
method: local  → 로컬 Docker 직접 실행
```

---

## 멀티 프로젝트 참조

```
허용: ../[프로젝트]/INTERFACE.md, ../[프로젝트]/README.md
조건부: ../[프로젝트]/src/** (스키마 직접 연동 시만)
금지: 다른 프로젝트 파일 수정, 전체 디렉토리 스캔
```

---

## config

```
.sentix/config.toml — Layer 활성화 설정
.sentix/providers/ — AI 어댑터 (claude.toml, openai.toml, ollama.toml)
.sentix/rules/hard-rules.md — 불변 규칙 별도 격리
```
