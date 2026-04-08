/**
 * Minimal TOML section-based get/set.
 *
 * 전체 TOML 파서를 구현하지 않는다 — sentix 설정은 단순 key=value 구조만 사용하므로
 * 섹션 헤더 [section.name] 을 찾고, 그 내부에서 한 줄 key = value 를 파싱/수정한다.
 *
 * 외부 의존성 제로 (Node 내장만).
 * 보존 속성: 코멘트, 빈 줄, 섹션 순서 모두 원본 유지.
 */

/**
 * Read a key value from a TOML section.
 * @param {string} content - TOML file content
 * @param {string} section - e.g. "layers.pattern_engine"
 * @param {string} key - e.g. "min_confidence"
 * @returns {boolean|number|string|undefined}
 */
export function getTomlValue(content, section, key) {
  const body = extractSection(content, section);
  if (body === null) return undefined;
  const re = new RegExp(`^\\s*${escapeRe(key)}\\s*=\\s*(.+?)\\s*(?:#.*)?$`, 'm');
  const m = body.match(re);
  if (!m) return undefined;
  return parseValue(m[1].trim());
}

/**
 * Set (or insert) a key within a TOML section. Returns new content.
 * Preserves comments, blank lines, and ordering of other keys.
 *
 * @param {string} content
 * @param {string} section
 * @param {string} key
 * @param {boolean|number|string} value
 * @param {{raw?: boolean}} [options] - raw=true: emit value as-is (no quoting),
 *        useful for preserving user input like "0.70" that JS would normalize to "0.7"
 * @returns {string} new content
 */
export function setTomlValue(content, section, key, value, options = {}) {
  const formatted = options.raw === true ? String(value) : formatValue(value);
  const sectionHeader = `[${section}]`;
  const headerIdx = content.indexOf(sectionHeader);

  // Case 1: section missing — append new section at end
  if (headerIdx === -1) {
    const sep = content.endsWith('\n') || content.length === 0 ? '' : '\n';
    const lead = content.length === 0 ? '' : '\n';
    return `${content}${sep}${lead}[${section}]\n${key} = ${formatted}\n`;
  }

  // Locate section body (between this header and next header or EOF)
  const bodyStart = headerIdx + sectionHeader.length;
  const rest = content.slice(bodyStart);
  const nextHeaderRel = rest.search(/\n\[[^\]]+\]/);
  const bodyEnd = nextHeaderRel === -1 ? content.length : bodyStart + nextHeaderRel;
  const body = content.slice(bodyStart, bodyEnd);

  const keyRe = new RegExp(`^(\\s*${escapeRe(key)}\\s*=\\s*)([^\\n#]*?)(\\s*)(#.*)?$`, 'm');

  // Case 2: key exists in section — replace value, preserve trailing comment
  if (keyRe.test(body)) {
    const newBody = body.replace(keyRe, (_, lead, _old, trail, comment) => {
      return `${lead}${formatted}${trail || ''}${comment || ''}`;
    });
    return content.slice(0, bodyStart) + newBody + content.slice(bodyEnd);
  }

  // Case 3: section exists but key missing — append inside section
  // Insert before trailing blank lines of the section (if any)
  const trailingBlank = body.match(/\n+$/);
  const insertPoint = trailingBlank
    ? bodyEnd - trailingBlank[0].length
    : bodyEnd;
  const prefix = content.slice(0, insertPoint);
  const needsNewline = !prefix.endsWith('\n');
  return (
    prefix +
    (needsNewline ? '\n' : '') +
    `${key} = ${formatted}\n` +
    content.slice(insertPoint)
  );
}

/**
 * Extract the raw body of a section (between its header and the next header).
 * Returns null if section is absent.
 */
export function extractSection(content, section) {
  const header = `[${section}]`;
  const idx = content.indexOf(header);
  if (idx === -1) return null;
  const after = content.slice(idx + header.length);
  const nextRel = after.search(/\n\[[^\]]+\]/);
  return nextRel === -1 ? after : after.slice(0, nextRel);
}

// ── value parsing / formatting ──────────────────────────
function parseValue(raw) {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d*\.\d+$/.test(raw)) return parseFloat(raw);
  const strMatch = raw.match(/^"([^"]*)"$/) || raw.match(/^'([^']*)'$/);
  if (strMatch) return strMatch[1];
  return raw; // unquoted / array / other — return as-is string
}

function formatValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    // numeric string → number literal? No — keep as string for safety
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  throw new Error(`Unsupported TOML value type: ${typeof value}`);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
