/**
 * CHANGELOG.md auto-generation from git commits + ticket index.
 *
 * Format:
 *   ## [x.y.z] — YYYY-MM-DD
 *   ### Category
 *   - entry
 *
 * Commit convention:
 *   feat: → New Features
 *   fix:  → Bug Fixes
 *   ci:   → CI/CD
 *   docs: → Documentation
 *   chore: → Improvements
 *   refactor: → Improvements
 */

import { execSync } from 'node:child_process';
import { loadIndex } from './ticket-index.js';

/**
 * Parse conventional commit messages from git log since last tag.
 */
function getCommitsSinceLastTag(cwd) {
  // Find last tag
  let range = '';
  try {
    const lastTag = execSync('git describe --tags --abbrev=0 HEAD~1 2>/dev/null', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (lastTag) range = `${lastTag}..HEAD`;
  } catch {
    // No previous tag — use all commits (limit 50)
    range = 'HEAD~50..HEAD';
  }

  try {
    const log = execSync(`git log ${range} --pretty=format:"%s" 2>/dev/null`, {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return log ? log.split('\n') : [];
  } catch {
    return [];
  }
}

/**
 * Categorize commit messages by conventional commit prefix.
 */
function categorizeCommits(messages) {
  const categories = {
    'New Features': [],
    'Bug Fixes': [],
    'Security Fixes': [],
    'CI/CD': [],
    'Documentation': [],
    'Improvements': [],
  };

  for (const msg of messages) {
    // Skip version bump commits
    if (msg.startsWith('chore: bump version')) continue;
    if (msg.startsWith('Merge pull request')) continue;

    const cleaned = msg.replace(/^"(.*)"$/, '$1');

    if (/^feat(\(.+?\))?:\s/.test(cleaned)) {
      categories['New Features'].push(`- ${cleaned.replace(/^feat(\(.+?\))?:\s*/, '')}`);
    } else if (/^fix(\(.+?\))?:\s/.test(cleaned)) {
      categories['Bug Fixes'].push(`- ${cleaned.replace(/^fix(\(.+?\))?:\s*/, '')}`);
    } else if (/^security(\(.+?\))?:\s/.test(cleaned)) {
      categories['Security Fixes'].push(`- ${cleaned.replace(/^security(\(.+?\))?:\s*/, '')}`);
    } else if (/^ci(\(.+?\))?:\s/.test(cleaned)) {
      categories['CI/CD'].push(`- ${cleaned.replace(/^ci(\(.+?\))?:\s*/, '')}`);
    } else if (/^docs(\(.+?\))?:\s/.test(cleaned)) {
      categories['Documentation'].push(`- ${cleaned.replace(/^docs(\(.+?\))?:\s*/, '')}`);
    } else if (/^(chore|refactor|perf|style)(\(.+?\))?:\s/.test(cleaned)) {
      categories['Improvements'].push(`- ${cleaned.replace(/^(chore|refactor|perf|style)(\(.+?\))?:\s*/, '')}`);
    } else if (cleaned.trim()) {
      categories['Improvements'].push(`- ${cleaned}`);
    }
  }

  return categories;
}

/**
 * Auto-detect bump type from commit messages.
 *
 * Rules:
 *   BREAKING CHANGE or feat!: → major
 *   feat: → minor
 *   fix:/ci:/docs:/chore: → patch
 */
export function detectBumpType(messages) {
  let hasBreaking = false;
  let hasFeat = false;

  for (const msg of messages) {
    if (msg.includes('BREAKING CHANGE') || /^[a-z]+!:/.test(msg)) {
      hasBreaking = true;
    }
    if (/^feat(\(.+?\))?:\s/.test(msg)) {
      hasFeat = true;
    }
  }

  if (hasBreaking) return 'major';
  if (hasFeat) return 'minor';
  return 'patch';
}

/**
 * Build changelog entries from git commits + resolved tickets.
 */
export async function buildFromTickets(ctx) {
  // Start with commit-based categories
  const commits = getCommitsSinceLastTag(ctx.cwd);
  const categories = categorizeCommits(commits);

  // Merge ticket-based entries
  try {
    const entries = await loadIndex(ctx);
    const resolved = entries.filter(e =>
      e.status === 'resolved' || e.status === 'closed'
    );

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
  } catch {
    // ticket index not available — commits only
  }

  return categories;
}

/**
 * Generate a formatted changelog entry string.
 */
export function generateChangelogEntry(version, date, categories) {
  const lines = [`## [${version}] — ${date}`, ''];

  let hasContent = false;
  for (const [category, items] of Object.entries(categories)) {
    if (items.length > 0) {
      hasContent = true;
      lines.push(`### ${category}`, '');
      // Deduplicate
      const unique = [...new Set(items)];
      for (const item of unique) {
        lines.push(item);
      }
      lines.push('');
    }
  }

  if (!hasContent) {
    lines.push('- Maintenance release', '');
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
 * Generate a changelog entry from git commits + tickets for a given version.
 */
export async function generateForVersion(ctx, version) {
  const date = new Date().toISOString().slice(0, 10);
  const categories = await buildFromTickets(ctx);
  return generateChangelogEntry(version, date, categories);
}
