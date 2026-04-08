/**
 * sentix run — 카드/배너 렌더링 헬퍼
 *
 * run.js 의 출력 부분을 분리. 외부 Claude Code 프로세스 출력은
 * stdio: 'inherit' 로 그대로 흘러가고, 이 파일은 run.js 가 직접
 * 제어하는 영역(시작/safety/완료/실패) 만 담당한다.
 */

import { colors, makeBorders, cardLine, cardTitle } from './ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

/** 시작 배너: Sentix Run · Governor 파이프라인 */
export function renderStartBanner(ctx, { cycleId, request, mode }) {
  ctx.log('');
  ctx.log(` ${bold(cyan('Sentix Run'))}  ${dim('·')}  ${dim('Governor 파이프라인')}`);
  ctx.log('');
  ctx.log(`  ${dim('cycle  ')}  ${cyan(cycleId)}`);
  ctx.log(`  ${dim('요청   ')}  "${request}"`);
  if (mode === 'hotfix') {
    ctx.log(`  ${dim('모드   ')}  ${yellow('핫픽스')}  ${dim('단축 파이프라인 (Step 1→2→3→7)')}`);
  }
  ctx.log('');
}

/** Pipeline mode 라인 (chained / hotfix / single) */
export function renderModeLine(ctx, mode) {
  if (mode === 'chained') {
    ctx.log(`  ${dim('모드   ')}  ${green('chained')}  ${dim('PLAN → DEV → GATE → REVIEW → FINALIZE')}`);
  } else if (mode === 'hotfix') {
    ctx.log(`  ${dim('모드   ')}  ${yellow('hotfix')}   ${dim('Step 1 → 2 → 3 → 7 (단축)')}`);
    ctx.log('');
    ctx.log(`  ${dim('Claude Code Governor 호출 중 (direct fix)...')}`);
  } else {
    ctx.log(`  ${dim('모드   ')}  ${yellow('single')}  ${dim('(legacy)')}`);
    ctx.log('');
    ctx.log(`  ${dim('Claude Code Governor 호출 중...')}`);
  }
  ctx.log('');
}

