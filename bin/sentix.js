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

// ── Main ─────────────────────────────────────────────────

async function main() {
  // Load in order: commands → built-in plugins → project plugins
  await loadModules(resolve(srcDir, 'commands'));
  await loadModules(resolve(srcDir, 'plugins'));

  const cwd = process.cwd();
  await loadProjectPlugins(cwd);

  const [commandName, ...args] = process.argv.slice(2);

  if (!commandName || commandName === '--help' || commandName === '-h') {
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
