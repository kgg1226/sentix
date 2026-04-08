import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOK_PATH = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'scripts',
  'hooks',
  'require-ticket.js'
);

/**
 * Run the hook in a tmp cwd with the given stdin JSON.
 * Returns { code, stdout, stderr }.
 */
function runHook(cwd, input) {
  const result = spawnSync('node', [HOOK_PATH], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    timeout: 5000,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('require-ticket hook', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sentix-hook-test-'));
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('allow paths', () => {
    it('allows writes to tasks/ directory', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Write',
        tool_input: { file_path: join(tmpDir, 'tasks/new.json') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to .sentix/', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Edit',
        tool_input: { file_path: join(tmpDir, '.sentix/config.toml') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to __tests__/', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Write',
        tool_input: { file_path: join(tmpDir, '__tests__/new.test.js') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to scripts/hooks/ (bootstrap)', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Edit',
        tool_input: { file_path: join(tmpDir, 'scripts/hooks/session-start.sh') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to lessons.md / handoff.md', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Edit',
        tool_input: { file_path: join(tmpDir, 'tasks/lessons.md') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to README.md (no governor cycle required)', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Edit',
        tool_input: { file_path: join(tmpDir, 'README.md') },
      });
      assert.equal(r.code, 0);
    });

    it('allows writes to CHANGELOG.md (no governor cycle required)', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Write',
        tool_input: { file_path: join(tmpDir, 'CHANGELOG.md') },
      });
      assert.equal(r.code, 0);
    });
  });

  describe('blocking behavior', () => {
    it('blocks writes to src/ when no governor-state.json exists', async () => {
      // Fresh cwd without state
      const freshDir = await mkdtemp(join(tmpdir(), 'sentix-hook-fresh-'));
      try {
        const r = runHook(freshDir, {
          tool_name: 'Write',
          tool_input: { file_path: join(freshDir, 'src/new.js') },
        });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /SENTIX:BLOCKED/);
        assert.match(r.stderr, /Governor 사이클이 없습니다/);
      } finally {
        await rm(freshDir, { recursive: true, force: true });
      }
    });

    it('blocks writes when governor-state.json exists but status != in_progress', async () => {
      const stateDir = await mkdtemp(join(tmpdir(), 'sentix-hook-state-'));
      try {
        await mkdir(join(stateDir, 'tasks'), { recursive: true });
        await writeFile(
          join(stateDir, 'tasks/governor-state.json'),
          JSON.stringify({ status: 'completed', cycle_id: 'test-1' })
        );
        const r = runHook(stateDir, {
          tool_name: 'Edit',
          tool_input: { file_path: join(stateDir, 'src/foo.js') },
        });
        assert.equal(r.code, 2);
        assert.match(r.stderr, /Governor 사이클 상태가 "completed"/);
      } finally {
        await rm(stateDir, { recursive: true, force: true });
      }
    });
  });

  describe('permits behavior', () => {
    it('permits writes when governor-state.json has status=in_progress', async () => {
      const activeDir = await mkdtemp(join(tmpdir(), 'sentix-hook-active-'));
      try {
        await mkdir(join(activeDir, 'tasks'), { recursive: true });
        await writeFile(
          join(activeDir, 'tasks/governor-state.json'),
          JSON.stringify({ status: 'in_progress', cycle_id: 'test-2' })
        );
        const r = runHook(activeDir, {
          tool_name: 'Write',
          tool_input: { file_path: join(activeDir, 'src/new-feature.js') },
        });
        assert.equal(r.code, 0);
      } finally {
        await rm(activeDir, { recursive: true, force: true });
      }
    });
  });

  describe('fail-open on errors', () => {
    it('passes through when tool_name is not Write/Edit/MultiEdit', () => {
      const r = runHook(tmpDir, {
        tool_name: 'Read',
        tool_input: { file_path: '/any/path' },
      });
      assert.equal(r.code, 0);
    });

    it('passes through when file_path is missing', () => {
      const r = runHook(tmpDir, { tool_name: 'Write', tool_input: {} });
      assert.equal(r.code, 0);
    });

    it('passes through when stdin is empty', () => {
      const r = runHook(tmpDir, {});
      assert.equal(r.code, 0);
    });

    it('passes through when governor-state.json is corrupted', async () => {
      const corruptDir = await mkdtemp(join(tmpdir(), 'sentix-hook-corrupt-'));
      try {
        await mkdir(join(corruptDir, 'tasks'), { recursive: true });
        await writeFile(join(corruptDir, 'tasks/governor-state.json'), '{ not valid json');
        const r = runHook(corruptDir, {
          tool_name: 'Write',
          tool_input: { file_path: join(corruptDir, 'src/foo.js') },
        });
        // Fail-open: corrupt state should not block work
        assert.equal(r.code, 0);
      } finally {
        await rm(corruptDir, { recursive: true, force: true });
      }
    });
  });
});
