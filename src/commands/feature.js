/**
 * sentix feature — 기능 추가 워크플로우
 *
 * sentix feature add "설명"            — 기능 티켓 생성 + Governor 파이프라인 실행
 * sentix feature list [--status open]  — 기능 목록
 * sentix feature impact <id|"설명">     — 영향 분석
 */

import { registerCommand } from '../registry.js';
import {
  loadIndex, addTicket, nextTicketId, createTicketEntry, findTicket,
} from '../lib/ticket-index.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';
import {
  assessComplexity,
  getImpactData,
  generateDecomposition,
} from '../lib/feature-impact.js';
import { runCommandRoutine, routineFail } from '../lib/command-routine.js';

const { dim, bold, red, green, yellow, cyan } = colors;

function complexityBadge(complexity) {
  if (complexity === 'high')   return red(complexity);
  if (complexity === 'medium') return yellow(complexity);
  if (complexity === 'low')    return green(complexity);
  return dim(complexity || '-');
}

function statusBadgeFeature(status) {
  if (status === 'open')        return yellow(status);
  if (status === 'in_progress') return cyan(status);
  if (status === 'closed')      return dim(status);
  return dim(status || '-');
}

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

  const routine = await runCommandRoutine(ctx, {
    name: 'feature:add',
    targets: ['tasks/tickets/index.json', entry.file_path, 'tasks/pattern-log.jsonl'],
  }, {
    async validate() {
      if (!id || !entry.file_path) {
        routineFail('validate', 'feature id or file_path missing',
          'Check nextTicketId()/createTicketEntry() output.');
      }
      const existing = await loadIndex(ctx);
      if (existing.some((e) => e.id === id)) {
        routineFail('validate', `feature id collision: ${id}`,
          'Delete the stale entry or increment the id manually.');
      }
    },
    async execute() {
      await ctx.writeFile(entry.file_path, md);
      await addTicket(ctx, entry);
      await ctx.appendJSONL('tasks/pattern-log.jsonl', {
        ts: new Date().toISOString(),
        event: 'feature:add',
        id,
        complexity,
        title,
      });
    },
    async verify() {
      if (!ctx.exists(entry.file_path)) {
        routineFail('verify', `feature markdown not written: ${entry.file_path}`,
          'Check filesystem permissions on tasks/tickets/.');
      }
      const entries = await loadIndex(ctx);
      if (!entries.some((e) => e.id === id)) {
        routineFail('verify', `feature ${id} missing from index after write`,
          'Inspect tasks/tickets/index.json integrity.');
      }
    },
  });

  if (!routine.ok) {
    process.exitCode = 1;
    return;
  }

  ctx.log('');
  ctx.log(`  ${green('●')} ${bold('기능 티켓 생성')}  ${cyan(id)}`);
  ctx.log(`  ${dim('제목     ')}  ${title}`);
  ctx.log(`  ${dim('복잡도   ')}  ${complexityBadge(complexity)}`);
  ctx.log(`  ${dim('배포 플래그')} ${impact.deployFlag ? yellow('true') : dim('false')}`);
  ctx.log(`  ${dim('보안 플래그')} ${impact.securityFlag ? red('true') : dim('false')}`);
  ctx.log(`  ${dim('파일     ')}  ${dim(entry.file_path)}`);
  ctx.log('');
  ctx.log(`  ${green('→')} ${dim('다음:')} ${dim('sentix run "FEATURE 파이프라인 진행 ' + id + '"')}`);
  ctx.log('');
}

// ── sentix feature list ───────────────────────────────

