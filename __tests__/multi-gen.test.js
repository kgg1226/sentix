import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getApproachDirectives, selectBest } from '../src/lib/multi-gen.js';

describe('multi-gen', () => {
  describe('getApproachDirectives', () => {
    it('returns 3 directives by default', () => {
      const directives = getApproachDirectives();
      assert.equal(directives.length, 3);
    });

    it('each directive has id, label, directive', () => {
      const directives = getApproachDirectives();
      for (const d of directives) {
        assert.ok(typeof d.id === 'string', 'should have id');
        assert.ok(typeof d.label === 'string', 'should have label');
        assert.ok(typeof d.directive === 'string', 'should have directive');
        assert.ok(d.directive.length > 20, 'directive should be substantial');
      }
    });

    it('returns fewer when n < 3', () => {
      assert.equal(getApproachDirectives(1).length, 1);
      assert.equal(getApproachDirectives(2).length, 2);
    });

    it('caps at available directives', () => {
      const directives = getApproachDirectives(100);
      assert.equal(directives.length, 3); // only 3 defined
    });

    it('includes simplest, robust, elegant approaches', () => {
      const ids = getApproachDirectives().map(d => d.id);
      assert.ok(ids.includes('simplest'));
      assert.ok(ids.includes('robust'));
      assert.ok(ids.includes('elegant'));
    });
  });

  describe('selectBest', () => {
    it('returns -1 for empty generations', () => {
      assert.equal(selectBest([]), -1);
    });

    it('selects highest score', () => {
      const generations = [
        { index: 0, success: true, patchPath: '/a', patchSize: 100, score: { total: 60, issues: 2 } },
        { index: 1, success: true, patchPath: '/b', patchSize: 100, score: { total: 90, issues: 0 } },
        { index: 2, success: true, patchPath: '/c', patchSize: 100, score: { total: 75, issues: 1 } },
      ];
      assert.equal(selectBest(generations), 1);
    });

    it('breaks tie by fewer issues', () => {
      const generations = [
        { index: 0, success: true, patchPath: '/a', patchSize: 100, score: { total: 80, issues: 3 } },
        { index: 1, success: true, patchPath: '/b', patchSize: 100, score: { total: 80, issues: 1 } },
      ];
      assert.equal(selectBest(generations), 1);
    });

    it('breaks tie by smaller patch (simpler is better)', () => {
      const generations = [
        { index: 0, success: true, patchPath: '/a', patchSize: 500, score: { total: 80, issues: 1 } },
        { index: 1, success: true, patchPath: '/b', patchSize: 200, score: { total: 80, issues: 1 } },
      ];
      assert.equal(selectBest(generations), 1);
    });

    it('skips failed generations', () => {
      const generations = [
        { index: 0, success: false, patchPath: '/a', patchSize: 100, score: { total: 100, issues: 0 } },
        { index: 1, success: true, patchPath: '/b', patchSize: 100, score: { total: 50, issues: 3 } },
      ];
      assert.equal(selectBest(generations), 1);
    });

    it('skips generations without patch', () => {
      const generations = [
        { index: 0, success: true, patchPath: null, patchSize: 0, score: { total: 100, issues: 0 } },
        { index: 1, success: true, patchPath: '/b', patchSize: 100, score: { total: 70, issues: 1 } },
      ];
      assert.equal(selectBest(generations), 1);
    });

    it('falls back to first generation when all failed', () => {
      const generations = [
        { index: 0, success: false, patchPath: null, patchSize: 0, score: { total: 0, issues: 5 } },
        { index: 1, success: false, patchPath: null, patchSize: 0, score: { total: 0, issues: 5 } },
      ];
      assert.equal(selectBest(generations), 0);
    });

    it('handles single generation', () => {
      const generations = [
        { index: 0, success: true, patchPath: '/a', patchSize: 100, score: { total: 85, issues: 1 } },
      ];
      assert.equal(selectBest(generations), 0);
    });
  });
});
