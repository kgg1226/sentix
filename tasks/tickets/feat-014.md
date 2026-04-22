# feat-014: sentix init이 system-prompt-template 을 프로젝트에 배포하도록 확장. docs/system-prompt-temp...

- **Status:** open
- **Complexity:** high
- **Deploy flag:** true
- **Security flag:** false
- **Created:** 2026-04-22T01:51:35.023Z

## Description

sentix init이 system-prompt-template 을 프로젝트에 배포하도록 확장. docs/system-prompt-template.md 를 src/lib/init-templates.js 의 배포 목록에 추가해 신규 프로젝트가 sentix init 1회로 Claude API/Desktop Project Instructions 용 템플릿까지 얻게 한다. 이미 존재하면 보존(덮어쓰기 금지), 없으면 생성. sentix doctor 의 권장 정리 섹션에 '시스템 프롬프트 템플릿 존재' 체크 추가. SCOPE: src/lib/init-templates.js, src/commands/init.js, src/commands/doctor.js, 필요 시 __tests__/.

## Impact Analysis


Downstream projects in registry:
  - asset-manager
  - isms-agent

## Decomposition

PARALLEL_HINT (preliminary — planner will refine):

- Sub-task 1: sentix init이 system-prompt-template 을 프로젝트에 배포하도록 확장. docs/system-prompt-template.md 를 src/lib/init-templates.js 의 배포 목록에 추가해 신규 프로젝트가 sentix init 1회로 Claude API/Desktop Project Instructions 용 템플릿까지 얻게 한다. 이미 존재하면 보존(덮어쓰기 금지)
- Sub-task 2: 없으면 생성. sentix doctor 의 권장 정리 섹션에 '시스템 프롬프트 템플릿 존재' 체크 추가. SCOPE: src/lib/init-templates.js
- Sub-task 3: src/commands/init.js
- Sub-task 4: src/commands/doctor.js
- Sub-task 5: 필요 시 __tests__/.

## Acceptance Criteria

<!-- Populated by planner agent -->
