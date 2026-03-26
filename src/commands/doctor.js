/**
 * sentix doctor — 설치 상태 진단
 *
 * CLAUDE.md, tasks/, Claude Code, git, deprecated 파일 등을 확인.
 * Exits with code 1 if issues are found.
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';

registerCommand('doctor', {
  description: 'Diagnose Sentix installation health',
  usage: 'sentix doctor',

  async run(_args, ctx) {
    ctx.log('=== Sentix Doctor ===\n');

    let issues = 0;

    // ── Required files ──────────────────────────────
    const required = [
      { path: 'CLAUDE.md', label: 'CLAUDE.md (execution doc)' },
      { path: 'FRAMEWORK.md', label: 'FRAMEWORK.md (design doc)' },
      { path: '.sentix/config.toml', label: '.sentix/config.toml' },
      { path: '.sentix/rules/hard-rules.md', label: '.sentix/rules/hard-rules.md' },
      { path: 'tasks/lessons.md', label: 'tasks/lessons.md' },
      { path: 'tasks/patterns.md', label: 'tasks/patterns.md' },
      { path: 'tasks/predictions.md', label: 'tasks/predictions.md' },
    ];

    for (const { path, label } of required) {
      if (ctx.exists(path)) {
        ctx.success(label);
      } else {
        ctx.error(`${label} — MISSING`);
        issues++;
      }
    }

    // ── tasks/ structure ────────────────────────────
    const taskDirs = ['tasks/tickets'];
    for (const dir of taskDirs) {
      if (ctx.exists(dir)) {
        ctx.success(`${dir}/`);
      } else {
        ctx.warn(`${dir}/ — missing (will be created on first run)`);
      }
    }

    // Ticket index
    if (ctx.exists('tasks/tickets/index.json')) {
      ctx.success('tasks/tickets/index.json (ticket index)');
    } else {
      ctx.warn('tasks/tickets/index.json — missing (create with: sentix ticket create)');
    }

    // CHANGELOG
    if (ctx.exists('CHANGELOG.md')) {
      ctx.success('CHANGELOG.md');
    } else {
      ctx.warn('CHANGELOG.md — missing (create with: sentix version bump)');
    }

    // ── Deprecated files ────────────────────────────
    ctx.log('\n--- Deprecated Files ---\n');

    const deprecated = [
      'AGENTS.md',
      'DESIGN.md',
      'PATTERN-ENGINE.md',
      'VISUAL-PERCEPTION.md',
      'LEARNING-PIPELINE.md',
      'SELF-EVOLUTION.md',
    ];

    let hasDeprecated = false;
    for (const file of deprecated) {
      if (ctx.exists(file)) {
        ctx.warn(`${file} — deprecated (content merged into FRAMEWORK.md)`);
        hasDeprecated = true;
        issues++;
      }
    }

    if (!hasDeprecated) {
      ctx.success('No deprecated files found');
    }

    // ── CLAUDE.md references check ──────────────────
    if (ctx.exists('CLAUDE.md')) {
      const claude = await ctx.readFile('CLAUDE.md');
      if (claude.includes('AGENTS.md')) {
        ctx.warn('CLAUDE.md references AGENTS.md — should be FRAMEWORK.md');
        issues++;
      }
    }

    // ── Multi-project files ─────────────────────────
    ctx.log('\n--- Multi-Project ---\n');

    if (ctx.exists('INTERFACE.md')) {
      ctx.success('INTERFACE.md (API contract)');
    } else {
      ctx.warn('INTERFACE.md — not found (needed for multi-project cross-reference)');
    }

    if (ctx.exists('registry.md')) {
      ctx.success('registry.md (project registry)');
    } else {
      ctx.warn('registry.md — not found (needed for multi-project cascade)');
    }

    // ── External tools ──────────────────────────────
    ctx.log('\n--- External Tools ---\n');

    // Git
    const git = spawnSync('git', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (git.status === 0) {
      ctx.success(`git: ${git.stdout.trim()}`);
    } else {
      ctx.error('git: not found');
      issues++;
    }

    // Node.js
    const node = spawnSync('node', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (node.status === 0) {
      const ver = node.stdout.trim();
      const major = parseInt(ver.replace('v', ''));
      if (major >= 18) {
        ctx.success(`node: ${ver}`);
      } else {
        ctx.warn(`node: ${ver} (18+ recommended)`);
        issues++;
      }
    } else {
      ctx.error('node: not found');
      issues++;
    }

    // Claude Code
    const claude = spawnSync('claude', ['--version'], { encoding: 'utf-8', stdio: 'pipe' });
    if (claude.status === 0) {
      ctx.success('claude: installed');
    } else {
      ctx.warn('claude: not found (needed for sentix run)');
    }

    // ── Summary ─────────────────────────────────────
    ctx.log('');
    if (issues === 0) {
      ctx.success('All checks passed!');
    } else {
      ctx.warn(`${issues} issue(s) found. Run 'sentix init' to fix missing files.`);
      process.exitCode = 1;
    }
    ctx.log('');
  },
});
