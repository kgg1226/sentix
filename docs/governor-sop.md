# Governor SOP — 7단계 파이프라인 상세

> CLAUDE.md의 SOP 요약에서 참조되는 상세 문서.

---

## 전체 흐름

```
Step 0: CLAUDE.md(이 파일) + FRAMEWORK.md 읽기
Step 1: 요청 수신
Step 2: lessons.md + patterns.md 로드 (과거 실패/패턴 학습)
Step 3: 실행 계획 수립 (어떤 에이전트를, 어떤 순서로, 어떤 컨텍스트와 함께)
Step 4: 에이전트 순차/병렬 소환 → 결과 수거 → 판단 → 다음 결정
Step 5: 이슈 시 교차 판단 (재시도 / 에스컬레이션 / planner 재소환)
Step 6: 전체 완료 → 인간에게 최종 보고
Step 7: pattern-engine 실행 → 이번 사이클 학습 → governor-state.json 업데이트
```

---

## 실행 계획 예시

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

## 에이전트 소환 규칙

- 각 에이전트는 Governor를 통해서만 소환됨 (에이전트 간 직접 통신 없음)
- 이전 에이전트의 결과가 다음 에이전트의 컨텍스트로 주입됨
- 에이전트가 실패하면 Governor가 재시도/에스컬레이션 판단
- SECURITY_FLAG, DEPLOY_FLAG 등 티켓 플래그에 따라 단계 건너뛰기 가능
