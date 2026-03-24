# Anthropic Academy 5개 코스가 자율 에이전트 파이프라인을 만들기까지

> AI를 잘 쓰는 법을 배웠더니, AI가 스스로 일하는 시스템을 만들고 있었다.

---

## 시작: "AI를 잘 쓰고 싶었다"

Anthropic Academy 코스를 수강한 이유는 단순했다. Claude를 더 잘 쓰고 싶었다. 프롬프트를 더 정교하게, 결과물을 더 정확하게, 워크플로우를 더 효율적으로.

하지만 5개 코스를 마치고 나니 방향이 완전히 바뀌어 있었다.

"AI를 잘 쓰는 법"이 아니라 **"AI가 스스로 잘 일하는 시스템을 어떻게 설계하는가"**를 고민하게 되었다. 그리고 그 고민이 **Sentix**라는 자율 멀티에이전트 DevSecOps 파이프라인으로 구체화되었다.

---

## 1단계: 판단 기준을 세우다 — AI Fluency (Students)

이 코스에서 가장 먼저 배운 건 기술이 아니라 **기준**이었다.

```
이건 AI에게 맡겨도 되는가?
이건 내가 직접 해야 하는가?
```

4D Framework — Delegation, Description, Discernment, Diligence.

처음엔 이걸 **내가** 수행하는 프레임워크로 이해했다. "내가 위임하고, 내가 설명하고, 내가 검증하고, 내가 관리한다."

그런데 곧 질문이 바뀌었다.

> **이 4D를 시스템이 대신 수행할 수 있다면?**

만약 Delegation을 자동화할 수 있다면 — 요청이 들어왔을 때 복잡도를 분석해서 어떤 에이전트에게 맡길지 자동으로 결정하는 것. Description을 구조화할 수 있다면 — 에이전트 간 컨텍스트를 사람이 정리할 필요 없이 필요한 정보만 자동으로 추출해서 전달하는 것.

이 생각이 Sentix의 **planner 에이전트**와 **구조화된 핸드오프**로 이어졌다.

```
planner의 역할 = Delegation의 자동화
  → 요청을 분석해서 COMPLEXITY, DEPLOY_FLAG, SECURITY_FLAG를 판단
  → "이건 단독 dev에게", "이건 4명 병렬 dev-swarm에게" 자동 분기
```

**AI Fluency가 가르친 것:** 판단 기준.
**Sentix가 한 것:** 그 판단 기준을 코드로 만들었다.

---

## 2단계: 통제를 설계하다 — AI Fluency (Educators)

Educators 코스에서 결정적인 관점 변화가 있었다.

> **Automation이 아니라 Augmentation.**

많은 사람들이 AI를 자동화 도구로 쓴다. 빠르지만 남는 게 없다. 이 코스는 명확히 선을 긋는다 — AI는 일을 대신하는 게 아니라 인간의 사고를 확장하는 도구라고.

이건 맞다. 하지만 나는 한 발 더 갔다.

> **자동화해도 되는 것과, 인간의 판단이 필수인 것을 구분한 뒤,
> 자동화해도 되는 영역은 완전히 자동화한다.**

Sentix에서 인간의 개입 지점은 정확히 **세 곳**이다:

```
1. 요청 입력          — 파이프라인의 시작
2. critical 보안 판단  — dev-fix 3회 실패 후 에스컬레이션
3. manual 배포 확인    — VPN 등 자동화 불가 환경에서만
```

그 외의 모든 것 — 티켓 생성, 코드 구현, 리뷰, 테스트, 배포, 보안 스캔, 고도화 계획 — 은 에이전트가 자율적으로 수행한다. "인간에게 묻지 않는다. 조건에 매칭되면 실행한다."

이게 가능한 이유는 Educators 코스에서 강조한 **Description ↔ Discernment 루프** 덕분이다:

```
설명한다 (Description) → 결과를 평가한다 (Discernment) → 다시 수정한다
```

Sentix에서 이 루프는 이렇게 구현되어 있다:

```
dev가 구현한다 → pr-review가 검증한다 → 실패 시 dev-fix가 수정한다 → 다시 검증한다
```

차이점은 **이 루프에 인간이 없다는 것**이다. pr-review의 4단계 회귀 검증(기존 테스트 회귀, export 보존, 삭제량 제한, Scope 확인)이 인간 리뷰어를 대체한다.

**Educators 코스가 가르친 것:** AI를 통제하는 프레임워크.
**Sentix가 한 것:** 통제 자체를 에이전트화했다.

---

## 3단계: 연결을 표준화하다 — MCP

MCP 코스를 듣기 전에 이미 에이전트 간 연결 문제에 부딪혀 있었다.

dev 에이전트의 출력을 pr-review에 어떻게 넘기지? security 스캔 결과를 dev-fix에 어떤 형식으로 전달하지? 배포 환경이 바뀌면 devops 에이전트의 로직을 매번 수정해야 하나?

MCP가 제시한 답은 명쾌했다.

> **누가 무엇을 제어하는지를 분리한다.**
> Tools (모델 제어), Resources (애플리케이션 제어), Prompts (사용자 제어).

이 원칙을 Sentix의 아키텍처에 적용하니 **환경 프로필** 개념이 나왔다.

```
env-profiles/active.toml 하나로 배포 전략이 결정된다:

access.method = "ssm"     → AWS SSM 자동 실행
access.method = "ssh"     → SSH 자동 실행
access.method = "manual"  → 스크립트 생성 (VPN 환경)
access.method = "local"   → 로컬 Docker 직접 실행
```