async function listFeatures(args, ctx) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Features')) + dim('  ·  기능 개발 워크플로우'));
  ctx.log('');

  let entries = await loadIndex(ctx);
  const totalAll = entries.filter((e) => e.type === 'feature').length;
  entries = entries.filter((e) => e.type === 'feature');

  // Parse --status filter
  const statusIdx = args.indexOf('--status');
  let statusFilter = null;
  if (statusIdx !== -1 && args[statusIdx + 1]) {
    statusFilter = args[statusIdx + 1];
    entries = entries.filter((e) => e.status === statusFilter);
  }

  if (totalAll === 0) {
    ctx.log(`  ${dim('상태')}  ${yellow('없음')}`);
    ctx.log('');
    ctx.log(borders.top);
    ctx.log(cardTitle('FEATURES'));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${dim('· 아직 생성된 기능 티켓이 없습니다')}`));
    ctx.log(cardLine(`  ${dim('└')} ${dim('sentix feature add "<설명>"')}`));
    ctx.log(borders.bottom);
    ctx.log('');
    return;
  }

  if (entries.length === 0) {
    ctx.log(`  ${dim('필터')}  ${dim(statusFilter || '')}`);
    ctx.log(`  ${dim('결과')}  ${yellow('일치하는 기능 없음')} ${dim(`(전체 ${totalAll}개)`)}`);
    ctx.log('');
    return;
  }

  // Read complexity from ticket files
  const enriched = [];
  for (const e of entries) {
    let complexity = null;
    if (ctx.exists(e.file_path)) {
      try {
        const content = await ctx.readFile(e.file_path);
        const match = content.match(/\*\*Complexity:\*\*\s*(\w+)/);
        if (match) complexity = match[1];
      } catch { /* use default */ }
    }
    enriched.push({ ...e, complexity });
  }

  // ── 통계 ──────────────────────────────────────────
  const byStatus = { open: 0, in_progress: 0, closed: 0 };
  const byComplexity = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const e of enriched) {
    if (byStatus[e.status] !== undefined) byStatus[e.status]++;
    if (e.complexity && byComplexity[e.complexity] !== undefined) byComplexity[e.complexity]++;
    else if (!e.complexity) byComplexity.unknown++;
  }

  ctx.log(`  ${dim('총   ')}  ${enriched.length}${enriched.length < totalAll ? dim(` / ${totalAll} (필터됨)`) : ''}`);
  const sLine = [
    byStatus.open        > 0 ? `${yellow('open')} ${byStatus.open}` : null,
    byStatus.in_progress > 0 ? `${cyan('in_progress')} ${byStatus.in_progress}` : null,
    byStatus.closed      > 0 ? `${dim('closed')} ${byStatus.closed}` : null,
  ].filter(Boolean).join('  ');
  if (sLine) ctx.log(`  ${dim('상태 ')}  ${sLine}`);
  const cLine = [
    byComplexity.high   > 0 ? `${red('high')} ${byComplexity.high}` : null,
    byComplexity.medium > 0 ? `${yellow('medium')} ${byComplexity.medium}` : null,
    byComplexity.low    > 0 ? `${green('low')} ${byComplexity.low}` : null,
  ].filter(Boolean).join('  ');
  if (cLine) ctx.log(`  ${dim('복잡도')} ${cLine}`);
  ctx.log('');

  // ── 카드 ──────────────────────────────────────────
  ctx.log(borders.top);
  ctx.log(cardTitle('FEATURES', dim(`${enriched.length}`)));
  ctx.log(borders.mid);

  const idWidth = Math.max(8, ...enriched.map((e) => e.id.length));
  for (const e of enriched) {
    const id = e.id.padEnd(idWidth);
    const cmp = e.complexity ? complexityBadge(e.complexity) : dim('-');
    const cmpPad = ' '.repeat(Math.max(0, 8 - (e.complexity?.length || 1)));
    const status = statusBadgeFeature(e.status);
    const stPad = ' '.repeat(Math.max(0, 13 - (e.status?.length || 1)));
    ctx.log(cardLine(`${cyan(id)}  ${cmp}${cmpPad} ${status}${stPad} ${e.title}`));
  }
  ctx.log(borders.bottom);
  ctx.log('');
  ctx.log(`  ${dim('영향 분석:')} ${dim('sentix feature impact <id>')}`);
  ctx.log('');
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

  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Impact')) + dim('  ·  영향 분석'));
  ctx.log('');

  const impact = await getImpactData(description, ctx);
  const complexity = assessComplexity(description);

  // ── 핵심 요약 ────────────────────────────────────
  ctx.log(`  ${dim('대상  ')}  ${ticket ? cyan(ticket.id) + dim(' — ') : ''}${description.length > 50 ? description.slice(0, 49) + '…' : description}`);
  ctx.log(`  ${dim('복잡도')}  ${complexityBadge(complexity)}`);
  ctx.log(`  ${dim('배포  ')}  ${impact.deployFlag ? yellow('● 필요') : dim('○ 불필요')}`);
  ctx.log(`  ${dim('보안  ')}  ${impact.securityFlag ? red('● 필요') : dim('○ 불필요')}`);
  ctx.log('');

  // ── 카드: 분석 상세 ──────────────────────────────
  const summaryLines = impact.summary.split('\n').filter(Boolean);
  ctx.log(borders.top);
  ctx.log(cardTitle('영향 분석'));
  ctx.log(borders.mid);
  if (summaryLines.length === 0) {
    ctx.log(cardLine(`${dim('· 특별히 감지된 영향 없음')}`));
  } else {
    for (const line of summaryLines) {
      ctx.log(cardLine(line));
    }
  }
  ctx.log(borders.bottom);
  ctx.log('');

  if (impact.securityFlag) {
    ctx.log(`  ${red('●')} ${dim('권장:')} ${dim('security pre-analysis 와 함께 실행')}`);
    ctx.log('');
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

