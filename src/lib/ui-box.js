/**
 * Sentix UI Box — 카드/박스 렌더링 유틸리티
 *
 * 외부 의존성 제로. ANSI 색상 + 박스 문자 + 한글 전각 폭 처리.
 *
 * 모든 sentix CLI 명령이 동일한 시각 언어를 공유하기 위한 단일 진입점.
 * status / doctor / safety 등에서 동일하게 사용한다.
 */

// ── ANSI 색상 ─────────────────────────────────────────
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;
const c = (code, text) => useColor ? `\x1b[${code}m${text}\x1b[0m` : text;

export const colors = {
  dim:    (t) => c('2',  t),
  bold:   (t) => c('1',  t),
  red:    (t) => c('31', t),
  green:  (t) => c('32', t),
  yellow: (t) => c('33', t),
  blue:   (t) => c('34', t),
  cyan:   (t) => c('36', t),
};

// ── 박스 레이아웃 ─────────────────────────────────────
export const DEFAULT_CARD_WIDTH = 64;

/**
 * Build a box border tuple for a given width.
 * @param {number} width
 * @returns {{top: string, mid: string, bottom: string}}
 */
export function makeBorders(width = DEFAULT_CARD_WIDTH) {
  return {
    top:    '┌' + '─'.repeat(width - 2) + '┐',
    mid:    '├' + '─'.repeat(width - 2) + '┤',
    bottom: '└' + '─'.repeat(width - 2) + '┘',
  };
}

/**
 * Render a card line with proper padding and ANSI/wide-character handling.
 * @param {string} text - May contain ANSI escapes; padded to fit inside the box.
 * @param {number} [width=DEFAULT_CARD_WIDTH]
 */
export function cardLine(text, width = DEFAULT_CARD_WIDTH) {
  const visible = stripAnsi(text);
  const w = visualWidth(visible);
  const inner = width - 4; // 좌우 '│ ' ' │'
  let body;
  if (w > inner) {
    body = truncateToWidth(visible, inner - 1) + '…';
  } else {
    body = text + ' '.repeat(inner - w);
  }
  return `│ ${body} │`;
}

/**
 * Render a card title row (bold label + optional suffix like stats).
 * @param {string} label
 * @param {string} [suffix]
 * @param {number} [width=DEFAULT_CARD_WIDTH]
 */
export function cardTitle(label, suffix = '', width = DEFAULT_CARD_WIDTH) {
  const inner = width - 4;
  const titleText = colors.bold(label) + (suffix ? `  ${suffix}` : '');
  const visibleLen = visualWidth(stripAnsi(titleText));
  const pad = Math.max(0, inner - visibleLen);
  return `│ ${titleText}${' '.repeat(pad)} │`;
}

// ── 텍스트 폭 계산 (전각 한글 대응) ─────────────────

/** Strip ANSI escape sequences from a string. */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Compute the terminal display width of a string, treating East Asian
 * wide characters (Hangul, CJK, full-width punctuation) as 2 columns.
 */
export function visualWidth(str) {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115F) || // Hangul Jamo
      (code >= 0x2E80 && code <= 0x9FFF) || // CJK + Hiragana/Katakana
      (code >= 0xA000 && code <= 0xA4CF) || // Yi
      (code >= 0xAC00 && code <= 0xD7A3) || // Hangul Syllables
      (code >= 0xF900 && code <= 0xFAFF) || // CJK Compat
      (code >= 0xFE30 && code <= 0xFE4F) || // CJK Compat Forms
      (code >= 0xFF00 && code <= 0xFF60) || // Fullwidth
      (code >= 0xFFE0 && code <= 0xFFE6)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/** Truncate a string to a given visual width (transparent to wide chars). */
export function truncateToWidth(str, max) {
  let w = 0;
  let out = '';
  for (const ch of str) {
    const cw = visualWidth(ch);
    if (w + cw > max) break;
    out += ch;
    w += cw;
  }
  return out;
}

// ── 진행률 막대 ───────────────────────────────────────

/**
 * Render a fixed-width progress bar with color thresholds.
 * @param {number} ratio - 0..1
 * @param {{width?: number, showPct?: boolean}} [options]
 */
export function renderBar(ratio, { width = 18, showPct = true } = {}) {
  const r = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(r * width);
  const empty = width - filled;
  const pct = Math.round(r * 100);
  const fillColor = r >= 0.95 ? colors.green : r >= 0.7 ? colors.cyan : colors.yellow;
  const bar = fillColor('█'.repeat(filled)) + colors.dim('░'.repeat(empty));
  return showPct ? `${bar}  ${String(pct).padStart(3)}%` : bar;
}

// ── 카드 빌더 (편의용) ─────────────────────────────────

/**
 * Build an entire card as an array of lines (top, title, mid, body lines, bottom).
 * Caller can join with '\n' or print line by line.
 *
 * @param {string} title
 * @param {string[]} bodyLines - Already-formatted strings (will be cardLine'd)
 * @param {{titleSuffix?: string, width?: number}} [options]
 * @returns {string[]}
 */
export function buildCard(title, bodyLines, options = {}) {
  const width = options.width ?? DEFAULT_CARD_WIDTH;
  const borders = makeBorders(width);
  const out = [borders.top, cardTitle(title, options.titleSuffix, width), borders.mid];
  for (const line of bodyLines) {
    out.push(cardLine(line, width));
  }
  out.push(borders.bottom);
  return out;
}
