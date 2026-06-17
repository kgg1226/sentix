/**
 * Tests for ensureSafetyGitignored — .sentix/safety.toml 자동 gitignore 등록.
 *
 * 안전어 해시 + 복구키 해시가 담긴 .sentix/safety.toml 이 git 에 올라가지 않도록
 * sentix safety set / sentix init 이 .gitignore 에 자동 등록하는지 검증한다.
 * (bug-014)
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import { ensureSafetyGitignored } from '../src/lib/safety.js';

describe('ensureSafetyGitignored', () => {
  let dir;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'sentix-gi-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const count = (s) => (s.match(/\.sentix\/safety\.toml/g) || []).length;

  it('creates .gitignore with safety.toml when none exists', async () => {
    const ok = await ensureSafetyGitignored(createContext(dir));
    assert.equal(ok, true);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.match(gi, /^\.sentix\/safety\.toml$/m);
  });

  it('appends safety.toml to an existing .gitignore (preserving prior entries)', async () => {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.env\n');
    const ok = await ensureSafetyGitignored(createContext(dir));
    assert.equal(ok, true);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.match(gi, /^node_modules\/$/m);
    assert.match(gi, /^\.env$/m);
    assert.match(gi, /^\.sentix\/safety\.toml$/m);
  });

  it('is idempotent — does not duplicate the entry on repeated calls', async () => {
    const ctx = createContext(dir);
    await ensureSafetyGitignored(ctx);
    await ensureSafetyGitignored(ctx);
    await ensureSafetyGitignored(ctx);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.equal(count(gi), 1);
  });

  it('does not re-add when entry already present (no trailing newline)', async () => {
    writeFileSync(join(dir, '.gitignore'), '.sentix/safety.toml');
    const ok = await ensureSafetyGitignored(createContext(dir));
    assert.equal(ok, true);
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.equal(count(gi), 1);
  });

  it('handles existing .gitignore without trailing newline (no glued lines)', async () => {
    writeFileSync(join(dir, '.gitignore'), '.env'); // no trailing newline
    await ensureSafetyGitignored(createContext(dir));
    const gi = readFileSync(join(dir, '.gitignore'), 'utf-8');
    assert.match(gi, /^\.env$/m);
    assert.match(gi, /^\.sentix\/safety\.toml$/m);
  });
});
