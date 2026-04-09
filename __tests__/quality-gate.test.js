import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runQualityGate, formatQualityReport } from '../src/lib/quality-gate.js';

describe('quality-gate', () => {
  describe('runQualityGate', () => {
    it('returns a result object with expected shape', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: true });

      assert.ok(typeof result.passed === 'boolean');
      assert.ok(Array.isArray(result.checks));
      assert.ok(typeof result.summary === 'string');
      assert.ok(typeof result.total_issues === 'number');
    });

    it('includes all 4 checks when audit is skipped', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: true });

      const checkNames = result.checks.map((c) => c.name);
      assert.ok(checkNames.includes('banned-patterns'), 'should include banned-patterns');
      assert.ok(checkNames.includes('no-debug-artifacts'), 'should include no-debug-artifacts');
      assert.ok(checkNames.includes('syntax-check'), 'should include syntax-check');
      assert.ok(checkNames.includes('test-regression'), 'should include test-regression');
    });

    it('includes npm-audit check when not skipped', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: false });

      const checkNames = result.checks.map((c) => c.name);
      assert.ok(checkNames.includes('npm-audit'), 'should include npm-audit');
    });

    it('each check has name, passed, issues, detail', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: true });

      for (const check of result.checks) {
        assert.ok(typeof check.name === 'string', `check should have name`);
        assert.ok(typeof check.passed === 'boolean', `${check.name} should have passed`);
        assert.ok(Array.isArray(check.issues), `${check.name} should have issues array`);
        assert.ok(typeof check.detail === 'string', `${check.name} should have detail`);
      }
    });

    it('passes on a clean codebase (no dirty diff)', () => {
      // Running on the repo itself — if no dirty changes, all should pass
      const result = runQualityGate(process.cwd(), { skipAudit: true });

      // Syntax check should pass (our source is valid JS)
      const syntaxCheck = result.checks.find((c) => c.name === 'syntax-check');
      assert.ok(syntaxCheck, 'syntax check should exist');
      assert.ok(syntaxCheck.passed, `syntax check should pass: ${syntaxCheck.detail}`);
    });

    it('test-regression check returns valid detail', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: true });

      const regCheck = result.checks.find((c) => c.name === 'test-regression');
      assert.ok(regCheck, 'test-regression check should exist');
      assert.ok(typeof regCheck.detail === 'string' && regCheck.detail.length > 0,
        'test-regression should have non-empty detail');
      // Should not falsely report regression on a stable codebase
      assert.ok(regCheck.passed || regCheck.detail.includes('skipped'),
        `test-regression should pass or skip: ${regCheck.detail}`);
    });

    it('handles nonexistent directory gracefully', () => {
      const result = runQualityGate('/tmp/nonexistent-qg-test-12345', { skipAudit: true });

      assert.ok(typeof result.passed === 'boolean');
      assert.ok(Array.isArray(result.checks));
      // Should not crash — all checks should still return valid results
      for (const check of result.checks) {
        assert.ok(typeof check.detail === 'string', `${check.name} should have detail`);
      }
    });
  });

  describe('formatQualityReport', () => {
    it('returns a formatted string', () => {
      const result = runQualityGate(process.cwd(), { skipAudit: true });
      const report = formatQualityReport(result);

      assert.ok(typeof report === 'string');
      assert.ok(report.includes('Quality Gate Report'));
    });

    it('includes PASSED when all checks pass', () => {
      const mockResult = {
        passed: true,
        checks: [
          { name: 'test-check', passed: true, issues: [], detail: 'All good' },
        ],
        summary: '1/1 passed',
        total_issues: 0,
      };

      const report = formatQualityReport(mockResult);
      assert.ok(report.includes('PASSED'));
    });

    it('includes FAILED when a check fails', () => {
      const mockResult = {
        passed: false,
        checks: [
          {
            name: 'test-check',
            passed: false,
            issues: [{ severity: 'error', message: 'bad code', file: 'x.js', lineNum: 1 }],
            detail: '1 issue',
          },
        ],
        summary: '0/1 passed',
        total_issues: 1,
      };

      const report = formatQualityReport(mockResult);
      assert.ok(report.includes('FAILED'));
    });

    it('shows issue details with file and line', () => {
      const mockResult = {
        passed: false,
        checks: [
          {
            name: 'banned-patterns',
            passed: false,
            issues: [{
              severity: 'error',
              file: 'src/bad.js',
              lineNum: 42,
              message: 'eval() detected',
              snippet: 'eval("code")',
            }],
            detail: '1 banned pattern',
          },
        ],
        summary: '0/1 passed',
        total_issues: 1,
      };

      const report = formatQualityReport(mockResult);
      assert.ok(report.includes('src/bad.js:42'), 'should show file:line');
      assert.ok(report.includes('eval()'), 'should show issue message');
    });
  });
});
