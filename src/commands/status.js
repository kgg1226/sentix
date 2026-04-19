/**
 * sentix status — Governor 상태 대시보드
 *
 * 설계 원칙:
 *   - "데이터의 바다"가 아닌 정제된 카드 (PIPELINE / TICKETS / MEMORY / LAYERS)
 *   - 파이프라인 진행을 화살표 다이어그램으로 시각화
 *   - 핵심 정보 4가지(현재 phase / 활성 티켓 / 다음 액션 / 블로커) 최상단 배치
 *   - 외부 의존성 제로 — ANSI 색상 직접
 */

import { registerCommand } from '../registry.js';
import { loadIndex } from '../lib/ticket-index.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;
const { top: BORDER_TOP, mid: BORDER_MID, bottom: BORDER_BOTTOM } = makeBorders();

// ── 파이프라인 다이어그램 ───────────────────────────────
const PIPELINE_STEPS = ['planner', 'dev', 'gate', 'pr-review', 'finalize'];

/**
 * plan 배열에서 각 step의 상태를 꺼내어 화살표 다이어그램 생성.
 * 상태: done(✓) / running(▶) / pending(○) / failed(✗)
 */
function renderPipelineDiagram(plan) {
  const statusByAgent = {};
  if (Array.isArray(plan)) {
    for (const step of plan) {
      if (step && step.agent) statusByAgent[step.agent] = step.status;
    }
  }

  const cells = PIPELINE_STEPS.map((name) => {
    const status = statusByAgent[name] || 'pending';
    const icon =
      status === 'done'    ? green('✓') :
      status === 'running' ? cyan('▶')  :
      status === 'failed'  ? red('✗')   :
                             dim('○');
    const label =
      status === 'running' ? bold(name) :
      status === 'pending' ? dim(name)  :
                             name;
    return `${icon} ${label}`;
  });

  return cells.join(dim(' → '));
}

// ── phase 요약 계산 ─────────────────────────────────────
function computeSummary(state, tickets) {
  const phase = state?.current_phase || 'idle';

  // 활성 티켓: resolved/closed는 "활성"이 아니므로 제외. 없으면 null.
  let activeTicket = null;
  if (tickets && tickets.length > 0) {
    const active = tickets.filter(
      (t) => t.status !== 'closed' && t.status !== 'resolved'
    );
    activeTicket = active[0] || null;
  }

  // 다음 액션: plan에서 첫 pending 단계
  let nextAction = null;
  if (Array.isArray(state?.plan)) {
    const next = state.plan.find((s) => s.status === 'pending');
    if (next) nextAction = `${next.agent} 실행 대기`;
    else if (state.plan.every((s) => s.status === 'done')) nextAction = '사이클 완료';
  }
  if (!nextAction) {
    if (!state || !state.cycle_id) nextAction = '요청 대기 (sentix run)';
    else if (state.status === 'idle') nextAction = '요청 대기 (sentix run)';
    else nextAction = '상태 없음';
  }

  // 블로커: 실패한 단계 또는 재시도 과다 또는 critical 티켓
  const blockers = [];
  if (Array.isArray(state?.plan)) {
    const failed = state.plan.filter((s) => s.status === 'failed');
    for (const f of failed) blockers.push(`${f.agent} 실패`);
  }
  if (state?.retries) {
    for (const [k, v] of Object.entries(state.retries)) {
      if (typeof v === 'number' && v >= 3) blockers.push(`${k} 재시도 ${v}회`);
    }
  }
  // critical 블로커는 아직 해결되지 않은 것만 — resolved/closed 제외
  const criticalOpen = (tickets || []).filter(
    (t) => t.severity === 'critical' && t.status !== 'closed' && t.status !== 'resolved'
  ).length;
  if (criticalOpen > 0) blockers.push(`critical 티켓 ${criticalOpen}개`);

  return { phase, activeTicket, nextAction, blockers };
}

