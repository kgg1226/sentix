/**
 * sentix version — 버전 관리
 *
 * sentix version current    — 현재 버전 표시
 * sentix version bump       — 버전 범프 + git tag + CHANGELOG
 * sentix version changelog  — CHANGELOG 미리보기 생성
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { parseSemver, bumpSemver } from '../lib/semver.js';
import { generateForVersion, prependToChangelog } from '../lib/changelog.js';

registerCommand('version', {
  description: 'Manage project version (bump | current | changelog)',
  usage: 'sentix version <bump|current|changelog> [major|minor|patch]',

  async run(args, ctx) {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'current') {
      await showCurrent(ctx);
    } else if (subcommand === 'bump') {
      const type = args[1] || 'patch';
      if (!['major', 'minor', 'patch'].includes(type)) {
        ctx.error(`Invalid bump type: ${type} (use major|minor|patch)`);
        return;
      }
      await bumpVersion(type, ctx);
    } else if (subcommand === 'changelog') {
      await showChangelog(ctx);
    } else {
      ctx.error(`Unknown subcommand: ${subcommand}`);
      ctx.log('Usage: sentix version <bump|current|changelog> [major|minor|patch]');
    }
  },
});

// ── sentix version current ────────────────────────────

async function showCurrent(ctx) {
  ctx.log('=== Sentix Version ===\n');

  // Read from package.json
  let currentVersion = 'unknown';
  if (ctx.exists('package.json')) {
    try {
      const pkg = await ctx.readJSON('package.json');
      currentVersion = pkg.version || 'unknown';
    } catch {
      ctx.warn('Could not read package.json');
    }
  }
  ctx.log(`  Version:  ${currentVersion}`);

  // Check latest git tag
  const tagResult = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  if (tagResult.status === 0 && tagResult.stdout.trim()) {
    const latestTag = tagResult.stdout.trim();
    ctx.log(`  Git Tag:  ${latestTag}`);

    // Check if current version matches the tag
    const tagVersion = latestTag.replace(/^v/i, '');
    if (tagVersion !== currentVersion) {
      ctx.warn(`  Version ${currentVersion} has no matching git tag`);
    }
  } else {
    ctx.log('  Git Tag:  (none)');
  }

  // Check INTERFACE.md version
  if (ctx.exists('INTERFACE.md')) {
    try {
      const iface = await ctx.readFile('INTERFACE.md');
      const match = iface.match(/version:\s*(\S+)/);
      if (match) {
        ctx.log(`  INTERFACE: ${match[1]}`);
        if (match[1] !== currentVersion) {
          ctx.warn('  INTERFACE.md version is out of sync');
        }
      }
    } catch { /* non-critical */ }
  }

  ctx.log('');
}

// ── sentix version bump ───────────────────────────────

async function bumpVersion(type, ctx) {
  // 1. Read current version
  if (!ctx.exists('package.json')) {
    ctx.error('package.json not found');
    return;
  }

  const pkg = await ctx.readJSON('package.json');
  const current = pkg.version;
  let newVersion;

  try {
    parseSemver(current);
    newVersion = bumpSemver(current, type);
  } catch (e) {
    ctx.error(`Cannot bump version: ${e.message}`);
    return;
  }

  ctx.log(`Bumping: ${current} → ${newVersion} (${type})\n`);

  // 2. Update package.json
  pkg.version = newVersion;
  await ctx.writeJSON('package.json', pkg);
  ctx.success('Updated package.json');

  // 3. Update INTERFACE.md version line
  if (ctx.exists('INTERFACE.md')) {
    try {
      let iface = await ctx.readFile('INTERFACE.md');
      iface = iface.replace(
        /version:\s*\S+/,
        `version: ${newVersion}`
      );
      await ctx.writeFile('INTERFACE.md', iface);
      ctx.success('Updated INTERFACE.md');
    } catch { /* non-critical */ }
  }

  // 4. Generate changelog entry
  try {
    const entry = await generateForVersion(ctx, newVersion);
    if (entry.trim()) {
      await prependToChangelog(ctx, entry);
      ctx.success('Updated CHANGELOG.md');
    }
  } catch (e) {
    ctx.warn(`Changelog generation skipped: ${e.message}`);
  }

  // 5. Git commit + tag
  const gitAdd = spawnSync('git', ['add', 'package.json', 'CHANGELOG.md', 'INTERFACE.md'], {
    cwd: ctx.cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
  });

  if (gitAdd.status === 0) {
    const commitMsg = `chore: bump version to v${newVersion}`;
    const gitCommit = spawnSync('git', ['commit', '-m', commitMsg], {
      cwd: ctx.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    if (gitCommit.status === 0) {
      ctx.success(`Committed: ${commitMsg}`);

      const gitTag = spawnSync('git', ['tag', '-a', `v${newVersion}`, '-m', `Release v${newVersion}`], {
        cwd: ctx.cwd,
        encoding: 'utf-8',
        stdio: 'pipe',
      });

      if (gitTag.status === 0) {
        ctx.success(`Tagged: v${newVersion}`);
      } else {
        ctx.warn(`Tag creation failed: ${gitTag.stderr?.trim() || 'unknown error'}`);
      }
    } else {
      ctx.warn(`Commit failed: ${gitCommit.stderr?.trim() || 'unknown error'}`);
    }
  } else {
    ctx.warn('Git staging failed — version bumped in files only');
  }

  ctx.log('');
  ctx.log('To publish:');
  ctx.log('  git push && git push --tags');

  // 6. Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'version:bump',
    from: current,
    to: newVersion,
    type,
  });
}

// ── sentix version changelog ──────────────────────────

async function showChangelog(ctx) {
  ctx.log('=== Changelog Preview ===\n');

  let currentVersion = 'next';
  if (ctx.exists('package.json')) {
    try {
      const pkg = await ctx.readJSON('package.json');
      currentVersion = pkg.version || 'next';
    } catch { /* use default */ }
  }

  try {
    const entry = await generateForVersion(ctx, currentVersion);
    if (entry.trim()) {
      ctx.log(entry);
    } else {
      ctx.log('(No resolved tickets or completed cycles to report)');
    }
  } catch (e) {
    ctx.error(`Could not generate changelog: ${e.message}`);
  }
}
