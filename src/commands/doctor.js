/**
 * sentix doctor — 설치 상태 진단
 *
 * CLAUDE.md, tasks/, Claude Code, git, deprecated 파일 등을 확인.
 */

import { execSync } from 'node:child_process';
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

    // ── External tools ──────────────────────────────
    ctx.log('\n--- External Tools ---\n');

    // Git
    try {
      const gitVersion = execSync('git --version', { encoding: 'utf-8' }).trim();
      ctx.success(`git: ${gitVersion}`);
    } catch {
      ctx.error('git: not found');
      issues++;
    }

    // Node.js
    try {
      const nodeVersion = execSync('node --version', { encoding: 'utf-8' }).trim();
      const major = parseInt(nodeVersion.replace('v', ''));
      if (major >= 18) {
        ctx.success(`node: ${nodeVersion}`);
      } else {
        ctx.warn(`node: ${nodeVersion} (18+ recommended)`);
        issues++;
      }
    } catch {
      ctx.error('node: not found');
      issues++;
    }

    // Claude Code
    try {
      execSync('claude --version', { encoding: 'utf-8', stdio: 'pipe' });
      ctx.success('claude: installed');
    } catch {
      ctx.warn('claude: not found (needed for sentix run)');
    }

    // ── Summary ─────────────────────────────────────
    ctx.log('');
    if (issues === 0) {
      ctx.success('All checks passed!');
    } else {
      ctx.warn(`${issues} issue(s) found. Run 'sentix init' to fix missing files.`);
    }
    ctx.log('');
  },
});
