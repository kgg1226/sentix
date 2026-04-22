import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createContext } from '../src/context.js';
import { runCommandRoutine, routineFail, RoutineError } from '../src/lib/command-routine.js';

describe('command-routine', () => {
  let tmpDir;
  let ctx;
  let logs;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sentix-routine-test-'));
    ctx = createContext(tmpDir);
    logs = { log: [], err: [] };
    ctx.log = (m) => logs.log.push(m);
    ctx.error = (m) => logs.err.push(m);
    ctx.success = (m) => logs.log.push(m);
    ctx.warn = (m) => logs.log.push(m);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── happy path ────────────────────────────────────────

  describe('happy path', () => {
    it('runs all 4 phases in order and returns ok', async () => {
      const order = [];
      const result = await runCommandRoutine(ctx, { name: 'test:happy', targets: [] }, {
        async analyze()  { order.push('analyze'); return { tag: 'a' }; },
        async validate() { order.push('validate'); },
        async execute()  { order.push('execute'); return { out: 42 }; },
        async verify()   { order.push('verify'); },
      });
      assert.equal(result.ok, true);
      assert.deepEqual(order, ['analyze', 'validate', 'execute', 'verify']);
      assert.equal(result.data.analyze.tag, 'a');
      assert.equal(result.data.execute.out, 42);
    });

    it('skips omitted phases', async () => {
      const order = [];
      const result = await runCommandRoutine(ctx, { name: 'test:partial', targets: [] }, {
        async execute() { order.push('execute'); },
      });
      assert.equal(result.ok, true);
      assert.deepEqual(order, ['execute']);
    });

    it('rejects unknown phase names', async () => {
      await assert.rejects(
        () => runCommandRoutine(ctx, { name: 'test:bad', targets: [] }, { bogus: async () => {} }),
        /unknown phase/,
      );
    });

    it('requires a name', async () => {
      await assert.rejects(
        () => runCommandRoutine(ctx, { targets: [] }, { async execute() {} }),
        /name is required/,
      );
    });
  });

  // ── failure rollback ──────────────────────────────────

  describe('rollback on failure', () => {
    it('restores modified target files when a phase throws', async () => {
      const filePath = 'data/value.txt';
      await ctx.writeFile(filePath, 'original');

      const result = await runCommandRoutine(ctx, {
        name: 'test:rollback',
        targets: [filePath],
      }, {
        async execute() {
          await ctx.writeFile(filePath, 'mutated');
        },
        async verify() {
          routineFail('verify', 'simulated post-condition failure', 'fix the underlying cause');
        },
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.phase, 'verify');
      const content = await ctx.readFile(filePath);
      assert.equal(content, 'original');
    });

    it('deletes newly-created target files on rollback', async () => {
      const filePath = 'data/new.txt';
      const result = await runCommandRoutine(ctx, {
        name: 'test:create-rollback',
        targets: [filePath],
      }, {
        async execute() {
          await ctx.writeFile(filePath, 'created');
        },
        async verify() {
          throw new Error('boom');
        },
      });

      assert.equal(result.ok, false);
      assert.equal(existsSync(resolve(tmpDir, filePath)), false);
    });

    it('reports phase/cause/solution on failure', async () => {
      const result = await runCommandRoutine(ctx, { name: 'test:report', targets: [] }, {
        async validate() {
          routineFail('validate', 'bad input X', 'pass Y instead');
        },
      });

      assert.equal(result.ok, false);
      assert.equal(result.error.phase, 'validate');
      assert.match(result.error.cause, /bad input X/);
      assert.match(result.error.solution, /pass Y instead/);
      assert.ok(logs.err.some((m) => /validate 단계 실패/.test(m)));
    });

    it('wraps non-RoutineError throws with the current phase', async () => {
      const result = await runCommandRoutine(ctx, { name: 'test:wrap', targets: [] }, {
        async execute() {
          throw new Error('unexpected kaboom');
        },
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.phase, 'execute');
      assert.match(result.error.cause, /unexpected kaboom/);
    });
  });

  // ── state.json integrity ──────────────────────────────

  describe('state.json self-check', () => {
    it('rolls back when governor-state.json becomes invalid JSON mid-phase', async () => {
      const statePath = 'tasks/governor-state.json';
      await mkdir(resolve(tmpDir, 'tasks'), { recursive: true });
      await writeFile(resolve(tmpDir, statePath), JSON.stringify({ cycle_id: 'x', status: 'in_progress' }), 'utf-8');

      const result = await runCommandRoutine(ctx, {
        name: 'test:corrupt-state',
        targets: [statePath],
      }, {
        async execute() {
          await writeFile(resolve(tmpDir, statePath), '{ not json', 'utf-8');
        },
      });

      assert.equal(result.ok, false);
      assert.match(result.error.cause, /governor-state\.json parse failed/);

      const restored = await readFile(resolve(tmpDir, statePath), 'utf-8');
      assert.doesNotThrow(() => JSON.parse(restored));
      assert.equal(JSON.parse(restored).cycle_id, 'x');
    });

    it('passes self-check when state.json is absent', async () => {
      const result = await runCommandRoutine(ctx, { name: 'test:no-state', targets: [] }, {
        async execute() {},
      });
      assert.equal(result.ok, true);
    });

    it('honors trackState=false', async () => {
      const statePath = 'tasks/governor-state.json';
      await mkdir(resolve(tmpDir, 'tasks'), { recursive: true });
      await writeFile(resolve(tmpDir, statePath), '{ not json', 'utf-8');

      const result = await runCommandRoutine(ctx, {
        name: 'test:no-track',
        targets: [],
        trackState: false,
      }, {
        async execute() {},
      });
      assert.equal(result.ok, true);
    });
  });

  // ── RoutineError ──────────────────────────────────────

  describe('RoutineError', () => {
    it('carries phase/cause/solution fields', () => {
      const err = new RoutineError({ phase: 'execute', cause: 'c', solution: 's' });
      assert.equal(err.phase, 'execute');
      assert.equal(err.cause, 'c');
      assert.equal(err.solution, 's');
    });

    it('defaults solution when omitted', () => {
      const err = new RoutineError({ phase: 'validate', cause: 'c' });
      assert.ok(err.solution.length > 0);
    });
  });
});
