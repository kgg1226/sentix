/**
 * Metrics render — 카드/막대/포맷 헬퍼
 *
 * metrics.js 에서 시각 출력 부분만 분리. 통계 계산은 metrics-stats.js 참조.
 */

import { colors, makeBorders, cardLine, cardTitle, renderBar, visualWidth } from './ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

/** 빈 상태 카드 */
export function renderEmpty(ctx, reason) {
  const borders = makeBorders();
  ctx.log(`  ${dim('상태')}  ${yellow('데이터 없음')}`);
  ctx.log('');
  ctx.log(borders.top);
  ctx.log(cardTitle('METRICS'));
  ctx.log(borders.mid);
  ctx.log(cardLine(`${yellow('⚠')} ${reason}`));
  ctx.log(cardLine(`${dim('· metrics 는 sentix run 후 자동 기록됩니다')}`));
  ctx.log(cardLine(`  ${dim('└')} ${dim('sentix run "<요청>"')}`));
  ctx.log(borders.bottom);
  ctx.log('');
}

/** 상단 4줄 핵심 요약 */
export function renderSummary(ctx, { totalRecords, totalCycles, agentCount, autonomyScore, humanRate, skipped }) {
  ctx.log(`  ${dim('총 기록')}    ${String(totalRecords).padStart(4)}     ${dim('에이전트')}   ${String(agentCount).padStart(3)}`);
  ctx.log(`  ${dim('사이클 ')}    ${String(totalCycles).padStart(4)}     ${dim('자율성  ')}   ${formatAutonomy(autonomyScore)}`);
  if (humanRate !== null) {
    ctx.log(`  ${dim('인간 개입')}   ${formatHumanRate(humanRate)}`);
  }
  if (skipped > 0) {
    ctx.log(`  ${dim('스킵   ')}    ${yellow(`${skipped} 줄 손상`)}`);
  }
  ctx.log('');
}

/** 에이전트 카드 (top N + more) */
export function renderAgentsCard(ctx, agentStats) {
  const borders = makeBorders();
  const TOP_N = 5;
  const top = agentStats.slice(0, TOP_N);
  const more = agentStats.length - top.length;

  ctx.log(borders.top);
  ctx.log(cardTitle('에이전트', dim(`${top.length}/${agentStats.length}`)));
  ctx.log(borders.mid);

  const nameWidth = Math.max(8, ...top.map((s) => visualWidth(s.agent)));

  for (const s of top) {
    const namePad = ' '.repeat(Math.max(0, nameWidth - visualWidth(s.agent)));
    const runs = `${dim(String(s.runs).padStart(3))}${dim(' runs')}`;

    let rateBar;
    if (s.successRate === null) {
      rateBar = `${dim('─'.repeat(12))}  ${dim('  ?')}`;
    } else {
      rateBar = renderBar(s.successRate, { width: 12 });
    }

    ctx.log(cardLine(`${s.agent}${namePad}  ${runs}  ${rateBar}`));

    const extras = [];
    if (s.avgRetries > 0) extras.push(`${dim('재시도')} ${yellow(s.avgRetries.toFixed(1))}`);
    if (s.avgDuration !== null) extras.push(`${dim('시간')} ${cyan(formatDuration(s.avgDuration))}`);
    if (s.avgTokens !== null) extras.push(`${dim('토큰')} ${cyan(formatTokens(s.avgTokens))}`);
    if (extras.length > 0) {
      ctx.log(cardLine(`  ${dim('└')} ${extras.join('  ')}`));
    }
  }

  if (more > 0) {
    ctx.log(cardLine(`${dim(`  + ${more} more`)}`));
  }
  ctx.log(borders.bottom);
}

/** 검증 게이트 카드 */
export function renderGatesCard(ctx, vstats) {
  const borders = makeBorders();
  ctx.log(borders.top);
  ctx.log(cardTitle('검증 게이트'));
  ctx.log(borders.mid);
  const passed = vstats.passed;
  const failed = vstats.total - vstats.passed;
  ctx.log(cardLine(`${dim('통과율')}  ${renderBar(vstats.rate, { width: 18 })}`));
  ctx.log(cardLine(`${dim('총   ')}  ${vstats.total}    ${green('✓')} ${passed}    ${(failed > 0 ? red : dim)('✗')} ${failed}`));

  if (vstats.topViolations.length > 0) {
    ctx.log(cardLine(''));
    ctx.log(cardLine(`${dim('주요 위반')}`));
    for (const [rule, count] of vstats.topViolations) {
      ctx.log(cardLine(`  ${red('·')} ${rule} ${dim('(' + count + 'x)')}`));
    }
  }
  ctx.log(borders.bottom);
}

/** 자율성 카드 */
export function renderAutonomyCard(ctx, astats) {
  const borders = makeBorders();
  ctx.log(borders.top);
  ctx.log(cardTitle('자율성'));
  ctx.log(borders.mid);

  const scoreColor = astats.score >= 0.95 ? green : astats.score >= 0.7 ? cyan : yellow;
  const label = astats.score >= 0.95 ? 'zero-touch' : astats.score >= 0.7 ? '높음' : '개선 필요';
  ctx.log(cardLine(`${dim('점수   ')}  ${renderBar(astats.score, { width: 18 })}`));
  ctx.log(cardLine(`${dim('레이블 ')}  ${scoreColor(label)}`));
  ctx.log(cardLine(''));
  ctx.log(cardLine(`${dim('사이클     ')} ${astats.cycles}`));
  ctx.log(cardLine(`${dim('인간 개입  ')} ${astats.humanInterventions > 0 ? yellow(astats.humanInterventions) : dim('0')}`));
  ctx.log(cardLine(`${dim('게이트 실패')} ${astats.gateFailures > 0 ? red(astats.gateFailures) : dim('0')}`));
  ctx.log(borders.bottom);
}

/** 주요 거부 사유 카드 */
export function renderRejectionsCard(ctx, rejections) {
  const borders = makeBorders();
  const top = rejections.slice(0, 3);
  ctx.log(borders.top);
  ctx.log(cardTitle('주요 거부 사유', dim(`${top.length}/${rejections.length}`)));
  ctx.log(borders.mid);
  for (const [reason, count] of top) {
    ctx.log(cardLine(`${red('·')} ${reason} ${dim('(' + count + 'x)')}`));
  }
  if (rejections.length > 3) {
    ctx.log(cardLine(`${dim(`  + ${rejections.length - 3} more`)}`));
  }
  ctx.log(borders.bottom);
}

// ── 포맷 헬퍼 (export 도 하여 testable) ────────────────

export function formatAutonomy(score) {
  if (score === null) return dim('(없음)');
  const pct = Math.round(score * 100);
  const color = score >= 0.95 ? green : score >= 0.7 ? cyan : yellow;
  return `${color(score.toFixed(2))} ${dim('(' + pct + '%)')}`;
}

export function formatHumanRate(rate) {
  const pct = Math.round(rate * 100);
  const color = rate === 0 ? green : rate < 0.1 ? cyan : yellow;
  return color(`${pct}%`);
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
