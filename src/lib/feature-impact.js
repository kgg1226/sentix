/**
 * Feature analysis — complexity, impact, decomposition.
 *
 * feature.js 에서 분석 로직을 분리. 모두 ctx 만 받는 async 함수라
 * I/O 있지만 순수한 계산 (파일 쓰기 없음).
 */

// ── Complexity keywords ───────────────────────────────

const COMPLEXITY_KEYWORDS = {
  high: ['api', 'database', 'auth', 'migration', 'multi-tenant', 'real-time', 'websocket', 'oauth', '인증', '데이터베이스', '마이그레이션'],
  medium: ['form', 'validation', 'upload', 'notification', 'cache', 'filter', 'search', '폼', '알림', '캐시'],
};

/**
 * Keyword-weighted complexity estimation.
 * @returns {'low'|'medium'|'high'}
 */
export function assessComplexity(description) {
  const lower = description.toLowerCase();
  let score = 0;

  for (const keyword of COMPLEXITY_KEYWORDS.high) {
    if (lower.includes(keyword)) score += 2;
  }
  for (const keyword of COMPLEXITY_KEYWORDS.medium) {
    if (lower.includes(keyword)) score += 1;
  }

  // Multiple systems mentioned
  if ((lower.match(/\band\b|,\s*\w+/g) || []).length >= 2) score += 2;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}

/**
 * Scan INTERFACE.md, registry.md, and keyword hints to estimate
 * deploy/security impact. Returns summary markdown + flags.
 *
 * @returns {Promise<{summary: string, deployFlag: boolean, securityFlag: boolean}>}
 */
export async function getImpactData(description, ctx) {
  const lower = description.toLowerCase();
  const lines = [];
  let deployFlag = false;
  let securityFlag = false;

  // Check INTERFACE.md for affected APIs
  if (ctx.exists('INTERFACE.md')) {
    try {
      const iface = await ctx.readFile('INTERFACE.md');
      const apiSection = iface.match(/## Exported APIs[\s\S]*?(?=\n## |$)/);
      if (apiSection) {
        const apis = apiSection[0].match(/(?:GET|POST|PUT|DELETE|PATCH)\s+\S+/g) || [];
        const affected = [];
        for (const api of apis) {
          const endpoint = api.split(/\s+/)[1];
          const parts = endpoint.split('/').filter(Boolean);
          if (parts.some((p) => lower.includes(p.toLowerCase()))) {
            affected.push(api);
          }
        }
        if (affected.length > 0) {
          lines.push('Affected APIs:');
          for (const api of affected) {
            lines.push(`  - ${api} (INTERFACE.md)`);
          }
          deployFlag = true;
        }
      }
    } catch { /* non-critical */ }
  }

  // Check registry.md for downstream projects
  if (ctx.exists('registry.md')) {
    try {
      const registry = await ctx.readFile('registry.md');
      const rows = registry.split('\n').filter((l) => l.startsWith('|') && !l.includes('---'));
      const downstream = [];

      for (const row of rows) {
        const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
        const name = cells[0];
        if (name && name !== '프로젝트' && name !== 'Project') {
          downstream.push(name);
        }
      }

      if (downstream.length > 0) {
        lines.push('');
        lines.push('Downstream projects in registry:');
        for (const proj of downstream) {
          lines.push(`  - ${proj}`);
        }
      }
    } catch { /* non-critical */ }
  }

  // Keyword-based flag detection
  const securityKeywords = ['auth', 'login', 'session', 'token', 'password', 'permission', 'role', 'oauth', 'jwt', '인증', '세션', '권한'];
  const deployKeywords = ['api', 'endpoint', 'route', 'schema', 'migration', 'database', 'config'];

  if (securityKeywords.some((k) => lower.includes(k))) {
    securityFlag = true;
    lines.push('');
    lines.push('Security-related keywords detected → security pre-analysis recommended');
  }

  if (deployKeywords.some((k) => lower.includes(k))) {
    deployFlag = true;
  }

  if (lines.length === 0) {
    lines.push('No direct API or downstream impact detected.');
    lines.push('Standard development pipeline recommended.');
  }

  return { summary: lines.join('\n'), deployFlag, securityFlag };
}

/**
 * Decompose a high-complexity feature into sub-tasks (preliminary hint).
 * planner agent will refine this.
 */
export function generateDecomposition(description) {
  const parts = description
    .split(/(?:,\s*(?:and\s+)?|;\s*|\band\b\s+)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 3);

  if (parts.length <= 1) {
    return '<!-- Governor planner will decompose this feature -->';
  }

  const lines = ['PARALLEL_HINT (preliminary — planner will refine):', ''];
  parts.forEach((part, i) => {
    lines.push(`- Sub-task ${i + 1}: ${part}`);
  });

  return lines.join('\n');
}
