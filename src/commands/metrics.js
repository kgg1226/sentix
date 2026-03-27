/**
 * sentix metrics — agent-metrics.jsonl 분석
 *
 * 에이전트별 성공률, 재시도율 표시.
 */

import { registerCommand } from '../registry.js';

registerCommand('metrics', {
  description: 'Analyze agent success rates and retry counts',
  usage: 'sentix metrics',

  async run(_args, ctx) {
    ctx.log('=== Sentix Metrics ===\n');

    if (!ctx.exists('tasks/agent-metrics.jsonl')) {
      ctx.warn('No metrics data yet. Metrics are recorded after sentix run.');
      ctx.log('File: tasks/agent-metrics.jsonl');
      return;
    }

    const raw = await ctx.readFile('tasks/agent-metrics.jsonl');
    const lines = raw.trim().split('\n').filter(Boolean);

    if (lines.length === 0) {
      ctx.warn('No metrics data yet.');
      return;
    }

    // Parse entries
    const entries = [];
    let skipped = 0;
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        skipped++;
      }
    }

    ctx.log(`Total records: ${entries.length}${skipped > 0 ? ` (${skipped} malformed lines skipped)` : ''}\n`);
    if (skipped > 0) {
      ctx.warn(`${skipped} malformed lines in agent-metrics.jsonl were skipped.`);
    }

    // Group by agent
    const byAgent = new Map();
    for (const entry of entries) {
      const agent = entry.agent || 'unknown';
      if (!byAgent.has(agent)) byAgent.set(agent, []);
      byAgent.get(agent).push(entry);
    }

    // Display per-agent stats
    for (const [agent, records] of byAgent) {
      ctx.log(`--- ${agent} (${records.length} runs) ---`);

      // Success rate (first_pass_success or accepted_by_next)
      const successRecords = records.filter(r => r.output_quality);
      if (successRecords.length > 0) {
        const successes = successRecords.filter(r => {
          const q = r.output_quality;
          return q.first_pass_success || q.accepted_by_next || q.final_pass;
        });
        const rate = ((successes.length / successRecords.length) * 100).toFixed(1);
        ctx.log(`  Success rate: ${rate}%`);
      }

      // Retry stats
      const withRetries = records.filter(r => r.retries > 0);
      if (records.some(r => r.retries !== undefined)) {
        const totalRetries = records.reduce((sum, r) => sum + (r.retries || 0), 0);
        const avgRetries = (totalRetries / records.length).toFixed(2);
        ctx.log(`  Avg retries:  ${avgRetries}`);
        ctx.log(`  Runs with retries: ${withRetries.length}/${records.length}`);
      }

      // Duration stats
      const withDuration = records.filter(r => r.duration_seconds);
      if (withDuration.length > 0) {
        const avgDuration = (withDuration.reduce((s, r) => s + r.duration_seconds, 0) / withDuration.length).toFixed(0);
        ctx.log(`  Avg duration: ${avgDuration}s`);
      }

      // Token stats
      const withTokens = records.filter(r => r.tokens_used);
      if (withTokens.length > 0) {
        const avgTokens = Math.round(withTokens.reduce((s, r) => s + r.tokens_used, 0) / withTokens.length);
        ctx.log(`  Avg tokens:   ${avgTokens}`);
      }

      // Common rejection reasons (for dev/dev-fix)
      const rejections = records
        .filter(r => r.output_quality?.rejection_reasons)
        .flatMap(r => r.output_quality.rejection_reasons);
      if (rejections.length > 0) {
        const counts = {};
        for (const r of rejections) {
          counts[r] = (counts[r] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        ctx.log('  Top rejection reasons:');
        for (const [reason, count] of sorted) {
          ctx.log(`    - ${reason} (${count}x)`);
        }
      }

      ctx.log('');
    }

    // Governor summary
    const govRecords = byAgent.get('governor') || [];
    if (govRecords.length > 0) {
      const humanInterventions = govRecords.filter(r =>
        r.human_intervention || (r.autonomy && r.autonomy.human_interventions > 0)
      );
      ctx.log(`Human intervention rate: ${((humanInterventions.length / govRecords.length) * 100).toFixed(1)}%`);
    }

    // ── Verification gate stats ──────────────────────
    const withVerification = entries.filter(r => r.verification);
    if (withVerification.length > 0) {
      ctx.log('--- Verification Gates ---\n');

      const gatePassed = withVerification.filter(r => r.verification.passed).length;
      const gateRate = ((gatePassed / withVerification.length) * 100).toFixed(1);
      ctx.log(`  Gate pass rate: ${gateRate}% (${gatePassed}/${withVerification.length})`);

      // Most common violations
      const allViolations = withVerification
        .flatMap(r => r.verification.violations || []);
      if (allViolations.length > 0) {
        const counts = {};
        for (const v of allViolations) {
          const rule = typeof v === 'string' ? v : v;
          counts[rule] = (counts[rule] || 0) + 1;
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        ctx.log('  Top violations:');
        for (const [rule, count] of sorted) {
          ctx.log(`    - ${rule} (${count}x)`);
        }
      }

      ctx.log('');
    }

    // ── Autonomy score ───────────────────────────────
    const withAutonomy = entries.filter(r => r.autonomy);
    if (withAutonomy.length > 0) {
      ctx.log('--- Autonomy ---\n');

      const totalInterventions = withAutonomy.reduce(
        (sum, r) => sum + (r.autonomy.human_interventions || 0), 0
      );
      const totalGateFailures = withAutonomy.reduce(
        (sum, r) => sum + (r.autonomy.gate_failures || 0), 0
      );
      const autonomyScore = withAutonomy.length > 0
        ? (1 - totalInterventions / withAutonomy.length).toFixed(2)
        : '1.00';

      ctx.log(`  Cycles: ${withAutonomy.length}`);
      ctx.log(`  Human interventions: ${totalInterventions}`);
      ctx.log(`  Gate failures: ${totalGateFailures}`);
      ctx.log(`  Autonomy score: ${autonomyScore} (1.00 = zero-touch)`);
      ctx.log('');
    }
  },
});
