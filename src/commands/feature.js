/**
 * sentix feature — 기능 추가 워크플로우
 *
 * sentix feature add "설명"            — 기능 티켓 생성 + Governor 파이프라인 실행
 * sentix feature list [--status open]  — 기능 목록
 * sentix feature impact <id|"설명">     — 영향 분석
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import {
  loadIndex, addTicket, nextTicketId, createTicketEntry, findTicket,
} from '../lib/ticket-index.js';

registerCommand('feature', {
  description: 'Manage feature development (add | list | impact)',
  usage: 'sentix feature <add|list|impact> [args...]',

  async run(args, ctx) {
    const subcommand = args[0];

    if (subcommand === 'add') {
      await addFeature(args.slice(1), ctx);
    } else if (!subcommand || subcommand === 'list') {
      await listFeatures(args.slice(1), ctx);
    } else if (subcommand === 'impact') {
      await analyzeImpact(args.slice(1), ctx);
    } else {
      ctx.error(`Unknown subcommand: ${subcommand}`);
      ctx.log('Usage: sentix feature <add|list|impact> [args...]');
    }
  },
});

// ── Complexity keywords ───────────────────────────────

const COMPLEXITY_KEYWORDS = {
  high: ['api', 'database', 'auth', 'migration', 'multi-tenant', 'real-time', 'websocket', 'oauth', '인증', '데이터베이스', '마이그레이션'],
  medium: ['form', 'validation', 'upload', 'notification', 'cache', 'filter', 'search', '폼', '알림', '캐시'],
};

function assessComplexity(description) {
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

// ── sentix feature add ────────────────────────────────

async function addFeature(args, ctx) {
  const description = args.join(' ').trim();
  if (!description) {
    ctx.error('Usage: sentix feature add "feature description"');
    return;
  }

  const complexity = assessComplexity(description);
  const id = await nextTicketId(ctx, 'feat');
  const title = description.length > 80 ? description.slice(0, 77) + '...' : description;

  ctx.log(`Feature: ${title}`);
  ctx.log(`Complexity: ${complexity}\n`);

  // Impact analysis
  const impact = await getImpactData(description, ctx);

  // Create ticket entry
  const entry = createTicketEntry({
    id,
    type: 'feature',
    title,
    severity: null,
    description,
  });

  // Generate markdown
  const md = `# ${id}: ${title}

- **Status:** open
- **Complexity:** ${complexity}
- **Deploy flag:** ${impact.deployFlag}
- **Security flag:** ${impact.securityFlag}
- **Created:** ${entry.created_at}

## Description

${description}

## Impact Analysis

${impact.summary}

## Decomposition

${complexity === 'high' ? generateDecomposition(description) : '<!-- N/A — low/medium complexity -->'}

## Acceptance Criteria

<!-- Populated by planner agent -->
`;

  await ctx.writeFile(entry.file_path, md);
  await addTicket(ctx, entry);

  // Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'feature:add',
    id,
    complexity,
    title,
  });

  ctx.success(`Created ${id}: ${title}`);
  ctx.log(`  Complexity:     ${complexity}`);
  ctx.log(`  Deploy flag:    ${impact.deployFlag}`);
  ctx.log(`  Security flag:  ${impact.securityFlag}`);
  ctx.log(`  File:           ${entry.file_path}`);

  // Ask whether to run pipeline
  ctx.log('');
  ctx.log('To run the Governor pipeline for this feature:');
  ctx.log(`  sentix run "Execute feature ticket ${id}: ${title}"`);

  // Check if Claude Code is available for auto-run hint
  const claudeCheck = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
  if (claudeCheck.error) {
    ctx.warn('Claude Code CLI not found — install to run the pipeline');
  }
}

// ── sentix feature list ───────────────────────────────

async function listFeatures(args, ctx) {
  ctx.log('=== Features ===\n');

  let entries = await loadIndex(ctx);
  entries = entries.filter(e => e.type === 'feature');

  // Parse --status filter
  const statusIdx = args.indexOf('--status');
  if (statusIdx !== -1 && args[statusIdx + 1]) {
    const status = args[statusIdx + 1];
    entries = entries.filter(e => e.status === status);
  }

  if (entries.length === 0) {
    ctx.log('  (no features)');
    ctx.log('\n  Create one: sentix feature add "description"');
    return;
  }

  // Read complexity from ticket files
  ctx.log(`  ${'ID'.padEnd(12)} ${'COMPLEXITY'.padEnd(12)} ${'STATUS'.padEnd(14)} TITLE`);
  ctx.log(`  ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(14)} ${'─'.repeat(30)}`);

  for (const e of entries) {
    let complexity = '-';
    if (ctx.exists(e.file_path)) {
      try {
        const content = await ctx.readFile(e.file_path);
        const match = content.match(/\*\*Complexity:\*\*\s*(\w+)/);
        if (match) complexity = match[1];
      } catch { /* use default */ }
    }
    ctx.log(`  ${e.id.padEnd(12)} ${complexity.padEnd(12)} ${e.status.padEnd(14)} ${e.title}`);
  }

  ctx.log(`\n  Total: ${entries.length} feature(s)`);
}

