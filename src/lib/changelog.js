/**
 * CHANGELOG.md auto-generation from governor history and ticket index.
 *
 * Matches existing format:
 *   ## [x.y.z] — YYYY-MM-DD
 *   ### Category
 *   - entry
 */

import { loadIndex } from './ticket-index.js';

/**
 * Build changelog entries from resolved tickets since last version.
 */
export async function buildFromTickets(ctx) {
  const entries = await loadIndex(ctx);
  const resolved = entries.filter(e =>
    e.status === 'resolved' || e.status === 'closed'
  );

  const categories = {
    'New Features': [],
    'Bug Fixes': [],
    'Security Fixes': [],
    'Improvements': [],
  };

  for (const ticket of resolved) {
    const line = `- \`${ticket.id}\`: ${ticket.title}`;
    if (ticket.type === 'feature') {
      categories['New Features'].push(line);
    } else if (ticket.severity === 'critical' && ticket.title.toLowerCase().includes('security')) {
      categories['Security Fixes'].push(line);
    } else if (ticket.type === 'bug') {
      categories['Bug Fixes'].push(line);
    } else {
      categories['Improvements'].push(line);
    }
  }

  return categories;
}

/**
 * Generate a formatted changelog entry string.
 */
export function generateChangelogEntry(version, date, categories) {
  const lines = [`## [${version}] — ${date}`, ''];

  for (const [category, items] of Object.entries(categories)) {
    if (items.length > 0) {
      lines.push(`### ${category}`, '');
      for (const item of items) {
        lines.push(item);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Prepend a new entry to CHANGELOG.md, preserving existing content.
 */
export async function prependToChangelog(ctx, entry) {
  let existing = '';
  if (ctx.exists('CHANGELOG.md')) {
    existing = await ctx.readFile('CHANGELOG.md');
  }

  // Insert after the "# Changelog" header line
  const headerLine = '# Changelog';
  const headerIdx = existing.indexOf(headerLine);

  let content;
  if (headerIdx !== -1) {
    const afterHeader = headerIdx + headerLine.length;
    content = existing.slice(0, afterHeader) + '\n\n' + entry + '\n---\n' + existing.slice(afterHeader).replace(/^\n+/, '\n');
  } else {
    content = `${headerLine}\n\n${entry}\n---\n\n${existing}`;
  }

  await ctx.writeFile('CHANGELOG.md', content);
}

/**
 * Generate a changelog entry from governor-state + tickets for a given version.
 */
export async function generateForVersion(ctx, version) {
  const date = new Date().toISOString().slice(0, 10);
  const categories = await buildFromTickets(ctx);

  // Also check governor-state for the latest request
  if (ctx.exists('tasks/governor-state.json')) {
    try {
      const state = await ctx.readJSON('tasks/governor-state.json');
      if (state.status === 'completed' && state.request) {
        const line = `- ${state.request} (cycle: ${state.cycle_id})`;
        if (!Object.values(categories).flat().length) {
          categories['Improvements'].push(line);
        }
      }
    } catch {
      // Non-critical
    }
  }

  return generateChangelogEntry(version, date, categories);
}
