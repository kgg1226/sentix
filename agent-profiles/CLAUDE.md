# agent-profiles/ — 에이전트 실행 프로필

## TOML 포맷

```toml
[agent-name]
program = "claude"          # claude | openai | ollama
auto_accept = true          # 자동 승인 여부
max_parallel = 4            # 병렬 실행 수 (dev만)
defer_to = "scripts/..."    # 외부 스크립트 위임 (devops)
fallback = "generate-only"  # 위임 실패 시 폴백
auto_execute_next = false   # 다음 사이클 자동 실행 (roadmap)
```

## 정의된 에이전트

dev, dev-fix, pr-review, security, devops, planner, roadmap, pattern-engine

## 프로필 적용

`default.toml`이 기본. 프로젝트별 오버라이드는 `active.toml` 생성.
