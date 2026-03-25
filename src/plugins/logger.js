/**
 * Sentix Built-in Plugin: Logger
 *
 * Logs all command executions to tasks/pattern-log.jsonl.
 * This is the primary data source for the Pattern Engine (Layer 3).
 * Includes basic log rotation: truncates to last 10,000 entries when exceeding 20,000.
 */

import { registerHook } from '../registry.js';

const MAX_ENTRIES = 20_000;
const KEEP_ENTRIES = 10_000;

registerHook('before:command', async ({ command, args, ctx }) => {
  try {
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'command:start',
      command,
      args,
    });
  } catch {
    // Silent — logging should never break command execution
  }
});

registerHook('after:command', async ({ command, args, ctx }) => {
  try {
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'command:end',
      command,
      args,
    });

    // ── Log rotation ────────────────────────────────
    await rotateIfNeeded(ctx);
  } catch {
    // Silent
  }
});

async function rotateIfNeeded(ctx) {
  try {
    if (!ctx.exists('tasks/pattern-log.jsonl')) return;
    const content = await ctx.readFile('tasks/pattern-log.jsonl');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length > MAX_ENTRIES) {
      const trimmed = lines.slice(-KEEP_ENTRIES).join('\n') + '\n';
      await ctx.writeFile('tasks/pattern-log.jsonl', trimmed);
    }
  } catch {
    // Silent — rotation failure is non-critical
  }
}