// ── 메인 명령어 ─────────────────────────────────────────
registerCommand('status', {
  description: 'Show Governor state and Memory Layer summary',
  usage: 'sentix status',

  async run(_args, ctx) {
    // ── 데이터 수집 ─────────────────────────────────────
    let state = null;
    if (ctx.exists('tasks/governor-state.json')) {
      try { state = await ctx.readJSON('tasks/governor-state.json'); }
      catch { ctx.warn('governor-state.json 읽기 실패'); }
    }

    let tickets = [];
    try { tickets = await loadIndex(ctx); } catch { /* empty */ }

    const summary = computeSummary(state, tickets);

    // ── 헤더 ───────────────────────────────────────────
    ctx.log('');
    ctx.log(bold(cyan(' Sentix Governor')) + dim('  ·  status'));
    ctx.log('');

    // ── 핵심 요약 4줄 (데이터 바다 X, 정제된 핵심만) ────
    const phaseColor =
      summary.phase === 'idle' ? dim :
      summary.phase === 'failed' ? red :
      cyan;
    ctx.log(`  ${dim('현재 단계')}   ${phaseColor(summary.phase)}`);
    ctx.log(`  ${dim('활성 티켓')}   ${summary.activeTicket
      ? `${summary.activeTicket.id || '(id 없음)'} — ${summary.activeTicket.title || summary.activeTicket.description || ''}`
      : dim('없음')}`);
    ctx.log(`  ${dim('다음 액션')}   ${summary.nextAction}`);
    ctx.log(`  ${dim('블로커  ')}   ${summary.blockers.length > 0
      ? red(summary.blockers.join(', '))
      : green('없음')}`);
    ctx.log('');

    // ── CARD 1: PIPELINE ───────────────────────────────
    ctx.log(BORDER_TOP);
    ctx.log(cardTitle('PIPELINE'));
    ctx.log(BORDER_MID);
    if (state && state.cycle_id) {
      ctx.log(cardLine(`${dim('cycle')} ${state.cycle_id}`));
      if (state.request) {
        ctx.log(cardLine(`${dim('request')} "${state.request}"`));
      }
      ctx.log(cardLine(''));
      ctx.log(cardLine(renderPipelineDiagram(state.plan)));
      if (state.retries && Object.keys(state.retries).length > 0) {
        const r = Object.entries(state.retries)
          .map(([k, v]) => `${k}:${v}`).join(' ');
        ctx.log(cardLine(`${dim('retries')} ${yellow(r)}`));
      }
    } else {
      ctx.log(cardLine(dim('idle — 활성 사이클 없음')));
      ctx.log(cardLine(dim('실행: sentix run "<요청>"')));
    }
    ctx.log(BORDER_BOTTOM);
    ctx.log('');

    // ── CARD 2: TICKETS ────────────────────────────────
    ctx.log(BORDER_TOP);
    ctx.log(cardTitle('TICKETS'));
    ctx.log(BORDER_MID);
    if (tickets.length > 0) {
      const byStatus = {};
      for (const t of tickets) {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      }
      const parts = Object.entries(byStatus)
        .map(([k, v]) => {
          const color = k === 'closed' ? dim : k === 'open' ? yellow : cyan;
          return `${color(k)} ${v}`;
        });
      ctx.log(cardLine(`${dim('total')} ${tickets.length}  ·  ${parts.join('  ')}`));

      const criticalOpen = tickets.filter(
        (t) => t.severity === 'critical' && t.status !== 'closed' && t.status !== 'resolved'
      );
      if (criticalOpen.length > 0) {
        ctx.log(cardLine(red(`⚠ critical open ${criticalOpen.length}`)));
      }
    } else {
      ctx.log(cardLine(dim('티켓 없음')));
    }
    ctx.log(BORDER_BOTTOM);
    ctx.log('');

    // ── CARD 3: MEMORY ─────────────────────────────────
    ctx.log(BORDER_TOP);
    ctx.log(cardTitle('MEMORY LAYER'));
    ctx.log(BORDER_MID);
    const memRows = [
      ['lessons',  await countLines(ctx, 'tasks/lessons.md',  (l) => l.startsWith('- '))],
      ['patterns', await countLines(ctx, 'tasks/patterns.md', (l) => l.startsWith('- '))],
      ['events',   await countLines(ctx, 'tasks/pattern-log.jsonl',  Boolean)],
      ['metrics',  await countLines(ctx, 'tasks/agent-metrics.jsonl', Boolean)],
    ];
    for (const [label, count] of memRows) {
      const value = count === null
        ? dim('(없음)')
        : count === 0 ? dim('0') : String(count);
      ctx.log(cardLine(`${dim(label.padEnd(9))} ${value}`));
    }
    ctx.log(BORDER_BOTTOM);
    ctx.log('');

    // ── CARD 4: LAYERS ─────────────────────────────────
    ctx.log(BORDER_TOP);
    ctx.log(cardTitle('LAYERS'));
    ctx.log(BORDER_MID);
    if (ctx.exists('.sentix/config.toml')) {
      const config = await ctx.readFile('.sentix/config.toml');
      const layers = [
        { name: 'Core (Governor + Agents)', key: 'layers.core', required: true },
        { name: 'Learning Pipeline',        key: 'layers.learning' },
        { name: 'Pattern Engine',           key: 'layers.pattern_engine' },
        { name: 'Visual Perception',        key: 'layers.visual' },
        { name: 'Self-Evolution',           key: 'layers.evolution' },
      ];
      for (const layer of layers) {
        const enabled = layer.required || isLayerEnabled(config, layer.key);
        const icon = enabled ? green('●') : dim('○');
        const label = enabled ? layer.name : dim(layer.name);
        ctx.log(cardLine(`${icon} ${label}`));
      }
    } else {
      ctx.log(cardLine(yellow('.sentix/config.toml 없음')));
      ctx.log(cardLine(dim('실행: sentix init')));
    }
    ctx.log(BORDER_BOTTOM);
    ctx.log('');
  },
});

/** 파일이 없으면 null, 있으면 filter 통과 줄 수 반환 */
async function countLines(ctx, path, filter) {
  if (!ctx.exists(path)) return null;
  try {
    const content = await ctx.readFile(path);
    return content.split('\n').filter(filter).length;
  } catch {
    return null;
  }
}

/**
 * Parse TOML config to check if a specific layer section has enabled = true.
 * Handles per-section parsing instead of global string search.
 */
function isLayerEnabled(config, sectionKey) {
  const sectionHeader = `[${sectionKey}]`;
  const idx = config.indexOf(sectionHeader);
  if (idx === -1) return false;

  // Extract content between this section header and the next section header
  const afterSection = config.slice(idx + sectionHeader.length);
  const nextSection = afterSection.indexOf('\n[');
  const sectionContent = nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);

  // Look for enabled = true within this section only
  return /enabled\s*=\s*true/.test(sectionContent);
}
