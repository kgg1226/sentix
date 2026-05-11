import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { enrichRequestInteractively } from '../src/lib/interactive-spec.js';

function makeCtx() {
  const logs = [];
  return {
    log: (msg) => logs.push(msg),
    logs,
  };
}

describe('interactive-spec', () => {
  describe('enrichRequestInteractively — bug-012 (non-TTY safety)', () => {
    let originalIsTTY;
    let originalEnv;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
      originalEnv = process.env.SENTIX_NONINTERACTIVE;
    });

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalIsTTY,
        configurable: true,
        writable: true,
      });
      if (originalEnv === undefined) {
        delete process.env.SENTIX_NONINTERACTIVE;
      } else {
        process.env.SENTIX_NONINTERACTIVE = originalEnv;
      }
    });

    it('returns original request when SENTIX_NONINTERACTIVE=1 (vague request)', async () => {
      process.env.SENTIX_NONINTERACTIVE = '1';
      const ctx = makeCtx();
      const result = await enrichRequestInteractively('로그인 만들어', ctx);
      assert.equal(result, '로그인 만들어');
      assert.equal(ctx.logs.length, 0, 'must not prompt the user when non-interactive');
    });

    it('returns original request when SENTIX_NONINTERACTIVE=true (string truthy)', async () => {
      process.env.SENTIX_NONINTERACTIVE = 'true';
      const ctx = makeCtx();
      const result = await enrichRequestInteractively('API 추가해줘', ctx);
      assert.equal(result, 'API 추가해줘');
    });

    it('returns original request when stdin.isTTY === false', async () => {
      delete process.env.SENTIX_NONINTERACTIVE;
      Object.defineProperty(process.stdin, 'isTTY', {
        value: false,
        configurable: true,
        writable: true,
      });
      const ctx = makeCtx();
      const result = await enrichRequestInteractively('로그인 만들어', ctx);
      assert.equal(result, '로그인 만들어');
      assert.equal(ctx.logs.length, 0);
    });

    it('still honors skipInteractive option (existing --yes flag)', async () => {
      delete process.env.SENTIX_NONINTERACTIVE;
      Object.defineProperty(process.stdin, 'isTTY', {
        value: true,
        configurable: true,
        writable: true,
      });
      const ctx = makeCtx();
      const result = await enrichRequestInteractively('로그인 만들어', ctx, {
        skipInteractive: true,
      });
      assert.equal(result, '로그인 만들어');
      assert.equal(ctx.logs.length, 0);
    });

    it('returns original request unchanged when no questions are needed (detailed request)', async () => {
      process.env.SENTIX_NONINTERACTIVE = '1';
      const ctx = makeCtx();
      const detailed =
        'src/lib/foo.js 의 bar() 함수에서 null 체크 누락으로 TypeError 발생. 진입부 if (!input) return null; 추가';
      const result = await enrichRequestInteractively(detailed, ctx);
      assert.equal(result, detailed);
    });

    it('preserves export signature (returns Promise<string>)', async () => {
      process.env.SENTIX_NONINTERACTIVE = '1';
      const ctx = makeCtx();
      const promise = enrichRequestInteractively('test', ctx);
      assert.ok(promise instanceof Promise, 'must return a Promise');
      const result = await promise;
      assert.equal(typeof result, 'string', 'must resolve to a string');
    });
  });
});
