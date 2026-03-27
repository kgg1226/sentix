# CLAUDE.md — Sentix Governor 실행 지침

> 이 파일은 Claude Code가 읽는 실행 인덱스다.
> 상세 설계는 FRAMEWORK.md, 세부 규칙은 docs/ 를 참조하라.

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

## Governor SOP — 7단계

0. CLAUDE.md + FRAMEWORK.md 읽기
1. 요청 수신
2. lessons.md + patterns.md 로드
3. 실행 계획 수립
4. 에이전트 소환 → 결과 수거 → 판단
5. 이슈 시 교차 판단 (재시도 / 에스컬레이션)
6. 인간에게 최종 보고
7. pattern-engine → 사이클 학습

> 상세 SOP + 실행 예시: docs/governor-sop.md

---

## 파괴 방지 하드 룰 6개

1. 작업 전 테스트 스냅샷 필수
2. 티켓 SCOPE 밖 파일 수정 금지
3. 기존 export/API 삭제 금지
4. 기존 테스트 삭제/약화 금지
5. 순삭제 50줄 제한
6. 기존 기능/핸들러 삭제 금지

> 상세 규칙 + 위반 시 행동: .sentix/rules/hard-rules.md

---

## 에이전트 파일 범위 (요약)

| 에이전트 | 쓰기 | 금지 |
|---------|------|------|
| dev / dev-fix | `app/**`, `lib/**`, `__tests__/**` | `.github/**`, `CLAUDE.md` |
| planner / security | 없음 | 코드 수정 일체 |
| Governor | `tasks/governor-state.json` | 코드 직접 수정 |

> 전체 범위 매트릭스: docs/agent-scopes.md

---

## severity 분기

critical → dev-fix 3회 → 에스컬레이션 / warning → 10회 / suggestion → 로깅만

> 상세 분기 로직: docs/severity.md
> 아키텍처 다이어그램: docs/architecture.md

---

## 학습 파일

```
tasks/
├── lessons.md          ← 실패 패턴
├── patterns.md         ← 사용자 행동 패턴
├── predictions.md      ← 활성 예측
├── pattern-log.jsonl   ← 원시 이벤트 로그
├── agent-metrics.jsonl ← 에이전트 실행 기록
├── governor-state.json ← Governor 현재 상태
├── security-report.md  ← 최신 보안 스캔 결과
├── roadmap.md          ← 고도화 계획
└── tickets/            ← planner 생성 티켓
```

---

## 환경 프로필

```
env-profiles/active.toml → devops 실행 방식 결정
  ssm → AWS SSM / ssh → SSH / manual → 스크립트 생성 / local → Docker
```

## 멀티 프로젝트

```
허용: ../[프로젝트]/INTERFACE.md, README.md
조건부: ../[프로젝트]/src/** (스키마 연동 시만)
금지: 다른 프로젝트 파일 수정
```

## config

```
.sentix/config.toml — Layer 활성화
.sentix/providers/ — AI 어댑터 (claude, openai, ollama)
.sentix/rules/hard-rules.md — 불변 규칙
```

## 프레임워크 업데이트

```
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash
```
