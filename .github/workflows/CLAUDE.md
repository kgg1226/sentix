# .github/workflows/ — CI/CD 워크플로우

## 공급망 보안 정책

- 모든 GitHub Action은 **커밋 SHA로 고정** (태그 오염 공격 방어)
- 외부 바이너리(Trivy 등)는 **SHA-256 체크섬 검증** 필수
- `${{ }}` 표현식은 `env:` 블록으로 분리 (expression injection 방어)

## 워크플로우 목록

| 파일 | 트리거 | 역할 |
|------|--------|------|
| `deploy.yml` | push to main, repository_dispatch | 배포 판단 + 실행 + cascade |
| `security-scan.yml` | repository_dispatch, workflow_dispatch | npm audit + Trivy 3종 스캔 + severity 분기 |
| `sync-framework.yml` | push to main (framework files), workflow_dispatch | 하위 프로젝트에 프레임워크 파일 자동 PR |

## 동기화 대상 (sync-framework)

동기화 됨: `deploy.yml`, `security-scan.yml`, `.sentix/rules/hard-rules.md`, `FRAMEWORK.md`, `docs/*.md`
동기화 제외: `CLAUDE.md`, `.sentix/config.toml`, `providers/`, `env-profiles/`, `tasks/`
