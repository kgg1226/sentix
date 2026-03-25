/**
 * Sentix Context Object
 *
 * Passed to every command and plugin as `ctx`.
 * Provides filesystem helpers and logging utilities.
 * Zero external dependencies — uses only Node.js built-ins.
 */

import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;

function color(code, text) {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}

/**
 * Create a context object for command/plugin execution.
 * @param {string} cwd - Current working directory
 * @returns {object} ctx
 */
export function createContext(cwd) {
  return {
    cwd,

    /**
     * Read a file relative to cwd.
     * @param {string} path
     * @returns {Promise<string>}
     */
    async readFile(path) {
      return readFile(resolve(cwd, path), 'utf-8');
    },

    /**
     * Write a file relative to cwd. Creates parent directories.
     * @param {string} path
     * @param {string} content
     */
    async writeFile(path, content) {
      const full = resolve(cwd, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, content, 'utf-8');
    },

    /**
     * Read a JSON file relative to cwd.
     * @param {string} path
     * @returns {Promise<object>}
     */
    async readJSON(path) {
      const raw = await readFile(resolve(cwd, path), 'utf-8');
      return JSON.parse(raw);
    },

    /**
     * Write a JSON file relative to cwd.
     * @param {string} path
     * @param {object} data
     */
    async writeJSON(path, data) {
      const full = resolve(cwd, path);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    },

    /**
     * Append a JSON line to a JSONL file.
     * @param {string} path
     * @param {object} data
     */
    async appendJSONL(path, data) {
      const full = resolve(cwd, path);
      await mkdir(dirname(full), { recursive: true });
      await appendFile(full, JSON.stringify(data) + '\n', 'utf-8');
    },

    /**
     * Check if a file exists relative to cwd.
     * @param {string} path
     * @returns {boolean}
     */
    exists(path) {
      return existsSync(resolve(cwd, path));
    },

    // ── Logging (respects NO_COLOR and non-TTY) ─────
    log(msg)     { console.log(msg); },
    success(msg) { console.log(`${color('32', '✓')} ${msg}`); },
    warn(msg)    { console.log(`${color('33', '⚠')} ${msg}`); },
    error(msg)   { console.error(`${color('31', '✗')} ${msg}`); },
  };
}
