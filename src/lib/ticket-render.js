/**
 * Ticket rendering — sentix ticket list 출력 헬퍼.
 *
 * 빈 상태, 통계 요약, 티켓 표를 렌더링한다. 통계 계산은
 * computeTicketStats() 순수 함수로 제공.
 */

import { colors, makeBorders, cardLine, cardTitle } from './ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

export function severityBadge(severity) {
  if (severity === 'critical')   return red(severity);
  if (severity === 'warning')    return yellow(severity);
  if (severity === 'suggestion') return cyan(severity);
  return dim(severity || '-');
}

export function statusBadge(status) {
  if (status === 'open')        return yellow(status);
  if (status === 'in_progress') return cyan(status);
  if (status === 'closed')      return dim(status);
  return dim(status || '-');
}

/**
 * Aggregate tickets into status/severity counts.
 * @returns {{status: {open,in_progress,closed,other}, severity: {...}}}
 */
export function computeTicketStats(entries) {
  const status = { open: 0, in_progress: 0, closed: 0, other: 0 };
  const severity = { critical: 0, warning: 0, suggestion: 0, other: 0 };

  for (const e of entries) {
    if (status[e.status] !== undefined) status[e.status]++;
    else status.other++;
    if (severity[e.severity] !== undefined) severity[e.severity]++;
    else severity.other++;
  }
  return { status, severity };
}

/** 헤더 + 빈 상태 카드 */
export function renderEmptyTickets(ctx) {
  const borders = makeBorders();
  ctx.log(`  ${dim('상태')}  ${yellow('없음')}`);
  ctx.log('');
  ctx.log(borders.top);
  ctx.log(cardTitle('TICKETS'));
  ctx.log(borders.mid);
  ctx.log(cardLine(`${dim('· 아직 생성된 티켓이 없습니다')}`));
  ctx.log(cardLine(`  ${dim('└')} ${dim('sentix ticket create "<설명>"')}`));
  ctx.log(borders.bottom);
  ctx.log('');
}

/** 필터 결과 없음 */
export function renderNoMatch(ctx, { statusFilter, severityFilter, totalAll }) {
  ctx.log(`  ${dim('필터')}  ${dim((statusFilter || '') + ' ' + (severityFilter || ''))}`);
  ctx.log(`  ${dim('결과')}  ${yellow('일치하는 티켓 없음')} ${dim(`(전체 ${totalAll}개)`)}`);
  ctx.log('');
}

/** 통계 요약 3줄 */
export function renderTicketSummary(ctx, { entries, totalAll, stats }) {
  ctx.log(`  ${dim('총   ')}  ${entries.length}${entries.length < totalAll ? dim(` / ${totalAll} (필터됨)`) : ''}`);

  const statusLine = [
    stats.status.open        > 0 ? `${yellow('open')} ${stats.status.open}` : null,
    stats.status.in_progress > 0 ? `${cyan('in_progress')} ${stats.status.in_progress}` : null,
    stats.status.closed      > 0 ? `${dim('closed')} ${stats.status.closed}` : null,
  ].filter(Boolean).join('  ');
  if (statusLine) ctx.log(`  ${dim('상태 ')}  ${statusLine}`);

  const sevLine = [
    stats.severity.critical   > 0 ? `${red('critical')} ${stats.severity.critical}` : null,
    stats.severity.warning    > 0 ? `${yellow('warning')} ${stats.severity.warning}` : null,
    stats.severity.suggestion > 0 ? `${cyan('suggestion')} ${stats.severity.suggestion}` : null,
  ].filter(Boolean).join('  ');
  if (sevLine) ctx.log(`  ${dim('심각도')} ${sevLine}`);
  ctx.log('');
}

/** 티켓 카드 표 */
export function renderTicketTable(ctx, entries) {
  const borders = makeBorders();
  ctx.log(borders.top);
  ctx.log(cardTitle('TICKETS', dim(`${entries.length}`)));
  ctx.log(borders.mid);

  const idWidth = Math.max(8, ...entries.map((e) => e.id.length));

  for (const e of entries) {
    const id = e.id.padEnd(idWidth);
    const sev = severityBadge(e.severity);
    const sevPad = ' '.repeat(Math.max(0, 11 - (e.severity?.length || 1)));
    const status = statusBadge(e.status);
    const statusPad = ' '.repeat(Math.max(0, 13 - (e.status?.length || 1)));
    ctx.log(cardLine(`${cyan(id)}  ${sev}${sevPad} ${status}${statusPad} ${e.title}`));
  }

  ctx.log(borders.bottom);
  ctx.log('');
  ctx.log(`  ${dim('상세:')} ${dim('sentix ticket debug <id>')}`);
  ctx.log('');
}
