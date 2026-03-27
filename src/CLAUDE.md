# src/ — Sentix Core

ESM 모듈 (`"type": "module"`). 외부 의존성 제로 — Node.js 내장 모듈만 사용.

## 로딩 순서

```
bin/sentix.js
  → src/commands/*.js   (내장 명령어)
  → src/plugins/*.js    (내장 플러그인)
  → .sentix/plugins/*.js (프로젝트 로컬 플러그인)
```

## 핵심 모듈

| 파일 | 역할 |
|------|------|
| `registry.js` | 명령어/훅 등록 (`registerCommand`, `registerHook`) |
| `context.js` | 명령어에 주입되는 `ctx` 객체 (fs 헬퍼, 로깅) |
| `version.js` | `package.json`에서 버전 읽기 |
| `dev-server.js` | 개발용 HTTP API 서버 (`:4400`) |

## 새 모듈 추가 시

- `commands/` 또는 `plugins/` 에 `.js` 파일을 넣으면 자동 로드
- `registerCommand()` 또는 `registerHook()`으로 등록
