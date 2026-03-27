import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext } from '../src/context.js';

describe('context', () => {
  let tmpDir;
  let ctx;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sentix-test-'));
    ctx = createContext(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('writeFile / readFile', () => {
    it('writes and reads a file', async () => {
      await ctx.writeFile('hello.txt', 'world');
      const content = await ctx.readFile('hello.txt');
      assert.equal(content, 'world');
    });

    it('creates parent directories', async () => {
      await ctx.writeFile('deep/nested/dir/file.txt', 'content');
      const content = await ctx.readFile('deep/nested/dir/file.txt');
      assert.equal(content, 'content');
    });
  });

  describe('exists', () => {
    it('returns true for existing files', async () => {
      await ctx.writeFile('exists.txt', 'yes');
      assert.equal(ctx.exists('exists.txt'), true);
    });

    it('returns false for missing files', () => {
      assert.equal(ctx.exists('missing.txt'), false);
    });
  });

  describe('writeJSON / readJSON', () => {
    it('writes and reads JSON atomically', async () => {
      const data = { key: 'value', num: 42 };
      await ctx.writeJSON('data.json', data);
      const result = await ctx.readJSON('data.json');
      assert.deepEqual(result, data);
    });
  });

  describe('appendJSONL', () => {
    it('appends JSON lines', async () => {
      await ctx.appendJSONL('log.jsonl', { a: 1 });
      await ctx.appendJSONL('log.jsonl', { b: 2 });
      const content = await ctx.readFile('log.jsonl');
      const lines = content.trim().split('\n').map(JSON.parse);
      assert.deepEqual(lines, [{ a: 1 }, { b: 2 }]);
    });
  });
});
