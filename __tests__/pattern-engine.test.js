import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadPatternLog,
  analyzePatterns,
  formatPatternsMarkdown,
  updatePatterns,
} from '../src/plugins/pattern-engine.js';

const TMP = join(process.cwd(), '__tests__/.tmp-pattern-engine');

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'tasks'), { recursive: true });
}

function teardown() {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
}

// Helper: create a pattern-log.jsonl with given events
function writeLog(events) {
  writeFileSync(
    join(TMP, 'tasks/pattern-log.jsonl'),
    events.map(e => JSON.stringify(e)).join('\n') + '\n'
  );
}

describe('pattern-engine', () => {
  before(() => setup());
  after(() => teardown());

  describe('loadPatternLog', () => {
    it('returns empty for nonexistent directory', () => {
      assert.deepEqual(loadPatternLog('/tmp/nonexistent-pe-test'), []);
    });

    it('returns empty for nonexistent log file', () => {
      assert.deepEqual(loadPatternLog(TMP), []);
    });

    it('parses JSONL events', () => {
      writeLog([
        { ts: '2026-01-01', event: 'request', input: 'test' },
        { ts: '2026-01-02', event: 'command:start', command: 'run' },
      ]);
      const events = loadPatternLog(TMP);
      assert.equal(events.length, 2);
      assert.equal(events[0].event, 'request');
    });

    it('skips malformed lines', () => {
      writeFileSync(join(TMP, 'tasks/pattern-log.jsonl'),
        '{"event":"ok"}\nnot json\n{"event":"ok2"}\n');
      const events = loadPatternLog(TMP);
      assert.equal(events.length, 2);
    });
  });

  describe('analyzePatterns', () => {
    it('returns empty for no events', () => {
      const result = analyzePatterns([]);
      assert.equal(result.requestPatterns.length, 0);
      assert.equal(result.sequencePatterns.length, 0);
      assert.equal(result.failurePatterns.length, 0);
    });

    it('detects request frequency patterns', () => {
      const events = [
        { event: 'request', input: '로그인 버그 수정' },
        { event: 'request', input: '회원가입 에러 fix' },
        { event: 'request', input: '결제 기능 추가' },
      ];
      const result = analyzePatterns(events);
      assert.ok(result.requestPatterns.length > 0, 'should detect request patterns');
      // 2 bug-fix + 1 feature
      const bugFix = result.requestPatterns.find(p => p.category === 'bug-fix');
      assert.ok(bugFix, 'should find bug-fix category');
      assert.equal(bugFix.count, 2);
    });

    it('detects sequence patterns', () => {
      const events = [
        { event: 'command:start', command: 'feature' },
        { event: 'command:start', command: 'run' },
        { event: 'command:start', command: 'feature' },
        { event: 'command:start', command: 'run' },
        { event: 'command:start', command: 'feature' },
        { event: 'command:start', command: 'run' },
      ];
      const result = analyzePatterns(events);
      assert.ok(result.sequencePatterns.length > 0, 'should detect sequence patterns');
      const featureRun = result.sequencePatterns.find(p => p.pair === 'feature → run');
      assert.ok(featureRun, 'should find feature → run pair');
      assert.ok(featureRun.count >= 2);
    });

    it('detects failure patterns', () => {
      const events = [
        { event: 'pipeline-failed', error: 'Failed at phase: dev' },
        { event: 'pipeline-failed', error: 'Failed at phase: dev' },
        { event: 'safety-denied', pattern: 'memory wipe' },
      ];
      const result = analyzePatterns(events);
      assert.ok(result.failurePatterns.length > 0);
      assert.ok(result.failurePatterns[0].count >= 2);
    });

    it('ignores patterns below threshold', () => {
      const events = [
        { event: 'request', input: 'unique request one' },
      ];
      const result = analyzePatterns(events);
      assert.equal(result.requestPatterns.length, 0, 'single occurrence should not be a pattern');
    });
  });

  describe('formatPatternsMarkdown', () => {
    it('generates markdown with patterns', () => {
      const analysis = {
        requestPatterns: [{ description: 'bug-fix 60%' }],
        sequencePatterns: [{ description: 'feature → run 3회' }],
        failurePatterns: [],
      };
      const md = formatPatternsMarkdown(analysis);
      assert.ok(md.includes('요청 빈도'));
      assert.ok(md.includes('bug-fix 60%'));
      assert.ok(md.includes('자주 반복되는 명령 순서'));
    });

    it('generates placeholder when no patterns', () => {
      const analysis = { requestPatterns: [], sequencePatterns: [], failurePatterns: [] };
      const md = formatPatternsMarkdown(analysis);
      assert.ok(md.includes('충분한 데이터가 없습니다'));
    });
  });

  describe('updatePatterns', () => {
    it('creates patterns.md when patterns found', () => {
      writeLog([
        { event: 'request', input: '버그 수정' },
        { event: 'request', input: '에러 fix' },
        { event: 'command:start', command: 'run' },
        { event: 'command:start', command: 'status' },
        { event: 'command:start', command: 'run' },
        { event: 'command:start', command: 'status' },
      ]);

      const result = updatePatterns(TMP);
      assert.ok(result.patternsFound > 0);
      assert.ok(result.updated);
      assert.ok(existsSync(join(TMP, 'tasks/patterns.md')));

      const content = readFileSync(join(TMP, 'tasks/patterns.md'), 'utf-8');
      assert.ok(content.includes('사용자 패턴 분석'));
    });

    it('returns not updated when no patterns', () => {
      writeLog([{ event: 'request', input: 'unique only once' }]);
      const result = updatePatterns(TMP);
      assert.equal(result.updated, false);
    });

    it('handles nonexistent directory gracefully', () => {
      const result = updatePatterns('/tmp/nonexistent-pe-test');
      assert.equal(result.patternsFound, 0);
      assert.equal(result.updated, false);
    });
  });
});
