import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerCommand, getCommand, getAllCommands, registerHook, runHooks } from '../src/registry.js';

describe('registry', () => {
  describe('registerCommand / getCommand', () => {
    it('stores and retrieves a command', () => {
      registerCommand('test-cmd', {
        description: 'A test command',
        usage: 'sentix test-cmd',
        async run() {},
      });

      const cmd = getCommand('test-cmd');
      assert.ok(cmd);
      assert.equal(cmd.description, 'A test command');
    });

    it('returns undefined for unknown commands', () => {
      assert.equal(getCommand('nonexistent'), undefined);
    });
  });

  describe('getAllCommands', () => {
    it('returns a Map containing registered commands', () => {
      const cmds = getAllCommands();
      assert.ok(cmds instanceof Map);
      assert.ok(cmds.has('test-cmd'));
    });
  });

  describe('registerHook / runHooks', () => {
    it('executes hooks in order', async () => {
      const order = [];
      registerHook('test:event', async () => order.push('first'));
      registerHook('test:event', async () => order.push('second'));

      await runHooks('test:event', {});
      assert.deepEqual(order, ['first', 'second']);
    });

    it('catches hook errors without throwing', async () => {
      registerHook('test:error', async () => {
        throw new Error('hook failure');
      });

      // Should not throw
      await runHooks('test:error', {});
    });

    it('runs empty hook list without error', async () => {
      await runHooks('nonexistent:event', {});
    });
  });
});
