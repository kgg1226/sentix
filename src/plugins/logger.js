/**
 * Sentix Built-in Plugin: Logger
 *
 * Logs all command executions to tasks/pattern-log.jsonl.
 * This is the primary data source for the Pattern Engine (Layer 3).
 */

import { registerHook } from '../registry.js';

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
  } catch {
    // Silent
  }
});
