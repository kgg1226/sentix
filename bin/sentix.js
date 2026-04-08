#!/usr/bin/env node

/**
 * sentix — Autonomous multi-agent DevSecOps pipeline CLI
 *
 * Entry point + plugin loader.
 * Loading order: src/commands/ → src/plugins/ → .sentix/plugins/ (project-local)
 */

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getAllCommands, getCommand, runHooks } from '../src/registry.js';
import { createContext } from '../src/context.js';
import { VERSION } from '../src/version.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcDir = resolve(__dirname, '..', 'src');

// ── Load built-in commands ──────────────────────────────

async function loadModules(dir) {
  if (!existsSync(dir)) return;
  const files = await readdir(dir);
  for (const file of files.sort()) {
    if (file.endsWith('.js')) {
      await import(pathToFileURL(resolve(dir, file)).href);
    }
  }
}

// ── Load project-local plugins ──────────────────────────

async function loadProjectPlugins(cwd) {
  const pluginDir = resolve(cwd, '.sentix', 'plugins');
  if (!existsSync(pluginDir)) return;
  const files = await readdir(pluginDir);
  for (const file of files.sort()) {
    if (file.endsWith('.js')) {
      await import(pathToFileURL(resolve(pluginDir, file)).href);
    }
  }
}

// ── Help ─────────────────────────────────────────────────

/** Plain command index (sentix --help) */
function showHelp() {
  console.log(`
sentix v${VERSION} — Autonomous multi-agent DevSecOps pipeline

Usage: sentix <command> [args...]

Commands:`);

  const cmds = getAllCommands();
  const maxLen = Math.max(...[...cmds.keys()].map(k => k.length));
  for (const [name, cmd] of cmds) {
    console.log(`  ${name.padEnd(maxLen + 2)} ${cmd.description}`);
  }

  console.log(`
Run 'sentix <command> --help' for details on a specific command.
`);
}

