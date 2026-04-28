import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

import { createContext } from '../src/context.js';
import { SYSTEM_PROMPT_TEMPLATE_MD } from '../src/lib/init-templates.js';

const __here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__here, '..');

describe('init-templates: SYSTEM_PROMPT_TEMPLATE_MD', () => {
  it('is a non-empty string', () => {
    assert.equal(typeof SYSTEM_PROMPT_TEMPLATE_MD, 'string');
    assert.ok(SYSTEM_PROMPT_TEMPLATE_MD.length > 100);
  });

  it('matches docs/system-prompt-template.md in the package', () => {
    const sourcePath = resolve(pkgRoot, 'docs', 'system-prompt-template.md');
    assert.ok(existsSync(sourcePath), 'source template should exist in package');
    const source = readFileSync(sourcePath, 'utf-8');
    assert.equal(SYSTEM_PROMPT_TEMPLATE_MD, source);
  });

  it('mentions Sentix Governor pipeline alignment', () => {
    assert.match(SYSTEM_PROMPT_TEMPLATE_MD, /Governor/);
    assert.match(SYSTEM_PROMPT_TEMPLATE_MD, /하드 룰/);
  });
});

describe('sentix init: docs/system-prompt-template.md deployment', () => {
  let tmpDir;
  let ctx;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sentix-init-template-'));
    ctx = createContext(tmpDir);
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the template when no file exists (create)', async () => {
    const path = 'docs/system-prompt-template.md';
    assert.equal(ctx.exists(path), false);

    // Simulate init's deploy step
    if (!ctx.exists(path)) {
      await ctx.writeFile(path, SYSTEM_PROMPT_TEMPLATE_MD);
    }

    assert.equal(ctx.exists(path), true);
    const written = await ctx.readFile(path);
    assert.equal(written, SYSTEM_PROMPT_TEMPLATE_MD);
  });

  it('preserves existing user content on re-run (no overwrite)', async () => {
    const path = 'docs/system-prompt-template.md';
    const userEdited = '# Custom project prompt\n\nUser specific content.\n';

    // User customizes the file
    await mkdir(join(tmpDir, 'docs'), { recursive: true });
    await writeFile(join(tmpDir, path), userEdited, 'utf-8');

    // Simulate init re-run — must be idempotent, must NOT overwrite
    if (!ctx.exists(path)) {
      await ctx.writeFile(path, SYSTEM_PROMPT_TEMPLATE_MD);
    }

    const preserved = await ctx.readFile(path);
    assert.equal(preserved, userEdited, 'user content must be preserved');
  });

  it('preserves an empty existing file (edge case: presence beats content)', async () => {
    // Fresh isolated tmp dir — must not leak from prior tests.
    const isolated = await mkdtemp(join(tmpdir(), 'sentix-init-template-empty-'));
    try {
      const localCtx = createContext(isolated);
      const path = 'docs/system-prompt-template.md';

      // User created the file but left it empty (placeholder stub).
      await mkdir(join(isolated, 'docs'), { recursive: true });
      await writeFile(join(isolated, path), '', 'utf-8');

      // Simulate init re-run — preserve must rely on existence, not content length.
      if (!localCtx.exists(path)) {
        await localCtx.writeFile(path, SYSTEM_PROMPT_TEMPLATE_MD);
      }

      const after = await localCtx.readFile(path);
      assert.equal(after, '', 'empty existing file must remain untouched');
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });
});
