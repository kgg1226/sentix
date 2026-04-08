import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  visualWidth,
  truncateToWidth,
  stripAnsi,
  cardLine,
  cardTitle,
  buildCard,
  makeBorders,
  renderBar,
  colors,
  DEFAULT_CARD_WIDTH,
} from '../src/lib/ui-box.js';

// Force NO_COLOR off so ANSI helpers actually emit codes? They check
// process.stdout.isTTY which is false in tests, so colors are pass-through.
// We test the *width math*, which must be correct regardless of color.

describe('ui-box', () => {
  describe('visualWidth', () => {
    it('counts ASCII as 1 column each', () => {
      assert.equal(visualWidth('hello'), 5);
    });
    it('counts Hangul as 2 columns each', () => {
      assert.equal(visualWidth('가나다'), 6);
    });
    it('counts CJK as 2 columns each', () => {
      assert.equal(visualWidth('中文'), 4);
    });
    it('mixes ASCII and Hangul correctly', () => {
      // "abc가나" = 3 + 4 = 7
      assert.equal(visualWidth('abc가나'), 7);
    });
    it('handles empty string', () => {
      assert.equal(visualWidth(''), 0);
    });
  });

  describe('stripAnsi', () => {
    it('removes color escape codes', () => {
      assert.equal(stripAnsi('\x1b[31mred\x1b[0m'), 'red');
    });
    it('removes nested codes', () => {
      assert.equal(stripAnsi('\x1b[1m\x1b[36mbold cyan\x1b[0m'), 'bold cyan');
    });
    it('leaves plain text untouched', () => {
      assert.equal(stripAnsi('plain'), 'plain');
    });
  });

  describe('truncateToWidth', () => {
    it('truncates ASCII at the visual boundary', () => {
      assert.equal(truncateToWidth('abcdef', 4), 'abcd');
    });
    it('truncates wide chars without splitting them', () => {
      // 가나다 each = 2 cols. max=5 → can fit '가나' (4 cols) but not '가나다' (6).
      assert.equal(truncateToWidth('가나다', 5), '가나');
    });
    it('returns empty if max=0', () => {
      assert.equal(truncateToWidth('abc', 0), '');
    });
  });

  describe('cardLine', () => {
    it('pads ASCII to fill the inner width', () => {
      const line = cardLine('hi', 10); // inner = 6, "hi" + 4 spaces
      assert.equal(line, '│ hi     │');
    });
    it('pads Hangul correctly using visual width', () => {
      // "가" = 2 cols, inner = 6 → 4 spaces of padding
      const line = cardLine('가', 10);
      assert.equal(line, '│ 가     │');
    });
    it('truncates oversized content with ellipsis', () => {
      const line = cardLine('abcdefghijk', 10); // inner = 6
      assert.match(line, /…/);
      // Total visible (between '│ ' and ' │') must be exactly inner=6
      const inner = line.slice(2, -2);
      assert.equal(visualWidth(inner), 6);
    });
    it('uses default width when not specified', () => {
      const line = cardLine('x');
      // Total visible width of full line should be DEFAULT_CARD_WIDTH
      assert.equal(visualWidth(stripAnsi(line)), DEFAULT_CARD_WIDTH);
    });
  });

  describe('cardTitle', () => {
    it('includes label and pads to inner width', () => {
      const title = cardTitle('TEST', '', 20);
      assert.equal(visualWidth(stripAnsi(title)), 20);
      assert.match(stripAnsi(title), /^│ TEST/);
    });
    it('appends suffix with separator', () => {
      const title = cardTitle('TEST', '5✓', 20);
      assert.match(stripAnsi(title), /TEST  5✓/);
    });
  });

  describe('makeBorders', () => {
    it('produces correctly sized borders', () => {
      const b = makeBorders(10);
      assert.equal(b.top.length, 10);
      assert.equal(b.mid.length, 10);
      assert.equal(b.bottom.length, 10);
      assert.equal(b.top[0], '┌');
      assert.equal(b.bottom[9], '┘');
    });
  });

  describe('buildCard', () => {
    it('produces top, title, mid, body lines, bottom', () => {
      const lines = buildCard('TITLE', ['line1', 'line2'], { width: 20 });
      // top + title + mid + 2 body + bottom = 6
      assert.equal(lines.length, 6);
      assert.equal(lines[0][0], '┌');
      assert.match(lines[1], /TITLE/);
      assert.equal(lines[2][0], '├');
      assert.match(lines[3], /line1/);
      assert.match(lines[4], /line2/);
      assert.equal(lines[5][0], '└');
    });
  });

  describe('renderBar', () => {
    it('shows 100% bar at ratio=1', () => {
      const bar = renderBar(1, { width: 10 });
      assert.match(bar, /100%/);
    });
    it('shows 0% bar at ratio=0', () => {
      const bar = renderBar(0, { width: 10 });
      assert.match(bar, /0%/);
    });
    it('clamps ratios above 1 and below 0', () => {
      assert.match(renderBar(2, { width: 10 }), /100%/);
      assert.match(renderBar(-1, { width: 10 }), /0%/);
    });
    it('omits percentage when showPct=false', () => {
      const bar = renderBar(0.5, { width: 10, showPct: false });
      assert.doesNotMatch(bar, /%/);
    });
  });

  describe('colors object', () => {
    it('exports color helper functions', () => {
      assert.equal(typeof colors.dim, 'function');
      assert.equal(typeof colors.bold, 'function');
      assert.equal(typeof colors.green, 'function');
    });
    it('color functions are pass-through in non-TTY', () => {
      // In test env, stdout is not a TTY → colors should not add escape codes
      assert.equal(colors.green('hello'), 'hello');
    });
  });
});
