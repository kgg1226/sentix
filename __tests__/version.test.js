import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VERSION, NAME } from '../src/version.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

describe('version', () => {
  it('VERSION matches package.json', () => {
    assert.equal(VERSION, pkg.version);
  });

  it('NAME equals "sentix"', () => {
    assert.equal(NAME, 'sentix');
  });
});
