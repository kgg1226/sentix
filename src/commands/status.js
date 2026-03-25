/**
 * sentix status — Governor 상태 + Memory Layer 요약 + 진화 단계 표시
 */

import { registerCommand } from '../registry.js';

registerCommand('status', {
  description: 'Show Governor state and Memory Layer summary',
  usage: 'sentix status',

  async run(_args, ctx) {
    ctx.log('=== Sentix Status ===\n');

    // ── Governor State ──────────────────────────────
    if (ctx.exists('tasks/governor-state.json')) {
      try {
        const state = await ctx.readJSON('tasks/governor-state.json');
        ctx.log(`Governor: ${state.status || 'unknown'}`);
        ctx.log(`Cycle:    ${state.cycle_id || 'none'}`);
        ctx.log(`Phase:    ${state.current_phase || 'idle'}`);
        ctx.log(`Request:  "${state.request || ''}"`);

        if (state.plan && state.plan.length > 0) {
          ctx.log('\nPipeline:');
          for (const step of state.plan) {
            const icon = step.status === 'done' ? '✓'
              : step.status === 'running' ? '▶'
              : '○';
            ctx.log(`  ${icon} ${step.agent} — ${step.status}${step.result ? ` (${step.result})` : ''}`);
          }
        }

        if (state.retries && Object.keys(state.retries).length > 0) {
          ctx.log(`\nRetries: ${JSON.stringify(state.retries)}`);
        }
      } catch {
        ctx.warn('Could not read governor-state.json');
      }
    } else {
      ctx.log('Governor: idle (no active cycle)');
    }

    // ── Memory Layer ────────────────────────────────
    ctx.log('\n--- Memory Layer ---\n');

    // lessons.md
    if (ctx.exists('tasks/lessons.md')) {
      const lessons = await ctx.readFile('tasks/lessons.md');
      const lines = lessons.split('\n').filter(l => l.startsWith('- '));
      ctx.log(`Lessons:     ${lines.length} entries`);
    } else {
      ctx.log('Lessons:     (not initialized)');
    }

    // patterns.md
    if (ctx.exists('tasks/patterns.md')) {
      const patterns = await ctx.readFile('tasks/patterns.md');
      const lines = patterns.split('\n').filter(l => l.startsWith('- '));
      ctx.log(`Patterns:    ${lines.length} entries`);
    } else {
      ctx.log('Patterns:    (not initialized)');
    }

    // pattern-log.jsonl
    if (ctx.exists('tasks/pattern-log.jsonl')) {
      const log = await ctx.readFile('tasks/pattern-log.jsonl');
      const entries = log.trim().split('\n').filter(Boolean);
      ctx.log(`Pattern Log: ${entries.length} events`);
    } else {
      ctx.log('Pattern Log: (empty)');
    }

    // agent-metrics.jsonl
    if (ctx.exists('tasks/agent-metrics.jsonl')) {
      const metrics = await ctx.readFile('tasks/agent-metrics.jsonl');
      const entries = metrics.trim().split('\n').filter(Boolean);
      ctx.log(`Metrics:     ${entries.length} records`);
    } else {
      ctx.log('Metrics:     (empty)');
    }

    // ── Evolution Stage ─────────────────────────────
    ctx.log('\n--- Evolution ---\n');

    if (ctx.exists('.sentix/config.toml')) {
      const config = await ctx.readFile('.sentix/config.toml');

      const layers = [
        { name: 'Core (Governor + Agents)', key: 'layers.core', required: true },
        { name: 'Learning Pipeline',        key: 'layers.learning' },
        { name: 'Pattern Engine',            key: 'layers.pattern_engine' },
        { name: 'Visual Perception',         key: 'layers.visual' },
        { name: 'Self-Evolution',            key: 'layers.evolution' },
      ];

      for (const layer of layers) {
        const enabled = layer.required || isLayerEnabled(config, layer.key);
        const icon = enabled ? '●' : '○';
        ctx.log(`  ${enabled ? icon : icon} ${layer.name}${enabled ? '' : ' (disabled)'}`);
      }
    } else {
      ctx.warn('.sentix/config.toml not found. Run: sentix init');
    }

    ctx.log('');
  },
});

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
