# Sentix

**AI가 알아서 코드를 짜고, 검사하고, 배포하는 자동 파이프라인.**

> 당신은 "뭐 해줘" 한 마디만 하면 됩니다. 나머지는 Sentix가 합니다.

---

## 이게 뭔가요?

프로그래밍 프로젝트에서, AI에게 일을 시킬 때 이런 과정이 필요합니다:

```
보통의 방법 (사람이 다 해야 함):
  1. 무엇을 만들지 정리한다         ← 사람
  2. 코드를 짠다                  ← AI한테 시킴
  3. 코드가 맞는지 검토한다         ← 사람
  4. 서버에 올린다                 ← 사람
  5. 보안에 문제 없는지 확인한다     ← 사람
  6. 다음에 뭘 할지 생각한다        ← 사람
```

Sentix를 쓰면:

```
Sentix 방법 (사람은 첫 줄만):
  1. "로그인에 세션 만료 추가해줘"   ← 사람 (이것만!)
  2. 무엇을 만들지 정리한다         ← planner (AI)
  3. 코드를 짠다                  ← dev (AI)
  4. 코드가 맞는지 검토한다         ← pr-review (AI)
  5. 서버에 올린다                 ← devops (자동 스크립트)
  6. 보안에 문제 없는지 확인한다     ← security (AI)
  7. 다음에 뭘 할지 제안한다        ← roadmap (AI)
  8. "완료됐습니다" 보고            ← 사람에게 결과만 전달
```

**한 줄 요약: AI 에이전트들이 따라야 할 "업무 규칙서"입니다.**

---

## 어떻게 작동하나요?

Governor라는 "총감독"이 있고, 6명의 "직원(에이전트)"이 있습니다.

```
당신: "이거 해줘"
  │
  ▼
┌──────────────────────────┐
│       총감독 (Governor)    │  ← 전체 상황을 파악하고 지시
└────────────┬─────────────┘
             │
   ┌─────────┼─────────┬──────────┬──────────┐
   ▼         ▼         ▼          ▼          ▼
 기획자    개발자    검토자     보안관     전략가
(planner)  (dev)  (pr-review) (security) (roadmap)

   각 직원은 자기 일만 하고, 결과를 총감독에게 보고합니다.
   직원끼리 직접 대화하지 않습니다.
```

실패하면? 자동으로 수정합니다 (dev-fix).
또 실패하면? 재시도합니다 (심각하면 3회, 보통이면 10회).
그래도 안 되면? 사람에게 알립니다.

---

## 설치 방법

### 필요한 것

