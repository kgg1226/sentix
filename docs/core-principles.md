# Sentix × Claude 핵심 원리 요약 (Core Principles Digest)

> **출처**: Anthropic Claude Mastery Playbook (Claude Academy 17강 요약, Donghee Kim, Apr 2026)
> **용도**: Sentix 프로젝트에 Claude/Claude Code/Claude API/MCP/Agent Skills 도입 시 참조할
> **의사결정 원칙 모음**. 기술 변화와 무관하게 유효한 기본기만 압축.
>
> 이 문서는 Sentix 레포의 단일 출처(single source of truth)다. 이전에는 외부 세션 파일에만
> 존재했지만, feat-011 로 레포에 이관하여 어떤 환경에서도 동일한 원칙을 참조할 수 있도록 했다.

---

## 1. 멘탈 모델: Claude는 '도구'가 아니라 '사고 파트너(Thought Partner)'

- **Constitutional AI**: Helpful / Harmless / Honest 3원칙으로 훈련됨. 예측 가능성과 신뢰성이 핵심 자산.
- **Thought Partner**: 단순 Q&A가 아니라 전략적 분석, 코딩, 문제 해결의 **능동적 협력자**.
- **대체가 아닌 증폭(Augmentation)**: AI는 사용자의 도메인 전문성·맥락·판단력을 **증폭**하는 존재이지, 대체자가 아님.
- **마스터 멘탈 모델**: *"AI의 유창함에 속지 말고, 4가지 본질(예측·지식·기억·조종성)을 이해하여 **조정된 신뢰(Calibrated Trust)** 를 구축할 것."*

---

## 2. 4D 협업 프레임워크 (기술 변화에도 불변하는 기본기)

| 역량 | 핵심 질문 | Sentix 적용 예시 |
|---|---|---|
| **Delegation (위임)** | 인간이 해야 할 일 vs AI에게 맡길 일? | 핵심 비즈니스 판단은 사람, 반복·탐색·초안은 AI |
| **Description (설명)** | 맥락·형식·페르소나를 얼마나 명확히 전달했는가? | 시스템 프롬프트 + 3P(Product/Process/Performance) 구조화 |
| **Discernment (분별)** | 결과의 사실·논리·편향을 비판적으로 평가했는가? | 배포 전 Human-in-the-loop 리뷰 필수 |
| **Diligence (성실)** | 데이터 보안·투명성·최종 책임은? | PII 제거, 사용 사실 공개, 최종 책임은 사람 |

### 2개의 핵심 루프

- **Delegation ↔ Diligence 루프 (전략적/거시적)**: "이 업무에 AI를 써도 되는가?" → "쓴다면 어떤 책임을 져야 하는가?"
- **Description ↔ Discernment 루프 (전술적/미시적)**: "더 잘 설명한다" ↔ "결과를 더 날카롭게 평가한다"의 반복.

---

## 3. Agentic Loop: AI 에이전트의 심장부

```
Gather Context  →  Take Action  →  Verify Results  →  (반복)
(컨텍스트 수집)    (파일 수정/명령 실행)   (결과 검증)
```

- 전체 코드를 싹 로드하지 않는다. **전략적으로 필요한 정보만** 탐색한다.
- 행동 전후에 **환경 검사(Environment Inspection)** 를 강제해야 맹목적 오작동을 막을 수 있음.
  - 파일 수정 전 `Read`, UI 조작 후 스크린샷 확인 같은 피드백 루프를 시스템 프롬프트에 명시적으로 박아둘 것.

### 4단계 실무 워크플로우 (Explore → Plan → Code → Commit)

1. **Explore**: 프로젝트 구조·스타일부터 이해시킨다. (탐색은 서브에이전트 위임 권장)
2. **Plan**: `Shift+Tab` → 플랜 모드. 코드 작성 전에 **계획을 검토·교정**. ← 가장 중요한 단계.
3. **Code**: 승인된 계획으로 자율 실행. **명확한 성공 기준(Success criteria)** 제시.
4. **Commit**: `code-reviewer` 서브에이전트로 편향 없는 리뷰 후 PR까지.

---

## 4. 컨텍스트 윈도우 관리 (가장 흔한 실패 지점)

- 컨텍스트는 **작업 기억**이다. 꽉 차면 성능이 절벽처럼 무너진다 (*Lost in the middle*).
- **무자비하게 선별(Curate ruthlessly)** 하라. "많을수록 좋다"는 착각.
- 핵심 지시사항·제약은 프롬프트 **최상단과 최하단에 중복 배치**.

### 명령어 / 기법

| 상황 | 명령어/기법 |
|---|---|
| 현재 사용량 확인 | `/context` |
| 긴 세션 요약 압축 | `/compact` |
| 완전 리셋 | `/clear` (작업 전환 시) |
| 특정 파일만 주입 | `@파일명` 멘션 |
| 긴 문서 처리 | 논리 단위로 청크 분할, 세션 분리 |