// ── Entry Screen (sentix without args) ───────────────────

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const c = (code, text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
const dim    = (t) => c('2',  t);
const bold   = (t) => c('1',  t);
const green  = (t) => c('32', t);
const yellow = (t) => c('33', t);
const cyan   = (t) => c('36', t);

/**
 * 인자 없이 `sentix` 만 입력했을 때 보여줄 친화적 진입점.
 *
 * 데이터 바다 금지: 사용자가 5초 안에 "지금 뭐 할 수 있는지" 결정하도록
 *   - 헤더: 버전 + 역할
 *   - 상태 한 줄: Governor 현재 phase
 *   - 권장 다음 액션 (상황에 따라 1-3개)
 *   - 핵심 명령 4개 그룹
 *   - 더 보기 안내
 */
async function showEntryScreen(ctx) {
  console.log('');
  console.log(` ${bold(cyan('Sentix'))} ${dim('v' + VERSION)}  ${dim('·')}  ${dim('Autonomous multi-agent DevSecOps')}`);
  console.log('');

  // ── 상태 한 줄 ──────────────────────────────────────────
  const initialized = ctx.exists('.sentix/config.toml');
  let phase = 'idle';
  let request = null;
  if (initialized && ctx.exists('tasks/governor-state.json')) {
    try {
      const state = await ctx.readJSON('tasks/governor-state.json');
      phase = state.current_phase || 'idle';
      request = state.request || null;
    } catch { /* ignore */ }
  }

  if (!initialized) {
    console.log(`  ${dim('상태')}  ${yellow('미초기화')}`);
  } else if (phase === 'idle') {
    console.log(`  ${dim('상태')}  ${dim('idle')}`);
  } else {
    console.log(`  ${dim('상태')}  ${cyan(phase)}${request ? dim('  ·  "' + truncate(request, 40) + '"') : ''}`);
  }
  console.log('');

  // ── 권장 다음 액션 (상황별) ─────────────────────────────
  const suggestions = await buildSuggestions(ctx, { initialized, phase });
  if (suggestions.length > 0) {
    console.log(`  ${bold('권장 다음 액션')}`);
    for (const s of suggestions) {
      console.log(`    ${green('→')} ${s.text}`);
      console.log(`      ${dim(s.command)}`);
    }
    console.log('');
  }

  // ── 핵심 명령 4개 그룹 ──────────────────────────────────
  const groups = [
    {
      title: '실행',
      items: [
        ['sentix run "<요청>"', 'Governor 파이프라인 실행'],
        ['sentix status',        '현재 진행 대시보드'],
      ],
    },
    {
      title: '설정',
      items: [
        ['sentix config',        '분산된 설정을 한 곳에서'],
        ['sentix profile',       '환경 프로필 전환'],
        ['sentix layer',         '진화 레이어 토글'],
      ],
    },
    {
      title: '진단 / 정비',
      items: [
        ['sentix doctor',        '설치 상태 점검'],
        ['sentix safety',        '안전어 관리'],
        ['sentix metrics',       '에이전트 메트릭'],
      ],
    },
    {
      title: '확장',
      items: [
        ['sentix init',          '프로젝트 초기화'],
        ['sentix update',        '프레임워크 업데이트'],
        ['sentix plugin',        '플러그인 관리'],
      ],
    },
  ];

  for (const g of groups) {
    console.log(`  ${bold(g.title)}`);
    for (const [cmd, desc] of g.items) {
      console.log(`    ${cmd.padEnd(24)} ${dim(desc)}`);
    }
    console.log('');
  }

  console.log(`  ${dim('전체 명령:')} ${dim('sentix --help')}     ${dim('명령별 도움:')} ${dim('sentix <command> --help')}`);
  console.log('');
}

async function buildSuggestions(ctx, { initialized, phase }) {
  const suggestions = [];

  if (!initialized) {
    suggestions.push({
      text: '먼저 프로젝트를 초기화하세요',
      command: 'sentix init',
    });
    return suggestions;
  }

  if (phase !== 'idle') {
    suggestions.push({
      text: `진행 중: ${phase} — 대시보드 확인`,
      command: 'sentix status',
    });
    return suggestions;
  }

  // idle: 상황에 따라 권장
  const safetyConfigured = ctx.exists('.sentix/safety.toml');
  if (!safetyConfigured) {
    suggestions.push({
      text: 'LLM 인젝션 방어용 안전어 설정 (선택)',
      command: 'sentix safety set <단어>',
    });
  }

  suggestions.push({
    text: '새 작업 요청',
    command: 'sentix run "<요청>"',
  });

  return suggestions;
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  // Load in order: commands → built-in plugins → project plugins
  await loadModules(resolve(srcDir, 'commands'));
  await loadModules(resolve(srcDir, 'plugins'));

  const cwd = process.cwd();
  await loadProjectPlugins(cwd);

  const [commandName, ...args] = process.argv.slice(2);

  // No args → friendly entry screen (status + suggestions + key commands)
  if (!commandName) {
    const ctx = createContext(cwd);
    await showEntryScreen(ctx);
    process.exit(0);
  }

  // --help → plain command index (reference)
  if (commandName === '--help' || commandName === '-h') {
    showHelp();
    process.exit(0);
  }

  if (commandName === '--version' || commandName === '-v') {
    console.log(`sentix v${VERSION}`);
    process.exit(0);
  }

  const cmd = getCommand(commandName);
  if (!cmd) {
    console.error(`Unknown command: ${commandName}`);
    console.error(`Run 'sentix --help' to see available commands.`);
    process.exit(1);
  }

  // Per-command --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`\n${cmd.description}\n`);
    console.log(`Usage: ${cmd.usage}\n`);
    process.exit(0);
  }

  const ctx = createContext(cwd);

  try {
    await runHooks('before:command', { command: commandName, args, ctx });
    await cmd.run(args.filter(a => a !== '--help' && a !== '-h'), ctx);
    await runHooks('after:command', { command: commandName, args, ctx });
  } catch (err) {
    ctx.error(err.message);
    process.exit(1);
  }
}

main();
