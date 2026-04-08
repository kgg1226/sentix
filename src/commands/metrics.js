/**
 * sentix metrics — agent-metrics.jsonl 시각 분석
 *
 * 설계 (status / doctor 와 일관):
 *   - 상단 4줄 요약 (총 사이클 / 에이전트 / 자율성 / 인간 개입률)
 *   - 4개 카드: AGENTS / GATES / AUTONOMY / REJECTIONS
 *   - 막대 그래프로 비율 시각화
 *   - 문제 있는 것 위로 정렬 (성공률 낮은 에이전트, 자주 일어난 위반)
 *   - 데이터 바다 금지: top 5 / top 3 로 절단, 나머지는 카운트만
 */

import { registerCommand } from '../registry.js';
import { colors, makeBorders, cardLine, cardTitle, renderBar, visualWidth } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('metrics', {
  description: 'Analyze agent success rates and retry counts',
  usage: 'sentix metrics',

  async run(_args, ctx) {
    const borders = makeBorders();

    ctx.log('');
    ctx.log(bold(cyan(' Sentix Metrics')) + dim('  ·  에이전트 성과 분석'));
    ctx.log('');

    // ── 데이터 로딩 ────────────────────────────────────
    if (!ctx.exists('tasks/agent-metrics.jsonl')) {
      renderEmpty(ctx, borders, 'tasks/agent-metrics.jsonl 없음');
      return;
    }

    const raw = await ctx.readFile('tasks/agent-metrics.jsonl');
    const lines = raw.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      renderEmpty(ctx, borders, '아직 기록 없음');
      return;
    }

    const entries = [];
    let skipped = 0;
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        skipped++;
      }
    }

    if (entries.length === 0) {
      renderEmpty(ctx, borders, `${skipped} 줄 모두 파싱 실패`);
      return;
    }

    // ── 통계 집계 ──────────────────────────────────────
    const byAgent = groupByAgent(entries);
    const agentStats = computeAgentStats(byAgent);
    const verificationStats = computeVerificationStats(entries);
    const autonomyStats = computeAutonomyStats(entries);

    // ── 핵심 요약 4줄 ──────────────────────────────────
    const totalCycles = autonomyStats?.cycles ?? entries.length;
    const agentCount = byAgent.size;
    const autonomy = autonomyStats?.score ?? null;
    const humanRate = autonomyStats?.humanInterventionRate ?? null;

    ctx.log(`  ${dim('총 기록')}    ${String(entries.length).padStart(4)}     ${dim('에이전트')}   ${String(agentCount).padStart(3)}`);
    ctx.log(`  ${dim('사이클 ')}    ${String(totalCycles).padStart(4)}     ${dim('자율성  ')}   ${formatAutonomy(autonomy)}`);
    if (humanRate !== null) {
      ctx.log(`  ${dim('인간 개입')}   ${formatHumanRate(humanRate)}`);
    }
    if (skipped > 0) {
      ctx.log(`  ${dim('스킵   ')}    ${yellow(`${skipped} 줄 손상`)}`);
    }
    ctx.log('');

    // ── CARD 1: AGENTS ─────────────────────────────────
    renderAgentsCard(ctx, borders, agentStats);
    ctx.log('');

    // ── CARD 2: GATES ──────────────────────────────────
    if (verificationStats) {
      renderGatesCard(ctx, borders, verificationStats);
      ctx.log('');
    }

    // ── CARD 3: AUTONOMY ───────────────────────────────
    if (autonomyStats) {
      renderAutonomyCard(ctx, borders, autonomyStats);
      ctx.log('');
    }

    // ── CARD 4: TOP REJECTIONS ─────────────────────────
    const allRejections = collectRejections(entries);
    if (allRejections.length > 0) {
      renderRejectionsCard(ctx, borders, allRejections);
      ctx.log('');
    }
  },
});