### 안티 패턴

- 모호한 프롬프트 → 불필요한 탐색으로 컨텍스트 낭비 (해결: 구체적 프롬프트가 오히려 절약).
- 전 파일 일괄 로드 → 비용·성능 저하.
- 무관한 MCP 서버 상시 활성화 → 도구 정의가 10% 넘으면 도구 검색 모드 불안정화. `/mcp`로 즉시 끄기.
- `CLAUDE.md` 비대화 → 매 세션마다 낭비. 자주 실수하는 부분만 선별 기록, 큰 문서는 `@README.md`처럼 참조.

---

## 5. 프롬프트 엔지니어링: 3P + 6대 기법

### 3P (설명의 3차원)

- **Product (산출물)**: 형식, 대상 독자, 톤앤매너.
- **Process (과정)**: 취해야 할 접근 방식, 분석 단계.
- **Performance (수행)**: AI의 태도·페르소나 (예: *"내 가설에 비판적으로 도전해줘"*).

### 6대 프롬프트 기법

1. **맥락 제공 (Give Context)**: 내가 누구·왜·어디 쓰는지.
2. **예시 활용 (Few-shot)**: 원하는 출력 포맷을 예시로.
3. **제약 조건 (Specify Constraints)**: 길이·제외어·포맷(JSON/MD).
4. **단계 분해 (CoT)**: 순서 나열로 논리 오류 방지.
5. **먼저 생각하게 (Ask to Think First)**: 답변 전 사고 공간 부여.
6. **역할 부여 (Define Role)**: *"10년 차 UX 전문가로서..."*.

### 작성 공식

- **일반**: `[상황 설정] → [과제 정의] → [규칙 명시]`
- **Cowork 스타일**: `[Input] + [Transformation] + [Output]`
  - Input: 소스 자료 위치
  - Transformation: 수행할 구체적 작업
  - Output: 최종 포맷 및 저장 위치

### 구조화 출력 테크닉

- **XML 태그**: `<sales_records>` 등으로 데이터/지시 경계 명확화.
- **Prefilling**: Assistant 메시지를 `` ```json `` 으로 미리 채워 서론(preamble) 제거.
- **Stop Sequences**: `` ``` `` 등에서 즉시 중단, 맺음말 원천 차단.
- **Multi-shot**: `<sample_input>` / `<ideal_output>` 쌍으로 엣지 케이스 학습.

### 온도(Temperature) 전략

- 사실·데이터 추출·코드: **0.0–0.3** (결정론적)
- 일반 대화·요약: **0.5–0.7**
- 브레인스토밍·창작: **0.8–1.0**
- 기본값 방치는 환각·경직의 주범.

---

## 6. Tool Use & MCP (Model Context Protocol)

### Tool Use 4단계 루프

1. 도구 스키마(JSON)로 이름·설명·파라미터 정의.
2. Claude가 `stop_reason: "tool_use"` 로 호출 요청 반환.
3. 로컬에서 실행, `tool_use_id` 일치시킨 `tool_result` 블록으로 회신.
4. 최종 답변 생성. **전체 `response.content` 를 히스토리에 저장** (텍스트만 추출 금지).

### MCP 3대 Primitives

| 구분 | 제어 주체 | 용도 |
|---|---|---|
| **Tools** | 모델 (Claude) | 자율적으로 판단해 호출할 실행 기능 (파일 수정, API 호출) |
| **Resources** | 애플리케이션 | 서버 데이터를 프롬프트에 **주입**하는 읽기 전용 통로 |
| **Prompts** | 사용자 | 슬래시 커맨드 등으로 호출하는 고품질 템플릿 |

### 실무 체크리스트

- **수동 JSON 스키마 지양**: Python SDK의 `@mcp.tool` + `pydantic.Field(description=...)` 로 자동 생성.
- **MIME 타입 처리**: `application/json` 이면 파싱, `text/plain` 이면 텍스트 분기.
- **전송 방식**: 로컬은 STDIO (절대 `print()` 금지, stdout이 통신 채널), 원격은 StreamableHTTP + SSE.
- **퍼블릭 서버**: LLM API 키를 서버가 쥐면 비용 폭탄 → **Sampling** 으로 클라이언트에 위임.
- **Roots (파일 탐색 경계)**: SDK가 자동 차단해 주지 않는다. `is_path_allowed()` 직접 구현 필수.
- **Stateless mode 트레이드오프**: 로드밸런서 뒤에서 필요하지만 Sampling·Progress·Subscription 기능 상실.

---

## 7. Workflows vs Agents: 아키텍처 선택

> 프로덕션 사용자는 *멋진 에이전트*가 아니라 *일관되게 작동하는 제품*을 원한다.

