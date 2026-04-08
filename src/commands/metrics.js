/**
 * sentix metrics — agent-metrics.jsonl 시각 분석
 *
 * 데이터 로딩 + 고수준 흐름만 담당.
 * 통계 계산: src/lib/metrics-stats.js
 * 카드 렌더링: src/lib/metrics-render.js
 */

import { registerCommand } from '../registry.js';
import { colors } from '../lib/ui-box.js';
import {
  groupByAgent,
  computeAgentStats,
  computeVerificationStats,
  computeAutonomyStats,
  collectRejections,
} from '../lib/metrics-stats.js';
import {
  renderEmpty,
  renderSummary,
  renderAgentsCard,
  renderGatesCard,
  renderAutonomyCard,
  renderRejectionsCard,
} from '../lib/metrics-render.js';

const { dim, bold, cyan } = colors;

registerCommand('metrics', {
  description: 'Analyze agent success rates and retry counts',
  usage: 'sentix metrics',

  async run(_args, ctx) {
    ctx.log('');
    ctx.log(bold(cyan(' Sentix Metrics')) + dim('  ·  에이전트 성과 분석'));
    ctx.log('');

    // ── 데이터 로딩 ────────────────────────────────────
    if (!ctx.exists('tasks/agent-metrics.jsonl')) {
      renderEmpty(ctx, 'tasks/agent-metrics.jsonl 없음');
      return;
    }

    const raw = await ctx.readFile('tasks/agent-metrics.jsonl');
    const lines = raw.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      renderEmpty(ctx, '아직 기록 없음');
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
      renderEmpty(ctx, `${skipped} 줄 모두 파싱 실패`);
      return;
    }

    // ── 통계 집계 (순수 함수) ─────────────────────────
    const byAgent = groupByAgent(entries);
    const agentStats = computeAgentStats(byAgent);
    const verificationStats = computeVerificationStats(entries);
    const autonomyStats = computeAutonomyStats(entries);
    const rejections = collectRejections(entries);

    // ── 렌더링 ─────────────────────────────────────────
    renderSummary(ctx, {
      totalRecords: entries.length,
      totalCycles: autonomyStats?.cycles ?? entries.length,
      agentCount: byAgent.size,
      autonomyScore: autonomyStats?.score ?? null,
      humanRate: autonomyStats?.humanInterventionRate ?? null,
      skipped,
    });

    renderAgentsCard(ctx, agentStats);
    ctx.log('');

    if (verificationStats) {
      renderGatesCard(ctx, verificationStats);
      ctx.log('');
    }

    if (autonomyStats) {
      renderAutonomyCard(ctx, autonomyStats);
      ctx.log('');
    }

    if (rejections.length > 0) {
      renderRejectionsCard(ctx, rejections);
      ctx.log('');
    }
  },
});