// ── sentix feature impact ─────────────────────────────

async function analyzeImpact(args, ctx) {
  const input = args.join(' ').trim();
  if (!input) {
    ctx.error('Usage: sentix feature impact <feature-id | "description">');
    return;
  }

  // Resolve description: check if it's a ticket ID first
  let description = input;
  const ticket = await findTicket(ctx, input);
  if (ticket && ctx.exists(ticket.file_path)) {
    const content = await ctx.readFile(ticket.file_path);
    const descMatch = content.match(/## Description\n\n([\s\S]*?)(?=\n## |\n$)/);
    if (descMatch) description = descMatch[1].trim();
  }

  ctx.log('=== Impact Analysis ===\n');

  const impact = await getImpactData(description, ctx);

  ctx.log(impact.summary);
  ctx.log('');
  ctx.log('--- Flags ---');
  ctx.log(`  DEPLOY_FLAG:   ${impact.deployFlag}`);
  ctx.log(`  SECURITY_FLAG: ${impact.securityFlag}`);
  ctx.log('');

  const complexity = assessComplexity(description);
  ctx.log(`  Recommendation: COMPLEXITY ${complexity}`);
  if (impact.securityFlag) {
    ctx.log('  → Run with security pre-analysis');
  }

  // Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'feature:impact',
    input,
    deploy_flag: impact.deployFlag,
    security_flag: impact.securityFlag,
  });
}

// ── Impact analysis engine ────────────────────────────

async function getImpactData(description, ctx) {
  const lower = description.toLowerCase();
  const lines = [];
  let deployFlag = false;
  let securityFlag = false;

  // Check INTERFACE.md for affected APIs
  if (ctx.exists('INTERFACE.md')) {
    try {
      const iface = await ctx.readFile('INTERFACE.md');

      // Extract exported API entries
      const apiSection = iface.match(/## Exported APIs[\s\S]*?(?=\n## |$)/);
      if (apiSection) {
        const apis = apiSection[0].match(/(?:GET|POST|PUT|DELETE|PATCH)\s+\S+/g) || [];
        const affected = [];
        for (const api of apis) {
          const endpoint = api.split(/\s+/)[1];
          const parts = endpoint.split('/').filter(Boolean);
          if (parts.some(p => lower.includes(p.toLowerCase()))) {
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
      // Parse markdown table rows (skip header and separator)
      const rows = registry.split('\n').filter(l => l.startsWith('|') && !l.includes('---'));
      const downstream = [];

      for (const row of rows) {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean);
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

  if (securityKeywords.some(k => lower.includes(k))) {
    securityFlag = true;
    lines.push('');
    lines.push('Security-related keywords detected → security pre-analysis recommended');
  }

  if (deployKeywords.some(k => lower.includes(k))) {
    deployFlag = true;
  }

  if (lines.length === 0) {
    lines.push('No direct API or downstream impact detected.');
    lines.push('Standard development pipeline recommended.');
  }

  return {
    summary: lines.join('\n'),
    deployFlag,
    securityFlag,
  };
}

// ── Feature decomposition for high complexity ─────────

function generateDecomposition(description) {
  // Split at logical boundaries
  const parts = description
    .split(/(?:,\s*(?:and\s+)?|;\s*|\band\b\s+)/i)
    .map(p => p.trim())
    .filter(p => p.length > 3);

  if (parts.length <= 1) {
    return '<!-- Governor planner will decompose this feature -->';
  }

  const lines = ['PARALLEL_HINT (preliminary — planner will refine):', ''];
  parts.forEach((part, i) => {
    lines.push(`- Sub-task ${i + 1}: ${part}`);
  });

  return lines.join('\n');
}
