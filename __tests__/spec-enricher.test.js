import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConstraints, parseConstraints, extractLessonPatterns } from '../src/lib/spec-enricher.js';

describe('spec-enricher', () => {
  describe('parseConstraints', () => {
    it('extracts items grouped by category', () => {
      const raw = `
## Security
- No eval
- No innerHTML

## Quality
- No console.log
`;
      const result = parseConstraints(raw);
      assert.equal(result.length, 3);
      assert.equal(result[0].category, 'Security');
      assert.equal(result[0].text, 'No eval');
      assert.equal(result[2].category, 'Quality');
      assert.equal(result[2].text, 'No console.log');
    });

    it('handles category headers with parenthetical notes', () => {
      const raw = `## Security (보안)\n- Rule one`;
      const result = parseConstraints(raw);
      assert.equal(result[0].category, 'Security');
    });

    it('ignores comments and blank lines', () => {
      const raw = `## Test\n<!-- comment -->\n\n- Real item\n# Also ignored`;
      const result = parseConstraints(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].text, 'Real item');
    });

    it('returns empty array for empty input', () => {
      assert.deepEqual(parseConstraints(''), []);
    });

    it('handles * bullet points', () => {
      const raw = `## Cat\n* star item`;
      const result = parseConstraints(raw);
      assert.equal(result.length, 1);
      assert.equal(result[0].text, 'star item');
    });

    it('defaults category to General when no header', () => {
      const raw = `- orphan rule`;
      const result = parseConstraints(raw);
      assert.equal(result[0].category, 'General');
    });
  });

  describe('extractLessonPatterns', () => {
    it('extracts lines with action keywords', () => {
      const raw = `
- 금지: eval 사용
- 그냥 일반 메모
- 반드시 테스트 추가
- 추가 정보
- never use innerHTML
`;
      const result = extractLessonPatterns(raw);
      assert.equal(result.length, 3);
      assert.ok(result[0].includes('금지'));
      assert.ok(result[1].includes('반드시'));
      assert.ok(result[2].includes('never'));
    });

    it('deduplicates similar entries', () => {
      const raw = `
- 금지: eval 사용
- 금지: eval 사용
`;
      const result = extractLessonPatterns(raw);
      assert.equal(result.length, 1);
    });

    it('returns empty for no patterns', () => {
      const raw = `- just a note\n- another note`;
      const result = extractLessonPatterns(raw);
      assert.equal(result.length, 0);
    });

    it('limits to 20 results', () => {
      const lines = Array.from({ length: 30 }, (_, i) => `- 금지: rule ${i}`);
      const result = extractLessonPatterns(lines.join('\n'));
      assert.equal(result.length, 20);
    });

    it('handles English keywords', () => {
      const raw = `- always validate input\n- avoid raw SQL\n- don't use var`;
      const result = extractLessonPatterns(raw);
      assert.equal(result.length, 3);
    });
  });

  describe('loadConstraints', () => {
    it('returns an object with constraintsContext and constraintCount', () => {
      const result = loadConstraints(process.cwd());
      assert.ok(typeof result.constraintsContext === 'string');
      assert.ok(typeof result.constraintCount === 'number');
    });

    it('loads constraints from .sentix/constraints.md', () => {
      const result = loadConstraints(process.cwd());
      // We created .sentix/constraints.md with seed content
      assert.ok(result.constraintCount > 0, 'should find constraints from seed file');
      assert.ok(result.constraintsContext.includes('CONSTRAINTS'), 'should include CONSTRAINTS header');
    });

    it('returns empty context for nonexistent directory', () => {
      const result = loadConstraints('/tmp/nonexistent-sentix-test-dir');
      assert.equal(result.constraintCount, 0);
      assert.equal(result.constraintsContext, '');
    });
  });
});
