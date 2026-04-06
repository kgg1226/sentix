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
| `resume.js` | `sentix resume` | 중단된 파이프라인 재개 |
| `doctor.js` | `sentix doctor` | 설치 상태 진단 |
| `status.js` | `sentix status` | Governor 상태 조회 |
| `metrics.js` | `sentix metrics` | 에이전트 메트릭 분석 |
| `update.js` | `sentix update` | 프레임워크 업데이트 |
| `plugin.js` | `sentix plugin` | 플러그인 관리 |
| `version.js` | `sentix version` | 버전 관리 (bump/current/changelog) |
| `ticket.js` | `sentix ticket` | 티켓 관리 (create/list/debug) |
| `feature.js` | `sentix feature` | 기능 관리 (add/list/impact) |
| `safety.js` | `sentix safety` | 안전어 관리 (set/verify/status) |

파일은 알파벳순으로 자동 로드됨.
