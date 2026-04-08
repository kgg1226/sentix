/**
 * Metrics stats — 순수 계산 함수
 *
 * agent-metrics.jsonl 항목 배열에서 집계 통계를 계산한다.
 * 부수효과 없음, I/O 없음, 렌더링 없음 → 테스트 용이.
 */

/** Group entries by agent name, falling back to "unknown". */
export function groupByAgent(entries) {
  const map = new Map();
  for (const entry of entries) {
    const agent = entry.agent || 'unknown';
    if (!map.has(agent)) map.set(agent, []);
    map.get(agent).push(entry);
  }
  return map;
}

/**
 * Compute per-agent stats: runs, success rate, avg retries, duration, tokens.
 * Sorted with problematic agents first (lowest success rate).
 * @returns {Array<{agent, runs, successRate, avgRetries, avgDuration, avgTokens}>}
 */
export function computeAgentStats(byAgent) {
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

    stats.push({ agent, runs: records.length, successRate, avgRetries, avgDuration, avgTokens });
  }

  // Problematic agents first: lowest success rate, null last
  stats.sort((a, b) => {
    if (a.successRate === null && b.successRate === null) return b.runs - a.runs;
    if (a.successRate === null) return 1;
    if (b.successRate === null) return -1;
    return a.successRate - b.successRate;
  });
  return stats;
}

/**
 * Verification gate pass rate + top violations.
 * @returns {null|{total, passed, rate, topViolations: Array<[rule, count]>}}
 */
export function computeVerificationStats(entries) {
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

  return { total: withVerification.length, passed: gatePassed, rate: gateRate, topViolations };
}

/**
 * Autonomy score + human intervention rate + gate failures.
 * @returns {null|{cycles, humanInterventions, gateFailures, score, humanInterventionRate}}
 */
export function computeAutonomyStats(entries) {
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

/**
 * Collect rejection reasons from output_quality across all entries.
 * @returns {Array<[reason, count]>} sorted desc by count
 */
export function collectRejections(entries) {
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
