# registry.md — 연동 프로젝트 목록

> Governor와 deploy.yml cascade job이 이 파일을 참조한다.
> planner 소환 시 이 파일이 컨텍스트로 주입된다.

---

## 참조 규칙

```
언제든 허용 (읽기 전용):
  ../[프로젝트]/INTERFACE.md
  ../[프로젝트]/README.md

조건부 허용 (아래 테이블의 참조 조건 충족 시):
  ../[프로젝트]/src/**

절대 금지:
  다른 프로젝트 파일 수정
  다른 프로젝트 전체 디렉토리 스캔
```

## 연동 프로젝트

| 프로젝트 | 경로 | 참조 조건 |
|---|---|---|
| asset-manager | ../asset-manager | 자산 데이터 스키마 연동 시 |
| isms-agent | ../isms-agent | 보안 정책 참조 시 |

> 상세 참조 조건은 각 프로젝트의 `INTERFACE.md` changelog 섹션 확인
