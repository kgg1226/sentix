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
| `run.js` | `sentix run "요청"` | Governor 파이프라인 실행 |
| `doctor.js` | `sentix doctor` | 설치 상태 진단 |
| `status.js` | `sentix status` | Governor 상태 대시보드 (파이프라인 다이어그램 + 카드) |
| `config.js` | `sentix config` | 분산된 설정을 한 곳에서 (get/set/list) |
| `profile.js` | `sentix profile` | 환경 프로필 빠른 전환 (list/current/switch) |
| `layer.js` | `sentix layer` | 진화 레이어 토글 (enable/disable/toggle) |
| `metrics.js` | `sentix metrics` | 에이전트 메트릭 분석 |
| `update.js` | `sentix update` | 프레임워크 업데이트 |
| `plugin.js` | `sentix plugin` | 플러그인 관리 |

파일은 알파벳순으로 자동 로드됨.

## UX 명령 그룹 (status / config / profile / layer)

이 4개 명령은 공통 디자인 원칙을 따른다:

- **정제된 시각화**: 카드 + ANSI 색상 + 한글 라벨, 데이터 바다 금지
- **단일 백엔드**: `src/lib/toml-edit.js` + `src/lib/config-schema.js` 공유
- **외부 의존성 제로**: ANSI는 inline, TOML 파싱은 섹션 기반 정규식
- **하드룰 호환**: 기존 파일 컨벤션(active.toml, config.toml) 유지, 추가만 함