### 신뢰성 우선 — Workflows (기본값)

- **Chaining**: 제약 많은 작업을 순차 분해.
- **Parallelization**: 독립적 하위 작업 병렬 실행 후 병합.
- **Routing**: 입력을 먼저 분류 → 특화 파이프라인으로.
- **Evaluator-Optimizer**: Producer ↔ Grader 피드백 루프.

### 유연성 필요 — Agents (제한적 도입)

- 해결 경로를 모델이 스스로 판단. 예측 불가능·다변수 문제 전용.
- 성공률과 디버깅 난이도 감수. **고위험·경제적 손실 가능 영역에는 단독 투입 금지**.

### 고가치/저오류 영역이 최적

- 코딩 리팩토링, 반복 디버깅, 환경 설정 같은 *"가치 높고 오류 비용 낮은"* 영역에 우선 배치.

---

## 8. RAG 파이프라인 (대규모 문서 처리)

### 필수 구성

1. **Chunking**: 마크다운→헤더 기반, 일반 텍스트→문장 기반. **오버랩 필수** (문맥 유실 방지).
2. **Embedding**: 벡터화 + 정규화. **원본 텍스트를 함께 저장** (검색 후 주입 필요).
3. **Hybrid Search**: 의미론적(Vector) + 어휘론적(BM25) 병렬 실행.
4. **RRF (Reciprocal Rank Fusion)**: 서로 다른 스코어 체계 결과를 순위 기반 병합.
5. **LLM Re-ranking**: 상위 결과를 Claude에 통과시켜 재정렬. **문서 ID만 반환**하도록 해 토큰 절약.
6. **Contextual Retrieval**: 청킹 전 각 청크에 문서 전체 맥락 요약을 덧붙여 임베딩.

---

## 9. Claude Code 운영 필수 기능

### CLAUDE.md 3-레벨

| 레벨 | 경로 | 용도 |
|---|---|---|
| 프로젝트 | `CLAUDE.md` | Git 커밋, 팀 공유 |
| 로컬 | `CLAUDE.local.md` | 개인 설정 |
| 글로벌 | `~/.claude/CLAUDE.md` | 모든 프로젝트 공통 |

**원칙**: 처음엔 없이 시작. Claude가 자주 틀리는 부분만 선별 기록.

### Subagents (병렬·격리 컨텍스트)

- **언제 쓰나**: 조사·탐색, 객관적 코드 리뷰, 특수 톤 카피라이팅.
- **언제 쓰지 마라**: 순차적 다단계 파이프라인(컨텍스트 유실), 테스트 실행기(로그 필요).
- **설정 원칙**:
  - *Description* 에 `proactively` 포함 + 구체적 트리거 문구.
  - **출력 형식 강제** (목차 고정으로 명확한 정지 지점).
  - **장애물 보고 요구** (메인 스레드 중복 분석 방지).
  - **도구 권한 최소화** (Principle of Least Privilege):
    - 조사: Read, Glob, Grep
    - 리뷰: + Bash (git diff 등 읽기용)
    - 수정: + Edit, Write

### Agent Skills (온디맨드 전문 지식)

- **언제 로드되나**: 사용자 요청이 `description` 과 시맨틱 매칭될 때만.
- **우선순위**: Enterprise > Personal > Project > Plugins.
- **점진적 공개**: `SKILL.md` 는 500줄 이하. 상세 내용은 `/references`, `/scripts`, `/assets` 로 분리.
- **Frontmatter 핵심**:
  ```yaml
  ---
  name: codebase-onboarding
  description: "..."  # 트리거 문구 다양하게
  allowed-tools: Read, Grep, Glob  # 최소 권한
  model: sonnet
  ---
  ```
- **안티 패턴**:
  - *전문가라고 주장만* ("너는 파이썬 전문가야") — Claude는 이미 안다, 구체적 지침이 없으면 무의미.
  - 모든 지식의 스킬화 — CLAUDE.md·Hooks·Subagents와 목적 분리.

### Hooks (결정론적 가드레일)

- **PreToolUse**: `rm -rf`, 프로덕션 DB 수정, `.env` 접근을 Exit Code 2로 원천 차단 + stderr 피드백.
- **PostToolUse**: 파일 수정 후 `tsc --noEmit`, Prettier 자동 실행으로 오류 즉시 재수정 유도.
- **경로 문제**: 절대 경로 권장되지만 팀 공유가 어려움 → `$PWD` 셋업 스크립트 활용.

---

## 10. 프롬프트 캐싱 & 비용 최적화

- **최소 1024 토큰 이상**일 때 유효, 기본 5분 유지 (Anthropic 기본, Bedrock 5분, 일부 환경 1시간).
- 시스템 프롬프트·도구 스키마 **마지막 항목**에 `{"cache_control": {"type": "ephemeral"}}` 추가.
- **중단점 이전 내용이 한 글자라도 바뀌면 무효화** → 정적 컨텍스트를 앞에, 동적 내용을 뒤에 배치.