// ── 빈 상태 카드 ─────────────────────────────────────────
function renderEmpty(ctx, borders, reason) {
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

// ── 집계 함수들 ──────────────────────────────────────────

function groupByAgent(entries) {
  const map = new Map();
  for (const entry of entries) {
    const agent = entry.agent || 'unknown';
    if (!map.has(agent)) map.set(agent, []);
    map.get(agent).push(entry);
  }
  return map;
}

function computeAgentStats(byAgent) {
  const stats = [];
  for (const [agent, records] of byAgent) {
    const successRecords = records.filter((r) => r.output_quality);
    let successRate = null;
    if (successRecords.length > 0) {
      const successes = successRecords.filter((r) => {
        const q = r.output_quality;
        return q.first_pass_success || q.accepted_by_next || q.final_pass;
      });
      successRate = successes.length / successRecords.length;
    }

    const totalRetries = records.reduce((s, r) => s + (r.retries || 0), 0);
    const avgRetries = records.length > 0 ? totalRetries / records.length : 0;

    const withDuration = records.filter((r) => r.duration_seconds);
    const avgDuration = withDuration.length > 0
      ? withDuration.reduce((s, r) => s + r.duration_seconds, 0) / withDuration.length
      : null;

    const withTokens = records.filter((r) => r.tokens_used);
    const avgTokens = withTokens.length > 0
      ? Math.round(withTokens.reduce((s, r) => s + r.tokens_used, 0) / withTokens.length)
      : null;

    stats.push({
      agent,
      runs: records.length,
      successRate,
      avgRetries,
      avgDuration,
      avgTokens,
    });
  }
  // 문제 있는 에이전트 위로: 성공률 낮은 순, null은 마지막
  stats.sort((a, b) => {
    if (a.successRate === null && b.successRate === null) return b.runs - a.runs;
    if (a.successRate === null) return 1;
    if (b.successRate === null) return -1;
    return a.successRate - b.successRate;
  });
  return stats;
}

function computeVerificationStats(entries) {
  const withVerification = entries.filter((r) => r.verification);
  if (withVerification.length === 0) return null;

  const gatePassed = withVerification.filter((r) => r.verification.passed).length;
  const gateRate = gatePassed / withVerification.length;

  const allViolations = withVerification.flatMap((r) => r.verification.violations || []);
  const counts = {};
  for (const v of allViolations) {
    const key = typeof v === 'string' ? v : (v.rule || JSON.stringify(v));
    counts[key] = (counts[key] || 0) + 1;
  }
  const topViolations = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    total: withVerification.length,
    passed: gatePassed,
    rate: gateRate,
    topViolations,
  };
}

function computeAutonomyStats(entries) {
  const withAutonomy = entries.filter((r) => r.autonomy);
  if (withAutonomy.length === 0) return null;

  const totalInterventions = withAutonomy.reduce(
    (sum, r) => sum + (r.autonomy.human_interventions || 0), 0
  );
  const totalGateFailures = withAutonomy.reduce(
    (sum, r) => sum + (r.autonomy.gate_failures || 0), 0
  );
  const score = withAutonomy.length > 0
    ? Math.max(0, 1 - totalInterventions / withAutonomy.length)
    : 1;
  const humanRate = withAutonomy.length > 0
    ? totalInterventions / withAutonomy.length
    : 0;

  return {
    cycles: withAutonomy.length,
    humanInterventions: totalInterventions,
    gateFailures: totalGateFailures,
    score,
    humanInterventionRate: humanRate,
  };
}

function collectRejections(entries) {
  const counts = {};
  for (const entry of entries) {
    const reasons = entry.output_quality?.rejection_reasons;
    if (!Array.isArray(reasons)) continue;
    for (const r of reasons) {
      counts[r] = (counts[r] || 0) + 1;
    }
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

// ── 카드 렌더러들 ────────────────────────────────────────

function renderAgentsCard(ctx, borders, agentStats) {
  const TOP_N = 5;
  const top = agentStats.slice(0, TOP_N);
  const more = agentStats.length - top.length;

  const stats = `${top.length}/${agentStats.length}`;
  ctx.log(borders.top);
  ctx.log(cardTitle('에이전트', dim(stats)));
  ctx.log(borders.mid);

  // 표 형식: 이름 / runs / 성공률 막대
  // 가장 긴 에이전트 이름 길이 측정 (전각 고려)
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

    // 부가 정보 (재시도/시간/토큰) — 한 줄로
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

function renderGatesCard(ctx, borders, vstats) {
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

function renderAutonomyCard(ctx, borders, astats) {
  ctx.log(borders.top);
  ctx.log(cardTitle('자율성'));
  ctx.log(borders.mid);

  const scoreColor = astats.score >= 0.95 ? green : astats.score >= 0.7 ? cyan : yellow;
  ctx.log(cardLine(`${dim('점수   ')}  ${renderBar(astats.score, { width: 18 })}`));
  ctx.log(cardLine(`${dim('레이블 ')}  ${scoreColor(astats.score >= 0.95 ? 'zero-touch' : astats.score >= 0.7 ? '높음' : '개선 필요')}`));
  ctx.log(cardLine(''));
  ctx.log(cardLine(`${dim('사이클     ')} ${astats.cycles}`));
  ctx.log(cardLine(`${dim('인간 개입  ')} ${astats.humanInterventions > 0 ? yellow(astats.humanInterventions) : dim('0')}`));
  ctx.log(cardLine(`${dim('게이트 실패')} ${astats.gateFailures > 0 ? red(astats.gateFailures) : dim('0')}`));
  ctx.log(borders.bottom);
}

function renderRejectionsCard(ctx, borders, rejections) {
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

// ── 포맷 헬퍼 ────────────────────────────────────────────

function formatAutonomy(score) {
  if (score === null) return dim('(없음)');
  const pct = Math.round(score * 100);
  const color = score >= 0.95 ? green : score >= 0.7 ? cyan : yellow;
  return `${color(score.toFixed(2))} ${dim('(' + pct + '%)')}`;
}

function formatHumanRate(rate) {
  const pct = Math.round(rate * 100);
  const color = rate === 0 ? green : rate < 0.1 ? cyan : yellow;
  return color(`${pct}%`);
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatTokens(n) {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000000).toFixed(1)}M`;
}
