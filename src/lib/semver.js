/**
 * Minimal semver utilities — zero external dependencies.
 *
 * parse("2.0.1")          → { major:2, minor:0, patch:1 }
 * bump("2.0.1", "minor")  → "2.1.0"
 * compare("2.0.1","2.1.0") → -1
 */

export function parseSemver(version) {
  const clean = String(version).replace(/^v/i, '');
  const [major, minor, patch] = clean.split('.').map(Number);
  if ([major, minor, patch].some(n => !Number.isFinite(n) || n < 0)) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return { major, minor, patch };
}

export function bumpSemver(version, type) {
  const v = parseSemver(version);
  switch (type) {
    case 'major': return `${v.major + 1}.0.0`;
    case 'minor': return `${v.major}.${v.minor + 1}.0`;
    case 'patch': return `${v.major}.${v.minor}.${v.patch + 1}`;
    default: throw new Error(`Unknown bump type: ${type} (use major|minor|patch)`);
  }
}

export function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  for (const key of ['major', 'minor', 'patch']) {
    if (va[key] < vb[key]) return -1;
    if (va[key] > vb[key]) return 1;
  }
  return 0;
}

export function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}
