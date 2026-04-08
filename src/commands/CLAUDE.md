# src/commands/ — CLI 명령어

## 명령어 추가법

```js
import { registerCommand } from '../registry.js';

registerCommand('name', {
  description: '명령어 설명',
  usage: 'sentix name [args]',
  async run(args, ctx) {
    // args: string[], ctx: context object
  },
});
```

## 기존 명령어

| 파일 | 명령어 | 설명 |
|------|--------|------|
| `init.js` | `sentix init` | 프로젝트 초기화 |
| `run.js` | `sentix run "요청"` | Governor 파이프라인 실행 (카드 출력) |
| `resume.js` | `sentix resume` | 중단된 파이프라인 재개 |
| `doctor.js` | `sentix doctor` | 설치 진단 카드 + 건강도 막대 |
| `status.js` | `sentix status` | Governor 상태 대시보드 (파이프라인 다이어그램 + 카드) |
| `config.js` | `sentix config` | 분산된 설정을 한 곳에서 (get/set/list) |
| `profile.js` | `sentix profile` | 환경 프로필 빠른 전환 (list/current/switch) |
| `layer.js` | `sentix layer` | 진화 레이어 토글 (enable/disable/toggle) |
| `metrics.js` | `sentix metrics` | 에이전트 성과 카드 + 막대 그래프 |
| `safety.js` | `sentix safety` | 안전어 관리 (set/verify/reset/status/unlock) |
| `ticket.js` | `sentix ticket` | 버그 티켓 관리 (create/list/debug) |
| `feature.js` | `sentix feature` | 기능 워크플로우 (add/list/impact) |
| `update.js` | `sentix update` | 프레임워크 업데이트 |
| `plugin.js` | `sentix plugin` | 플러그인 관리 |
| `evolve.js` | `sentix evolve` | 자가 분석/개선 (Layer 5) |
| `context.js` | `sentix context` | 멀티 프로젝트 컨텍스트 |
| `version.js` | `sentix version` | 버전 관리 (bump/current/changelog) |

파일은 알파벳순으로 자동 로드됨.

## UX 명령 그룹 — 통일된 시각 언어

**모든 사용자 facing 명령**이 `src/lib/ui-box.js` 를 통해 동일한
디자인 언어를 공유한다 (init 제외):

- **상태/대시보드**: `sentix` (entry), `sentix status`, `sentix doctor`,
  `sentix metrics`, `sentix evolve`
- **파이프라인**: `sentix run`, `sentix ticket`, `sentix feature`
- **설정/관리**: `sentix config`, `sentix profile`, `sentix layer`,
  `sentix safety status`, `sentix plugin`
- **버전/배포**: `sentix version current/bump/changelog`, `sentix update`,
  `sentix context`

공통 원칙:
- **정제된 시각화**: 4줄 핵심 요약 + 카드 + 막대 그래프, 데이터 바다 금지
- **단일 백엔드**: `src/lib/ui-box.js`(카드/색상) + `src/lib/toml-edit.js`(TOML)
  + `src/lib/config-schema.js`(설정 메타) 공유
- **외부 의존성 제로**: ANSI는 ui-box.colors, TOML 파싱은 섹션 기반 정규식
- **한글 우선**: 라벨/설명/에러 메시지 모두 한글, 전각 폭 자동 처리
- **하드룰 호환**: 기존 파일 컨벤션(active.toml, config.toml) 유지, 추가만 함
- **상황별 권장 액션**: `sentix` (no args) 진입점이 현재 상태에 맞는
  다음 액션을 자동 추천
