import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTomlValue, setTomlValue, extractSection } from '../src/lib/toml-edit.js';

describe('toml-edit', () => {
  describe('getTomlValue', () => {
    it('reads a boolean from a section', () => {
      const toml = `[layers.learning]\nenabled = true\n`;
      assert.equal(getTomlValue(toml, 'layers.learning', 'enabled'), true);
    });

    it('reads a float from a nested section', () => {
      const toml = `[layers.pattern_engine]\nmin_confidence = 0.70\ndecay_days = 30\n`;
      assert.equal(getTomlValue(toml, 'layers.pattern_engine', 'min_confidence'), 0.70);
    });

    it('reads an integer', () => {
      const toml = `[evolution]\nmin_cycles = 50\n`;
      assert.equal(getTomlValue(toml, 'evolution', 'min_cycles'), 50);
    });

    it('reads a quoted string', () => {
      const toml = `[runtime]\nmode = "framework"\n`;
      assert.equal(getTomlValue(toml, 'runtime', 'mode'), 'framework');
    });

    it('returns undefined for missing section', () => {
      const toml = `[other]\nkey = 1\n`;
      assert.equal(getTomlValue(toml, 'missing', 'key'), undefined);
    });

    it('returns undefined for missing key in present section', () => {
      const toml = `[runtime]\nmode = "api"\n`;
      assert.equal(getTomlValue(toml, 'runtime', 'absent'), undefined);
    });

    it('does not leak into adjacent sections', () => {
      const toml = `[a]\nx = 1\n\n[b]\nx = 2\n`;
      assert.equal(getTomlValue(toml, 'a', 'x'), 1);
      assert.equal(getTomlValue(toml, 'b', 'x'), 2);
    });

    it('ignores trailing comments', () => {
      const toml = `[layers.pattern_engine]\nmin_confidence = 0.75 # bumped\n`;
      assert.equal(getTomlValue(toml, 'layers.pattern_engine', 'min_confidence'), 0.75);
    });
  });

  describe('setTomlValue', () => {
    it('replaces an existing boolean', () => {
      const toml = `[layers.learning]\nenabled = true\n`;
      const out = setTomlValue(toml, 'layers.learning', 'enabled', false);
      assert.match(out, /enabled = false/);
      assert.equal(getTomlValue(out, 'layers.learning', 'enabled'), false);
    });

    it('replaces a float without corrupting other keys', () => {
      const toml = `[layers.pattern_engine]\nmin_confidence = 0.70\ndecay_days = 30\n`;
      const out = setTomlValue(toml, 'layers.pattern_engine', 'min_confidence', 0.85);
      assert.equal(getTomlValue(out, 'layers.pattern_engine', 'min_confidence'), 0.85);
      assert.equal(getTomlValue(out, 'layers.pattern_engine', 'decay_days'), 30);
    });

    it('preserves trailing comments when replacing', () => {
      const toml = `[x]\nn = 1 # old\n`;
      const out = setTomlValue(toml, 'x', 'n', 2);
      assert.match(out, /n = 2\s*# old/);
    });

    it('inserts a missing key into an existing section', () => {
      const toml = `[evolution]\nmin_cycles = 50\n`;
      const out = setTomlValue(toml, 'evolution', 'new_key', 100);
      assert.equal(getTomlValue(out, 'evolution', 'new_key'), 100);
      assert.equal(getTomlValue(out, 'evolution', 'min_cycles'), 50);
    });

    it('inserts a missing section at the end', () => {
      const toml = `[a]\nx = 1\n`;
      const out = setTomlValue(toml, 'b', 'y', 2);
      assert.equal(getTomlValue(out, 'a', 'x'), 1);
      assert.equal(getTomlValue(out, 'b', 'y'), 2);
    });

    it('does not affect other sections when editing one', () => {
      const toml = `[a]\nx = 1\n\n[b]\ny = 2\n\n[c]\nz = 3\n`;
      const out = setTomlValue(toml, 'b', 'y', 99);
      assert.equal(getTomlValue(out, 'a', 'x'), 1);
      assert.equal(getTomlValue(out, 'b', 'y'), 99);
      assert.equal(getTomlValue(out, 'c', 'z'), 3);
    });

    it('formats strings with quotes', () => {
      const toml = `[runtime]\nmode = "framework"\n`;
      const out = setTomlValue(toml, 'runtime', 'mode', 'api');
      assert.match(out, /mode = "api"/);
    });

    it('preserves literal numeric input with raw=true (e.g. 0.70 not normalized)', () => {
      const toml = `[layers.pattern_engine]\nmin_confidence = 0.7\n`;
      const out = setTomlValue(toml, 'layers.pattern_engine', 'min_confidence', '0.70', { raw: true });
      assert.match(out, /min_confidence = 0\.70/);
    });

    it('raw mode emits value as-is without quoting', () => {
      const toml = `[a]\nx = 1\n`;
      const out = setTomlValue(toml, 'a', 'x', '42', { raw: true });
      assert.match(out, /x = 42/);
      assert.doesNotMatch(out, /x = "42"/);
    });

    it('handles consecutive set operations idempotently', () => {
      let toml = `[a]\nx = 1\n`;
      toml = setTomlValue(toml, 'a', 'x', 2);
      toml = setTomlValue(toml, 'a', 'x', 3);
      toml = setTomlValue(toml, 'a', 'x', 3);
      assert.equal(getTomlValue(toml, 'a', 'x'), 3);
    });
  });

  describe('extractSection', () => {
    it('returns null for missing section', () => {
      assert.equal(extractSection(`[a]\nx = 1\n`, 'missing'), null);
    });

    it('returns body between headers', () => {
      const body = extractSection(`[a]\nx = 1\ny = 2\n\n[b]\nz = 3\n`, 'a');
      assert.match(body, /x = 1/);
      assert.match(body, /y = 2/);
      assert.doesNotMatch(body, /z = 3/);
    });
  });
});
