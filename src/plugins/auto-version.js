/**
 * Sentix Built-in Plugin: Auto Version Bump
 *
 * After a successful `sentix run` pipeline, automatically bumps the project version.
 * - feature ticket → minor bump
 * - bug ticket → patch bump
 *
 * Controlled by .sentix/config.toml:
 *   [version]
 *   auto_bump = true
 */

import { registerHook } from '../registry.js';
import { bumpSemver } from '../lib/semver.js';
import { generateForVersion, prependToChangelog } from '../lib/changelog.js';

registerHook('after:command', async ({ command, args, ctx }) => {
  if (command !== 'run') return;

  try {
    // Check config
    if (!await isAutoBumpEnabled(ctx)) return;

    // Check governor state
    if (!ctx.exists('tasks/governor-state.json')) return;
    const state = await ctx.readJSON('tasks/governor-state.json');
    if (state.status !== 'completed') return;

    // Determine bump type from ticket_type
    const ticketType = state.ticket_type;
    let bumpType = 'patch'; // safe default

    if (ticketType === 'feature') {
      bumpType = 'minor';
    } else if (ticketType === 'bug') {
      bumpType = 'patch';
    }

    // Read current version
    if (!ctx.exists('package.json')) return;
    const pkg = await ctx.readJSON('package.json');
    const current = pkg.version;
    if (!current) return;

    const newVersion = bumpSemver(current, bumpType);

    // Update package.json
    pkg.version = newVersion;
    await ctx.writeJSON('package.json', pkg);

    // Update CHANGELOG
    try {
      const entry = await generateForVersion(ctx, newVersion);
      if (entry.trim()) {
        await prependToChangelog(ctx, entry);
      }
    } catch { /* non-critical */ }

    // Log
    await ctx.appendJSONL('tasks/pattern-log.jsonl', {
      ts: new Date().toISOString(),
      event: 'version:auto-bump',
      from: current,
      to: newVersion,
      type: bumpType,
      trigger: `pipeline:${state.cycle_id}`,
    });

    ctx.success(`Auto version bump: ${current} → ${newVersion} (${bumpType})`);
  } catch {
    // Silent — auto-version should never break pipeline
  }
});

async function isAutoBumpEnabled(ctx) {
  if (!ctx.exists('.sentix/config.toml')) return false;
  try {
    const config = await ctx.readFile('.sentix/config.toml');
    const sectionHeader = '[version]';
    const idx = config.indexOf(sectionHeader);
    if (idx === -1) return false;
    const afterSection = config.slice(idx + sectionHeader.length);
    const nextSection = afterSection.indexOf('\n[');
    const sectionContent = nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);
    return /auto_bump\s*=\s*true/.test(sectionContent);
  } catch {
    return false;
  }
}