- [Node.js](https://nodejs.org/) 18 이상
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (AI 에이전트)
- Git

### 방법 1: 명령어 한 줄 (가장 쉬움)

```bash
# 당신의 프로젝트 폴더에서:
npx sentix init
```

이것만 하면 됩니다. 필요한 파일이 자동으로 만들어집니다.

### 방법 2: 설치 스크립트

```bash
# Mac / Linux
bash install-sentix.sh /path/to/your-project

# Windows PowerShell
.\install-sentix.ps1 -Target C:\path\to\your-project
```

### 방법 3: 수동 복사

```bash
# 1. 규칙서 2개 복사
cp FRAMEWORK.md CLAUDE.md /path/to/your-project/

# 2. 설정 폴더 복사
cp -r .sentix/ /path/to/your-project/.sentix/

# 3. 학습 폴더 생성
mkdir -p /path/to/your-project/tasks/tickets
```

### 설치 확인

```bash
cd /path/to/your-project
npx sentix doctor
```

모든 항목이 ✓ 이면 성공입니다.

---

## 사용 방법

### 1단계: 요청하기

```bash
sentix run "로그인 페이지에 비밀번호 찾기 기능 추가해줘"
```

이것만 하면 AI가 알아서:
- 작업 계획을 세우고 (planner)
- 코드를 짜고 (dev)
- 코드를 검토하고 (pr-review)
- 서버에 올리고 (devops)
- 보안 검사를 하고 (security)
- 다음 할 일을 제안합니다 (roadmap)

### 2단계: 상태 확인하기

```bash
sentix status
```

현재 어떤 단계를 실행 중인지, 학습 데이터가 얼마나 쌓였는지 보여줍니다.

### 3단계: 끝

정말 이게 전부입니다.

---

## CLI 명령어 전체 목록

| 명령어 | 하는 일 |
|---|---|
| `sentix init` | 프로젝트에 Sentix 설치 (자동으로 기술 스택 감지) |
| `sentix run "요청"` | AI 파이프라인 실행 |
| `sentix status` | 현재 상태 보기 |
| `sentix doctor` | 설치가 제대로 됐는지 확인 |
| `sentix metrics` | AI 성공률/재시도 통계 보기 |
| `sentix plugin list` | 플러그인 목록 보기 |
| `sentix plugin create 이름` | 나만의 플러그인 만들기 |

각 명령어에 `--help`를 붙이면 상세 설명이 나옵니다:

```bash
sentix run --help
```

---

## 설치하면 생기는 파일들

```
내 프로젝트/
├── FRAMEWORK.md      ← 설계 문서 (사람이 읽는 전체 구조 설명)
├── CLAUDE.md         ← AI가 읽는 실행 규칙서
├── INTERFACE.md      ← 다른 프로젝트와 연결할 때 쓰는 계약서
├── registry.md       ← 연결된 프로젝트 목록
│
├── .sentix/          ← 설정 폴더
│   ├── config.toml   ← 기능 켜기/끄기 설정
│   ├── providers/    ← AI 선택 (Claude, OpenAI, Ollama)
│   └── rules/        ← 절대 어기면 안 되는 규칙 6개
│
├── tasks/            ← AI가 학습하는 폴더 (자동으로 채워짐)
│   ├── lessons.md    ← 실패에서 배운 것
│   ├── patterns.md   ← 사용자 행동 패턴
│   ├── roadmap.md    ← 앞으로 할 일 계획
│   └── tickets/      ← 작업 티켓
│
└── (기존 프로젝트 파일들은 그대로)
```

**기존 프로젝트 파일은 건드리지 않습니다.** 새 파일만 추가됩니다.

---

## AI는 어떤 걸 쓸 수 있나요?

`.sentix/providers/` 폴더에서 설정합니다:

| AI | 파일 | 특징 |
|---|---|---|
| **Claude** (기본) | `claude.toml` | 가장 정확함. Claude Code 필요 |
| **OpenAI** | `openai.toml` | GPT-4o 사용. API 키 필요 |
| **Ollama** | `ollama.toml` | 인터넷 없이 로컬에서 실행 가능 |

---

## 배포는 어떻게 하나요?

`env-profiles/` 폴더에 환경을 설정하면, AI가 알아서 배포합니다.

| 환경 | 설정값 | 설명 |
|---|---|---|
| AWS EC2 | `method = "ssm"` | AWS 명령어로 자동 배포 |
| NAS/서버 | `method = "ssh"` | SSH로 자동 배포 |
| VPN 내부 | `method = "manual"` | 스크립트만 만들어줌 (직접 실행) |
| 내 컴퓨터 | `method = "local"` | Docker로 바로 실행 |

```bash
# 환경 전환은 이것만:
cd env-profiles
ln -sf local-dev.toml active.toml   # 로컬 개발용
# ln -sf nas-onprem.toml active.toml  # NAS 배포용
```

---

## 절대 어기면 안 되는 규칙 6개

AI도 이 규칙은 무시할 수 없습니다:

| # | 규칙 | 왜? |
|---|---|---|
| 1 | 작업 전에 테스트 결과를 저장해둬야 한다 | 나중에 비교하려고 |
| 2 | 맡은 범위 밖의 파일은 건드리면 안 된다 | 다른 기능이 망가질 수 있어서 |
| 3 | 이미 있는 API를 삭제하면 안 된다 | 다른 곳에서 쓰고 있을 수 있어서 |
| 4 | 이미 있는 테스트를 삭제하면 안 된다 | 테스트가 실패하면 코드를 고쳐야지, 테스트를 지우면 안 됨 |
| 5 | 한 번에 50줄 넘게 삭제하면 안 된다 | 큰 삭제는 별도 작업으로 분리 |
| 6 | **이미 있는 기능을 삭제하면 안 된다** | 버그는 고치는 거지, 없애는 게 아님 |

---

## 학습 기능

Sentix는 사용할수록 똑똑해집니다:

| 뭘 배우나? | 어디에 저장? | 예시 |
|---|---|---|
| 실패에서 배운 것 | `tasks/lessons.md` | "이 라이브러리는 이렇게 쓰면 에러남" |
| 사용자 행동 패턴 | `tasks/patterns.md` | "매주 월요일마다 보안 스캔을 요청함" |
| 다음에 할 것 예측 | `tasks/predictions.md` | "이번에도 테스트 커버리지 올려달라고 할 것 같음" |

**"이거 기억해"라고 말할 필요 없습니다.** 자동으로 기억합니다.

---

## 여러 프로젝트를 연결하면?

프로젝트 A의 API를 바꿀 때, 프로젝트 B가 그 API를 쓰고 있으면:

```
프로젝트 A: "인증 API 바꿔줘"
  ↓
Sentix: "잠깐, 프로젝트 B가 이 API 쓰고 있네."
  ↓
Sentix: "프로젝트 B가 안 망가지게 호환되는 방식으로 바꿀게."
  ↓
배포 후: 프로젝트 B에도 자동으로 테스트 실행
```

이걸 위해 `INTERFACE.md` (API 계약서)와 `registry.md` (연결 목록)가 있습니다.

---

## 개발 서버 (개발자용)

대시보드를 만들 때 쓰는 테스트 서버입니다:

```bash
npm run dev    # http://localhost:4400 에서 실행
```

| 주소 | 내용 |
|---|---|
| `/api/status` | 전체 상태 요약 |
| `/api/governor` | 현재 실행 중인 작업 |
| `/api/lessons` | 학습한 실패 패턴 |
| `/api/patterns` | 사용자 행동 패턴 |
| `/api/metrics` | AI 성공률 통계 |
| `/health` | 서버 정상 여부 |

---

## FAQ

**Q: 기존 프로젝트에 Sentix를 설치하면 기존 코드가 바뀌나요?**
A: 아닙니다. 새 파일만 추가됩니다. 기존 코드는 그대로입니다.

**Q: Claude Code가 없으면 쓸 수 없나요?**
A: `sentix init`, `sentix doctor`, `sentix status`는 Claude Code 없이도 됩니다.
`sentix run` (실제 파이프라인 실행)만 Claude Code가 필요합니다.

**Q: 무료인가요?**
A: Sentix 자체는 무료(MIT). AI 사용 비용은 AI 제공자(Anthropic, OpenAI 등)에 따라 다릅니다.

**Q: 어떤 프로그래밍 언어를 지원하나요?**
A: 자동 감지: Node.js, Python, Go, Rust. 그 외 언어도 CLAUDE.md를 수동으로 편집하면 사용 가능합니다.

**Q: 위험하지 않나요? AI가 마음대로 코드를 바꾸면?**
A: 6개 하드 룰이 있습니다. 기존 기능 삭제 금지, 범위 밖 수정 금지, 테스트 삭제 금지 등.
이 규칙은 AI도 무시할 수 없습니다.

---

## 정리

```
1. sentix init                     ← 설치 (1분)
2. CLAUDE.md 기술 스택 확인           ← 확인 (1분)
3. sentix doctor                   ← 검증 (10초)
4. sentix run "하고 싶은 것"         ← 사용 (끝!)
```

---

## Contributing

- **env-profiles**: 새 배포 환경 추가 (AWS ECS, GCP, k8s 등)
- **providers**: 새 AI 추가 (Gemini, Mistral 등)
- **plugins**: 커스텀 플러그인 (`sentix plugin create`로 시작)

---

## License

MIT

---

*Sentix — 한 마디면 충분합니다.*
*by JANUS*
