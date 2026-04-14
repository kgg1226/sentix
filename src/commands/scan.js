/**
 * sentix scan — 프로젝트 스캔 + 작업 제안
 *
 * 프로젝트 코드를 분석하여 개선이 필요한 영역을 감지하고
 * 구체적인 sentix run 명령을 제안한다.
 */

import { registerCommand } from '../registry.js';
import { scanProject, formatScanReport } from '../lib/project-scanner.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, cyan } = colors;
const { top, mid, bottom } = makeBorders();

registerCommand('scan', {
  description: 'Scan project and suggest improvements',
  usage: 'sentix scan',

  async run(_args, ctx) {
    ctx.log('');
    ctx.log(bold(cyan(' Sentix Scan')) + dim('  ·  프로젝트 분석 + 작업 제안'));
    ctx.log('');

    const result = scanProject(ctx.cwd);

    ctx.log(top);
    ctx.log(cardTitle('프로젝트 스캔 결과', `${result.suggestions.length}개 제안`));
    ctx.log(mid);
    ctx.log(cardLine(formatScanReport(result)));
    ctx.log(bottom);
    ctx.log('');
  },
});
