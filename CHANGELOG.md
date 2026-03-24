# Sentix Workflow — 변경 내역

## 변경 파일 목록

```
AGENTS.md                        ← v3: Sentix 브랜딩 + 자율 실행 원칙
DESIGN.md                        ← 신규: 핵심 설계 원칙 (인간 개입 최소화)
README.md                        ← 신규: 오픈소스 프로젝트 랜딩
deploy.yml                       ← 환경 프로필 기반 재구성
security-scan.yml                ← severity 기반 분기 추가
scripts/deploy.sh                ← 범용 배포 스크립트
env-profiles/
├── template.toml                ← 빈 템플릿 (주석 가이드)
├── triplecomma-ec2.toml         ← VPN 내부, manual 모드 예시
├── open-cloud.toml              ← 오픈 EC2, ssm 모드 예시
├── nas-onprem.toml              ← NAS, ssh 모드 예시
└── local-dev.toml               ← 로컬 Docker 예시
agent-profiles/
└── default.toml                 ← 신규: 에이전트별 프로그램/설정
```

---

## 1. AGENTS.md — 주요 변경

### 추가된 개념

**dev-swarm (병렬 개발)**
- planner가 COMPLEXITY: high 티켓 생성 시 → dev-lead가 서브태스크 분할 → 병렬 실행
- ClawTeam에서 가져온 패턴: worktree 격리 + 의존성 체인 + leader 조율
- 기존 dev 에이전트(단독 모드)는 low/medium에서 그대로 동작
- 최대 4개 병렬 (토큰 비용 대비 효율 한계)

**DEPLOY_FLAG**
- planner가 티켓에 DEPLOY_FLAG: true/false를 명시
- pr-review가 diff 기반으로 NEEDS_DEPLOY를 재검증
- 둘 다 false면 devops 건너뜀 → security 직행
- UI 변경, 테스트 추가, 문서 수정 등에서 불필요한 배포를 제거

**환경 프로필 어댑터**
- devops가 env-profiles/active.toml을 읽고 access.method에 따라 행동 변경
- manual 모드: 스크립트 생성 + [STATUS] MANUAL_PENDING
- ssm/ssh 모드: 자동 실행
- local 모드: 로컬 Docker 직접 실행

**에이전트 간 메시징**
- tasks/messages/ 디렉토리로 비동기 질의 허용
- blocking/informational 구분
- 파이프라인 순서를 건너뛰는 용도로는 금지
- 주 용도: dev-worker 간 의존성 질문, dev→security 사전 확인

**severity 기반 재시도 분기**
- critical: 3회 재시도 후 즉시 roadmap 에스컬레이션
- warning: 기존 10회 유지
- suggestion: 로깅만, dev-fix 미실행
- 동일 패턴 3회 반복 → 구조적 개선 항목으로 승격

### 변경 없음 (유지)

- 에이전트별 파일 범위 제한 (dev가 docker/** 못 건드림)
- prisma/schema.prisma planner 경유 필수
- 멀티 프로젝트 참조 규칙
- registry.md 기반 cascade

---

## 2. deploy.yml — 주요 변경

### Before (v1)
- push to master → 무조건 SSM 배포 → 헬스체크 → security dispatch
- SSM 하드코딩 (instance-id, region 직접 기입)
- VPN 환경에서는 CI 자체가 무용지물

### After (v2)
- `check-deploy` job 추가: DEPLOY_FLAG + diff 기반으로 배포 필요 여부 판단
- `deploy` job: env-profiles/active.toml의 access.method에 따라 분기
  - ssm/ssh → scripts/deploy.sh 자동 실행
  - manual → scripts/deploy.sh --generate-only → tasks/deploy-output.md 생성
- `skip-deploy` job: DEPLOY_FLAG false면 security 직행
- `cascade` job: 기존 동일 (INTERFACE.md 변경 시 연동 프로젝트 dispatch)

### 호환성
- 기존 SSM 환경에서는 프로필만 ssm으로 설정하면 동일 동작
- scripts/deploy.sh가 없어도 deploy.yml 자체는 실패하지 않음 (generate-only 폴백)

---

## 3. security-scan.yml — 주요 변경

- severity 필드를 dispatch payload에 추가 (critical/warning 구분)
- FAILED → severity: critical, NEEDS_FIX → severity: warning
- [suggestion] 항목 추가 (PASSED일 때도 개선 제안 기록)
- deploy_skipped 여부를 리포트에 기록
- 시크릿 감지 패턴 확장 (AWS_SECRET_ACCESS_KEY, PRIVATE_KEY 추가)
- .env 파일도 스캔 대상에 포함

---

## 4. scripts/deploy.sh — 신규

- env-profiles/*.toml을 읽고 환경에 맞는 배포 커맨드를 생성/실행
- 4가지 모드: ssm, ssh, manual, local
- --dry-run: 커맨드만 출력 (실행 안 함)
- --generate-only: tasks/deploy-output.md에 스크립트 기록
- --profile <name>: 특정 프로필 지정
- 순수 bash (외부 의존성 없음, toml 파서 내장)

---

## 5. env-profiles/ — 신규

- template.toml: 모든 필드 주석 가이드
- triplecomma-ec2.toml: Silas 현재 환경 (method=manual, vpn_required=true)
- open-cloud.toml: CI 자동 배포 예시 (method=ssm)
- nas-onprem.toml: SSH 접근 온프레미스 예시 (method=ssh)
- local-dev.toml: 로컬 Docker 개발 예시 (method=local)

---

## 적용 순서

1. `env-profiles/` 디렉토리를 프로젝트 루트에 복사
2. `scripts/deploy.sh`를 프로젝트에 추가 + `chmod +x`
3. 현재 환경에 맞는 프로필을 `active.toml`로 심볼릭 링크
4. `AGENTS.md` 교체
5. `.github/workflows/deploy.yml` 교체
6. `.github/workflows/security-scan.yml` 교체
7. `tasks/messages/` 디렉토리 생성 (`.gitkeep`)

```bash
# 예시
cp -r env-profiles/ ./env-profiles/
cp scripts/deploy.sh ./scripts/deploy.sh
chmod +x ./scripts/deploy.sh
cd env-profiles && ln -sf triplecomma-ec2.toml active.toml && cd ..
mkdir -p tasks/messages && touch tasks/messages/.gitkeep
```
