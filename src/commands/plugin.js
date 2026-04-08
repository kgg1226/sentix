/**
 * sentix plugin — 플러그인 관리
 *
 * sentix plugin list   — 등록된 플러그인 목록
 * sentix plugin create — 새 플러그인 스캐폴딩
 */

import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { registerCommand, getAllCommands } from '../registry.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

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
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Plugins')) + dim('  ·  플러그인 관리'));
  ctx.log('');

  // 프로젝트 플러그인 수집
  let projectPlugins = [];
  if (ctx.exists('.sentix/plugins')) {
    try {
      const files = await readdir(resolve(ctx.cwd, '.sentix/plugins'));
      projectPlugins = files.filter((f) => f.endsWith('.js'));
    } catch { /* ignore */ }
  }

  const cmds = getAllCommands();

  ctx.log(`  ${dim('내장 명령')}   ${cmds.size}`);
  ctx.log(`  ${dim('프로젝트')}   ${projectPlugins.length > 0 ? projectPlugins.length : dim('(없음)')}`);
  ctx.log('');

  // ── 카드: 내장 명령 ─────────────────────────────────
  ctx.log(borders.top);
  ctx.log(cardTitle('내장 명령', dim(String(cmds.size))));
  ctx.log(borders.mid);

  // 가장 긴 이름 길이
  const nameWidth = Math.max(...[...cmds.keys()].map((k) => k.length));
  for (const [name, cmd] of cmds) {
    const pad = ' '.repeat(nameWidth - name.length);
    ctx.log(cardLine(`${cyan(name)}${pad}  ${dim(cmd.description)}`));
  }
  ctx.log(borders.bottom);
  ctx.log('');

  // ── 카드: 프로젝트 플러그인 ────────────────────────
  ctx.log(borders.top);
  ctx.log(cardTitle('프로젝트 플러그인', dim(String(projectPlugins.length))));
  ctx.log(borders.mid);
  if (projectPlugins.length > 0) {
    for (const p of projectPlugins) {
      ctx.log(cardLine(`${green('●')} ${dim('.sentix/plugins/')}${p}`));
    }
  } else {
    ctx.log(cardLine(`${dim('· 프로젝트 로컬 플러그인 없음')}`));
    ctx.log(cardLine(`  ${dim('└')} ${dim('sentix plugin create <name>')}`));
  }
  ctx.log(borders.bottom);
  ctx.log('');
}

async function createPlugin(name, ctx) {
  const safeName = name.replace(/[^a-z0-9-]/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');

  if (!safeName) {
    ctx.error('Invalid plugin name. Use alphanumeric characters and hyphens.');
    return;
  }

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
  ctx.log('');
  ctx.log(`  ${green('●')} ${bold('플러그인 생성')}  ${cyan(safeName)}`);
  ctx.log(`  ${dim('파일')}  ${dim(path)}`);
  ctx.log(`  ${dim('다음')}  ${dim('파일을 열어 registerCommand / registerHook 추가')}`);
  ctx.log('');
}
