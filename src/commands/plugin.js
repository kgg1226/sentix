/**
 * sentix plugin — 플러그인 관리
 *
 * sentix plugin list   — 등록된 플러그인 목록
 * sentix plugin create — 새 플러그인 스캐폴딩
 */

import { registerCommand, getAllCommands } from '../registry.js';

registerCommand('plugin', {
  description: 'Manage plugins (list | create)',
  usage: 'sentix plugin <list|create> [name]',

  async run(args, ctx) {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'list') {
      await listPlugins(ctx);
    } else if (subcommand === 'create') {
      const name = args[1];
      if (!name) {
        ctx.error('Usage: sentix plugin create <name>');
        return;
      }
      await createPlugin(name, ctx);
    } else {
      ctx.error(`Unknown subcommand: ${subcommand}`);
      ctx.log('Usage: sentix plugin <list|create> [name]');
    }
  },
});

async function listPlugins(ctx) {
  ctx.log('=== Registered Commands ===\n');

  const cmds = getAllCommands();
  for (const [name, cmd] of cmds) {
    ctx.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }

  ctx.log('');

  // Check for project-local plugins
  if (ctx.exists('.sentix/plugins')) {
    ctx.log('--- Project Plugins ---\n');
    const { readdir } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    try {
      const files = await readdir(resolve(ctx.cwd, '.sentix/plugins'));
      const plugins = files.filter(f => f.endsWith('.js'));
      if (plugins.length > 0) {
        for (const p of plugins) {
          ctx.log(`  .sentix/plugins/${p}`);
        }
      } else {
        ctx.log('  (none)');
      }
    } catch {
      ctx.log('  (none)');
    }
  } else {
    ctx.log('Project plugins: (none — create with: sentix plugin create <name>)');
  }

  ctx.log('');
}

async function createPlugin(name, ctx) {
  const safeName = name.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const path = `.sentix/plugins/${safeName}.js`;

  if (ctx.exists(path)) {
    ctx.error(`Plugin already exists: ${path}`);
    return;
  }

  const template = `/**
 * Sentix Plugin: ${safeName}
 *
 * Project-local plugin. Loaded after built-in commands and plugins.
 * Use registry.registerCommand() to add commands.
 * Use registry.registerHook() to add lifecycle hooks.
 */

import { registerCommand, registerHook } from '../../src/registry.js';

// ── Example: Register a custom command ──────────────
// registerCommand('${safeName}', {
//   description: 'My custom command',
//   usage: 'sentix ${safeName}',
//   async run(args, ctx) {
//     ctx.success('Hello from ${safeName} plugin!');
//   },
// });

// ── Example: Register a hook ────────────────────────
// registerHook('after:command', async ({ command, ctx }) => {
//   ctx.log(\`[${safeName}] Command "\${command}" finished\`);
// });
`;

  await ctx.writeFile(path, template);
  ctx.success(`Created ${path}`);
  ctx.log(`Edit the file to add your custom commands or hooks.`);
}
