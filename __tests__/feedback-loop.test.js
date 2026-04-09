import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { feedbackToConstraints, extractConstraintEntries } from '../src/lib/feedback-loop.js';

// Temp directory for isolated tests
const TMP = join(process.cwd(), '__tests__/.tmp-feedback-loop');

function setup() {
  mkdirSync(join(TMP, '.sentix'), { recursive: true });
}

function teardown() {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true, force: true });
  }
}

describe('feedback-loop', () => {
  before(() => setup());
  after(() => teardown());

  describe('extractConstraintEntries', () => {
    it('extracts error-severity issues only', () => {
      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'banned-patterns',
            passed: false,
            issues: [
              { severity: 'error', message: 'eval() is dangerous', pattern: 'eval', file: 'src/bad.js' },
              { severity: 'warning', message: 'minor thing' },
            ],
          },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 1);
      assert.ok(entries[0].includes('eval'));
    });

    it('deduplicates identical entries', () => {
      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'banned-patterns',
            passed: false,
            issues: [
              { severity: 'error', message: 'eval() is dangerous', pattern: 'eval', file: 'a.js' },
              { severity: 'error', message: 'eval() is dangerous', pattern: 'eval', file: 'a.js' },
            ],
          },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 1);
    });

    it('handles test-regression issues', () => {
      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'test-regression',
            passed: false,
            issues: [
              { severity: 'error', message: '3 tests failing' },
            ],
          },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 1);
      assert.ok(entries[0].includes('테스트 회귀'));
    });

    it('handles unknown check name with message', () => {
      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'future-check',
            passed: false,
            issues: [
              { severity: 'error', message: 'some future issue' },
            ],
          },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 1);
      assert.ok(entries[0].includes('[future-check]'), 'should include check name');
      assert.ok(entries[0].includes('some future issue'), 'should include message');
    });

    it('skips unknown check name without message', () => {
      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'unknown',
            passed: false,
            issues: [
              { severity: 'error' },  // no message
            ],
          },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 0, 'should skip entries with no message');
    });

    it('returns empty for passing gate', () => {
      const gateResults = {
        passed: true,
        checks: [
          { name: 'test', passed: true, issues: [] },
        ],
      };

      const entries = extractConstraintEntries(gateResults);
      assert.equal(entries.length, 0);
    });
  });

  describe('feedbackToConstraints', () => {
    it('returns early when gate passed', () => {
      const result = feedbackToConstraints(TMP, { passed: true, checks: [] });
      assert.equal(result.added.length, 0);
      assert.equal(result.skipped, 0);
    });

    it('returns early when no constraints file', () => {
      const result = feedbackToConstraints('/tmp/nonexistent', {
        passed: false,
        checks: [{ name: 'x', passed: false, issues: [{ severity: 'error', message: 'bad' }] }],
      });
      assert.equal(result.added.length, 0);
    });

    it('appends new entries to constraints.md', () => {
      const constraintsPath = join(TMP, '.sentix/constraints.md');
      writeFileSync(constraintsPath, `# Constraints\n\n## Patterns from Lessons\n\n<!-- auto -->\n`);

      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'banned-patterns',
            passed: false,
            issues: [
              { severity: 'error', message: 'eval() is dangerous', pattern: 'eval', file: 'src/x.js' },
            ],
          },
        ],
      };

      const result = feedbackToConstraints(TMP, gateResults);
      assert.equal(result.added.length, 1);

      const updated = readFileSync(constraintsPath, 'utf-8');
      assert.ok(updated.includes('eval'), 'should contain eval entry');
      assert.ok(updated.includes('Patterns from Lessons'), 'should preserve section header');
    });

    it('skips duplicates on second call', () => {
      const constraintsPath = join(TMP, '.sentix/constraints.md');
      writeFileSync(constraintsPath, `# Constraints\n\n## Patterns from Lessons\n\n<!-- auto -->\n`);

      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'syntax-check',
            passed: false,
            issues: [
              { severity: 'error', message: 'SyntaxError in file.js', file: 'src/file.js' },
            ],
          },
        ],
      };

      // First call — should add
      const r1 = feedbackToConstraints(TMP, gateResults);
      assert.equal(r1.added.length, 1);

      // Second call — should skip (duplicate)
      const r2 = feedbackToConstraints(TMP, gateResults);
      assert.equal(r2.added.length, 0);
      assert.equal(r2.skipped, 1);
    });

    it('includes timestamp in added entries', () => {
      const constraintsPath = join(TMP, '.sentix/constraints.md');
      writeFileSync(constraintsPath, `## Patterns from Lessons\n`);

      const gateResults = {
        passed: false,
        checks: [
          {
            name: 'npm-audit',
            passed: false,
            issues: [{ severity: 'error', message: '2 high vulnerabilities' }],
          },
        ],
      };

      feedbackToConstraints(TMP, gateResults);
      const content = readFileSync(constraintsPath, 'utf-8');
      // Should have a date prefix like [2026-04-09]
      assert.ok(/\[\d{4}-\d{2}-\d{2}\]/.test(content), 'should have timestamp');
    });
  });
});