---

## 11. 생성형 AI의 4대 기계 속성 (조정된 신뢰의 토대)

| 속성 | 강점 | 한계 | Sentix 대응 |
|---|---|---|---|
| **Next Token Prediction** | 유창함, 요약·설명 | 구체성(이름·날짜·인용·통계)에서 환각 | 정밀 주장은 **1순위 검증** 대상 |
| **Knowledge** | 광범위한 학습 데이터 | Cutoff 이후·희귀·지역 주제 취약 | RAG / 웹 검색 / 문서 직접 주입 |
| **Working Memory** | 고정 크기 윈도우 | 한계 초과 시 **절벽** (*Lost in the middle*) | 중요 지시는 상단+하단 중복, 청크 분할 |
| **Steerability** | 지시 추종 | 단어 ≠ 의도 (문자 그대로만 해석) | **Format + Goal 동시 제시**, 목표를 재설명 |

### 충돌 진단 (대부분의 실패는 단일 속성이 아닌 **2속성 충돌**)

- **환각 인용** = Next Token × Knowledge 한계 → 독립 검증 / 소스 그라운딩.
- **긴 대화 표류** = Working Memory × Steerability → 핵심 컨텍스트 재공급 또는 새 세션.

---

## 12. 치명적 안티 패턴 체크리스트 (Sentix에서 절대 금지)

- [ ] **Silver Bullet 환상**: AI가 모든 걸 푼다는 가정 → 도메인 전문성 없이 위임 금지.
- [ ] **신뢰의 양극화**: 전면 신뢰 OR 전면 불신 → 작업별 **조정된 신뢰** 수준을 설정.
- [ ] **무비판적 수용**: 매끄러운 산문 ≠ 사실. "온전히 설명·책임질 수 있는가?"를 자문.
- [ ] **모호한 프롬프트**: "이거 고쳐줘" → 컨텍스트 낭비. 구체적으로 쓸수록 절약됨.
- [ ] **무분별한 자동 승인**: `PreToolUse` 훅 없는 전면 허용은 재앙.
- [ ] **단일 거대 프롬프트**: 제약 10개를 한 방에 몰아넣으면 누락 발생 → Chaining/Routing.
- [ ] **에이전트 환경 검사 누락**: 행동 전후 상태 확인을 강제하지 않으면 맹인 상태로 작업.
- [ ] **사용자 메시지에 시스템 지시 혼재**: 영구 제약은 System Prompt로.
- [ ] **책임의 외주화**: 최종 책임은 **언제나** 사람.
- [ ] **목소리 높이기**: 같은 지시를 강조만 반복하지 말고 *목표(Goal)* 를 다시 설명.
- [ ] **PII 미제거**: 개인정보는 AI 업로드 전 익명화. ZDR(Zero Data Retention) 플랜 검증.

---

## 13. Sentix 도입 단계별 체크리스트 (권장 순서)

1. **스코프 정의**: 어떤 업무가 High-value × Low-error-cost인가? 거기부터 시작.
2. **CLAUDE.md 초안**: 기술 스택·실행 명령어·코드 스타일만 간결히.
3. **프롬프트 3P 템플릿화**: Product/Process/Performance 슬롯 고정.
4. **평가 파이프라인 구축**: 엣지 케이스 데이터셋 + Code Grader + Model Grader. *측정할 수 없으면 개선할 수 없다.*
5. **Workflow 우선**: Chaining → Routing → Parallelization 패턴으로 안정화.
6. **MCP 서버 최소 1개**: 가장 반복적인 외부 도구를 서버화 (Tools/Resources/Prompts 분리 설계).
7. **Hooks로 가드레일**: PreToolUse (위험 차단), PostToolUse (품질 강제).
8. **Subagents로 역할 분리**: 탐색·리뷰는 격리 컨텍스트로.
9. **Skills로 조직 자산화**: 반복되는 지시는 즉시 SKILL.md로 승격.
10. **Agents는 마지막**: Workflow로 해결 안 되는 진짜 동적 영역에만.

---

## 14. 마스터 요약 한 줄

> **Claude는 너를 대체하지 않는다. Claude는 너의 전문성과 결합해 최상의 결과를 내는 지능적 협력자이며, 성공적 협업의 열쇠는 기술이 아니라 명확한 Description과 비판적 Discernment에 있다.**

---

*이 문서는 Sentix 프로젝트에서 Claude 및 Claude 기반 에이전트(Code/Cowork/API/MCP/Skills)를
도입할 때 의사결정·리뷰·온보딩 기준으로 활용하기 위한 압축본임.*
