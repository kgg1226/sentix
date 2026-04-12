import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import {
  collectProtectedFiles,
  snapshotIntegrity,
  verifyIntegrity,
  formatIntegrityReport,
} from '../src/lib/integrity-guard.js';

const TMP = join(process.cwd(), '__tests__/.tmp-integrity-guard');

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, '.claude/agents'), { recursive: true });
  mkdirSync(join(TMP, '.sentix/rules'), { recursive: true });
  mkdirSync(join(TMP, 'scripts/hooks'), { recursive: true });

  writeFileSync(join(TMP, '.claude/settings.json'), '{"hooks":{}}');
  writeFileSync(join(TMP, '.claude/agents/planner.md'), '# Planner');
  writeFileSync(join(TMP, '.claude/agents/dev.md'), '# Dev');
  writeFileSync(join(TMP, 'scripts/hooks/require-ticket.js'), 'process.exit(0);');
  writeFileSync(join(TMP, '.sentix/rules/hard-rules.md'), '# Hard Rules');
}

function teardown() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

describe('integrity-guard', () => {
  before(() => setup());
  after(() => teardown());

  describe('collectProtectedFiles', () => {
    it('collects files from all protected directories', () => {
      const files = collectProtectedFiles(TMP);
      assert.ok(files.includes('.claude/settings.json'), 'should include settings.json');
      assert.ok(files.some(f => f.startsWith('.claude/agents/')), 'should include agents');
      assert.ok(files.some(f => f.startsWith('scripts/hooks/')), 'should include hooks');
      assert.ok(files.some(f => f.startsWith('.sentix/rules/')), 'should include rules');
    });

    it('returns empty for nonexistent directory', () => {
      const files = collectProtectedFiles('/tmp/nonexistent-integrity-test');
      assert.equal(files.length, 0);
    });
  });

  describe('snapshotIntegrity', () => {
    it('creates integrity.json with file hashes', () => {
      const result = snapshotIntegrity(TMP);
      assert.ok(result.files > 0, 'should snapshot at least one file');

      const integrityPath = join(TMP, '.sentix/integrity.json');
      assert.ok(existsSync(integrityPath), 'should create integrity.json');

      const snapshot = JSON.parse(readFileSync(integrityPath, 'utf-8'));
      assert.ok(snapshot.version === 1);
      assert.ok(Object.keys(snapshot.files).length > 0);
    });

    it('stores SHA-256 hashes (64 hex chars)', () => {
      const integrityPath = join(TMP, '.sentix/integrity.json');
      const snapshot = JSON.parse(readFileSync(integrityPath, 'utf-8'));

      for (const hash of Object.values(snapshot.files)) {
        assert.ok(/^[a-f0-9]{64}$/.test(hash), `should be SHA-256: ${hash}`);
      }
    });
  });

  describe('verifyIntegrity', () => {
    it('passes when nothing changed', () => {
      snapshotIntegrity(TMP);
      const result = verifyIntegrity(TMP);
      assert.ok(result.passed, 'should pass with no changes');
      assert.equal(result.violations.length, 0);
      assert.equal(result.missing.length, 0);
    });

    it('detects file modification', () => {
      snapshotIntegrity(TMP);
      // Tamper with a file
      writeFileSync(join(TMP, '.claude/settings.json'), '{"hooks":{},"tampered":true}');

      const result = verifyIntegrity(TMP);
      assert.ok(!result.passed, 'should fail when file modified');
      assert.ok(result.violations.length > 0, 'should report violation');
      assert.ok(result.violations[0].file === '.claude/settings.json');

      // Restore for subsequent tests
      writeFileSync(join(TMP, '.claude/settings.json'), '{"hooks":{}}');
    });

    it('detects file deletion', () => {
      snapshotIntegrity(TMP);
      unlinkSync(join(TMP, 'scripts/hooks/require-ticket.js'));

      const result = verifyIntegrity(TMP);
      assert.ok(!result.passed, 'should fail when file deleted');
      assert.ok(result.missing.length > 0, 'should report missing file');

      // Restore
      writeFileSync(join(TMP, 'scripts/hooks/require-ticket.js'), 'process.exit(0);');
    });

    it('skips when no integrity.json exists', () => {
      const result = verifyIntegrity('/tmp/nonexistent-integrity-test');
      assert.ok(result.skipped, 'should skip without snapshot');
      assert.ok(result.passed, 'should pass (safe default)');
    });

    it('skips when integrity.json is corrupted', () => {
      const integrityPath = join(TMP, '.sentix/integrity.json');
      writeFileSync(integrityPath, 'not json');
      const result = verifyIntegrity(TMP);
      assert.ok(result.skipped);

      // Restore valid snapshot
      snapshotIntegrity(TMP);
    });
  });

  describe('formatIntegrityReport', () => {
    it('reports clean when passed', () => {
      const report = formatIntegrityReport({ passed: true, skipped: false, violations: [], missing: [], restored: [] });
      assert.ok(report.includes('무결성 확인'));
    });

    it('reports skip when no snapshot', () => {
      const report = formatIntegrityReport({ passed: true, skipped: true, violations: [], missing: [], restored: [] });
      assert.ok(report.includes('스냅샷 없음'));
    });

    it('reports violations with details', () => {
      const report = formatIntegrityReport({
        passed: false, skipped: false,
        violations: [{ file: 'test.js', expected: 'abc123', actual: 'def456' }],
        missing: [],
        restored: [],
      });
      assert.ok(report.includes('변조 감지'));
      assert.ok(report.includes('test.js'));
    });

    it('reports missing files', () => {
      const report = formatIntegrityReport({
        passed: false, skipped: false,
        violations: [],
        missing: ['deleted.js'],
        restored: ['deleted.js'],
      });
      assert.ok(report.includes('삭제된 파일'));
      assert.ok(report.includes('복원됨'));
    });
  });
});