/** Safety 위반 감지 시 출력 (4가지 분기) */
export function renderSafety(ctx, scenario, data = {}) {
  const borders = makeBorders();

  if (scenario === 'needs-word') {
    ctx.log('');
    ctx.log(`  ${red('●')} ${bold('SAFETY')}  ${red('위험 요청 감지됨')}`);
    ctx.log(`  ${dim('패턴')}  ${yellow(data.pattern)}`);
    ctx.log('');
    ctx.log(borders.top);
    ctx.log(cardTitle('차단됨', red('안전어 필요')));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${red('✗')} 이 요청은 안전어 검증이 필요합니다`));
    ctx.log(cardLine(`  ${dim('└')} ${dim('sentix run "<요청>" --safety-word <안전어>')}`));
    ctx.log(borders.bottom);
    ctx.log('');
    return;
  }

  if (scenario === 'denied') {
    ctx.log('');
    ctx.log(`  ${red('●')} ${bold('SAFETY')}  ${red('DENIED')}`);
    ctx.log(`  ${dim('사유')}  ${red('안전어가 일치하지 않습니다')}`);
    ctx.log('');
    return;
  }

  if (scenario === 'verified') {
    ctx.log('');
    ctx.log(`  ${green('●')} ${bold('SAFETY')}  ${green('VERIFIED')} ${dim('— 진행합니다')}`);
    ctx.log('');
    return;
  }

  if (scenario === 'no-safety-word') {
    ctx.log('');
    ctx.log(`  ${yellow('●')} ${bold('SAFETY')}  ${yellow('위험 요청 감지됨 (안전어 미설정)')}`);
    ctx.log(`  ${dim('패턴')}  ${yellow(data.pattern)}`);
    ctx.log(`  ${dim('권장')}  ${dim('sentix safety set <안전어>')}`);
    ctx.log('');
  }
}

/** Preflight 에러 (CLAUDE.md 없음, claude CLI 없음, 동시 실행 등) */
export function renderPreflightError(ctx, scenario, data = {}) {
  ctx.log('');
  if (scenario === 'empty-request') {
    ctx.error('요청 내용이 비어 있습니다');
    ctx.log(`  ${dim('사용:')}  ${dim('sentix run "<요청>"')}`);
    ctx.log(`  ${dim('예시:')}  ${dim('sentix run "인증에 세션 만료 추가해줘"')}`);
  } else if (scenario === 'no-claude-md') {
    ctx.error('CLAUDE.md 가 없습니다 — 초기화 필요');
    ctx.log(`  ${dim('실행:')} ${dim('sentix init')}`);
  } else if (scenario === 'no-claude-cli') {
    ctx.error('Claude Code CLI 가 설치되어 있지 않습니다');
    ctx.log(`  ${dim('설치:')} ${dim('npm i -g @anthropic-ai/claude-code')}`);
  } else if (scenario === 'concurrent') {
    ctx.error('이미 다른 파이프라인이 실행 중입니다');
    ctx.log(`  ${dim('실행 중:')} ${cyan(data.cycleId)}`);
    ctx.log(`  ${dim('대기하거나 강제 종료:')} ${dim('rm tasks/governor-state.json')}`);
  }
  ctx.log('');
}

/** 검증 게이트 카드 */
export function renderGateCard(ctx, gateResults) {
  const borders = makeBorders();
  const checkPass = gateResults.checks.filter((c) => c.passed).length;
  const checkFail = gateResults.checks.length - checkPass;

  ctx.log('');
  ctx.log(borders.top);
  const gateStats = [
    checkPass > 0 ? green(`${checkPass}✓`) : null,
    checkFail > 0 ? red(`${checkFail}✗`) : null,
  ].filter(Boolean).join('  ');
  ctx.log(cardTitle('검증 게이트', gateStats));
  ctx.log(borders.mid);

  if (gateResults.checks.length === 0) {
    ctx.log(cardLine(`${dim('· ' + (gateResults.summary || '게이트 정의 없음'))}`));
  } else {
    const sorted = [...gateResults.checks].sort((a, b) => Number(a.passed) - Number(b.passed));
    for (const check of sorted) {
      if (check.passed) {
        ctx.log(cardLine(`${green('✓')} ${dim(check.rule)} ${dim(check.detail)}`));
      } else {
        ctx.log(cardLine(`${red('✗')} ${bold(check.rule)} ${check.detail}`));
        for (const v of check.violations) {
          ctx.log(cardLine(`  ${dim('└')} ${red(v.message)}`));
        }
      }
    }
  }
  ctx.log(borders.bottom);
  ctx.log('');
}

/** 완료/경고 배너 */
export function renderCompletionBanner(ctx, { passed, violationCount, duration }) {
  if (passed) {
    const dur = duration ? `${dim('  소요')} ${cyan(formatDuration(duration))}` : '';
    ctx.log(`  ${green('●')} ${bold('완료')}  ${green('모든 게이트 통과')}${dur}`);
    ctx.log(`  ${dim('확인:')} ${dim('sentix status')}`);
    ctx.log('');
  } else {
    ctx.log(`  ${yellow('●')} ${bold('완료 (경고)')}  ${yellow(`${violationCount} 게이트 위반`)}`);
    ctx.log(`  ${dim('머지 전에 위 ✗ 항목을 검토하세요')}`);
    ctx.log('');
  }
}

/** 실패 배너 */
export function renderFailureBanner(ctx, failedAt) {
  const borders = makeBorders();
  ctx.log('');
  ctx.log(borders.top);
  ctx.log(cardTitle('실패', red('✗')));
  ctx.log(borders.mid);
  ctx.log(cardLine(`${red('✗')} ${failedAt} phase 에서 실패`));
  ctx.log(cardLine(`  ${dim('└')} ${dim('자세한 내용은 sentix status 또는 위 출력 참조')}`));
  ctx.log(borders.bottom);
  ctx.log('');
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