devops 에이전트는 "어떻게 배포하는가"를 모른다. 프로필이 알려주고, `scripts/deploy.sh`가 실행한다. MCP가 "Claude가 직접 API를 호출하지 않는다"고 한 것처럼, Sentix의 devops도 직접 배포하지 않는다. **환경 어댑터에 위임한다.**

같은 원칙이 에이전트 프로필에도 적용되었다:

```
agent-profiles/default.toml

[dev]
program = "claude"
auto_accept = true
max_parallel = 4
```

에이전트가 "어떤 AI를 쓰는지"를 모른다. 프로필이 알려준다. Claude를 Codex로 바꾸고 싶으면 코드를 수정하는 게 아니라 TOML 한 줄을 바꾼다.

**MCP 코스가 가르친 것:** 시스템 연결의 표준화.
**Sentix가 한 것:** 에이전트-환경-도구를 전부 프로필 기반으로 분리했다.

---

## 4단계: 에이전트에게 "일"을 맡기다 — Cowork

Cowork 코스에서 가장 인상 깊었던 건 **Plan → Execute → Connect** 구조였다.

```
기존 Chat: 질문 → 답변 → 사람이 마무리
Cowork:    작업 정의 → 계획 확인 → 실행 → 결과 생성
```

"텍스트가 아니라 완성된 결과물(파일)을 받는 구조."

이 문장을 읽었을 때 Sentix의 전체 파이프라인이 눈앞에 펼쳐졌다:

```
요청 입력 (작업 정의)
  → planner가 티켓 생성 (계획)
  → dev가 코드 작성 (실행)
  → devops가 배포 (Connect — 실제 환경에 결과물 전달)
  → security가 검증 (품질 보증)
  → roadmap이 다음 계획 제시 (다음 사이클 준비)
```

Cowork가 "하나의 에이전트가 계획하고 실행하고 연결한다"라면, Sentix는 **각 단계를 전문 에이전트로 분리해서 파이프라인으로 엮은 것**이다.

그리고 Cowork의 핵심 특징 — "진행 상황을 투명하게 공유한다" — 이 대시보드 설계의 근거가 되었다. Sentix의 대시보드는 **제어판이 아니라 관측소**다. 인간이 에이전트를 조종하는 곳이 아니라, 파이프라인이 자율적으로 돌아가는 걸 실시간으로 확인하는 곳.

**Cowork이 가르친 것:** AI에게 일을 맡기는 경험.
**Sentix가 한 것:** 맡기는 행위 자체도 자동화했다.

---

## 5단계: 시스템으로 만들다 — Building with Claude

마지막 코스가 전체 그림을 완성했다.

> **LLM은 '기능'이 아니라 '아키텍처 구성요소'다.**

이 한 문장이 Sentix의 근본 설계 원칙이 되었다.

```
Claude는 상태를 기억하지 않는다.
→ 대화 히스토리는 애플리케이션이 직접 관리해야 한다.
→ 매 요청마다 전체 컨텍스트를 전달해야 한다.
```

이 제약이 있기 때문에 Sentix는 **에이전트 간 핸드오프를 구조화**했다. 이전 에이전트의 전체 출력을 그대로 넘기면 토큰이 낭비된다. 대신 코드 블록과 이슈만 추출해서 다음 에이전트에 전달한다.

그리고 "Prompt는 작성이 아니라 검증"이라는 관점. 이건 아직 Sentix에 완전히 반영되지 않았지만 방향은 잡혀 있다. 각 에이전트의 프롬프트 성능을 `agent-metrics.jsonl`로 추적하고, 데이터 기반으로 프롬프트를 개선하는 루프를 만들 계획이다. planner의 티켓이 dev에서 한 번에 통과하는 비율, pr-review의 오탐률 — 이런 지표가 쌓이면 프롬프트를 감이 아니라 수치로 튜닝할 수 있다.

**Building with Claude가 가르친 것:** AI를 서비스로 만드는 방법.
**Sentix가 한 것:** AI를 자율 파이프라인으로 만들었다.

---

## 그래서 지금 Sentix는

5개 코스의 핵심이 하나의 시스템에 층층이 쌓여 있다.

| 코스 | 핵심 개념 | Sentix 반영 |
|---|---|---|
| AI Fluency (Students) | 4D Framework — 판단 기준 | planner의 자동 위임 + 핸드오프 구조화 |
| AI Fluency (Educators) | Automation → Augmentation, 통제 | 인간 개입 3곳만 + 파괴 방지 하드 룰 |
| MCP | 표준화된 연결 | env-profiles + agent-profiles |
| Cowork | Plan → Execute → Connect | 7단계 파이프라인 + 대시보드(관측소) |
| Building with Claude | LLM은 아키텍처 구성요소 | 구조화된 핸드오프 + 프롬프트 검증 루프 |

그리고 강의에는 없지만 Sentix가 독자적으로 추가한 것:

- **lessons.md** — 실패 패턴 자동 학습
- **pattern-engine** — 사용자 행동 예측 + 선제 준비
- **visual perception** — "사용자가 보는 것"을 학습
- **severity 기반 라우팅** — critical/warning/suggestion 자동 분기
- **dev-swarm** — 복잡한 작업의 병렬 처리 + Pause/Resume

---

## 한 줄 정리

Anthropic Academy는 "AI와 어떻게 일해야 하는가"를 가르쳤고,
Sentix는 "그 방법 자체를 자동화하면 어떻게 되는가"에 대한 실험이다.

```
강의: 인간이 4D를 수행한다.
Sentix: 시스템이 4D를 수행한다.
인간은 시작(요청)과 끝(결과 확인)에만 선다.
```

*by Silas — JANUS*
