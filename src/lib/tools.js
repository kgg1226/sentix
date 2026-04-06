/**
 * tools.js — Engine mode 도구 정의 + 실행 핸들러
 *
 * AI가 사용할 도구를 정의하고, 도구 호출을 실행한다.
 * 화이트리스트 기반 — 허용된 명령만 실행 가능.
 */

import { execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// AI에게 제공하는 도구 목록 (Anthropic tool_use 포맷)
export const TOOLS = [
  {
    name: 'read_file',
    description: 'Read the contents of a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to project root' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (creates parent dirs)',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to project root' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Directory path (default: .)' } },
    },
  },
  {
    name: 'search_files',
    description: 'Search for a text pattern in files (grep)',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Search pattern (regex)' },
        path: { type: 'string', description: 'Directory to search (default: .)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a whitelisted shell command (npm test, git status, git diff, etc.)',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string', description: 'Command to run' } },
      required: ['command'],
    },
  },
  {
    name: 'git_diff',
    description: 'Show git diff of current changes',
    parameters: {
      type: 'object',
      properties: { staged: { type: 'boolean', description: 'Show staged changes only' } },
    },
  },
];

// 허용된 명령 화이트리스트 (접두사 매칭)
const COMMAND_WHITELIST = [
  'npm test', 'npm run test', 'npm run lint', 'npm run build',
  'node bin/sentix.js',
  'git status', 'git diff', 'git log', 'git add', 'git commit',
  'ls', 'cat', 'head', 'tail', 'wc', 'find', 'grep',
];

/**
 * 도구 호출 실행
 * @param {string} name - 도구 이름
 * @param {object} args - 도구 인자
 * @param {object} ctx - sentix context
 * @returns {Promise<string>} 실행 결과
 */
export async function executeTool(name, args, ctx) {
  switch (name) {
    case 'read_file':
      return ctx.readFile(args.path);

    case 'write_file':
      await ctx.writeFile(args.path, args.content);
      return `File written: ${args.path}`;

    case 'list_files': {
      const dir = resolve(ctx.cwd, args.path || '.');
      const files = readdirSync(dir, { withFileTypes: true });
      return files.map(f => f.isDirectory() ? f.name + '/' : f.name).join('\n');
    }

    case 'search_files': {
      const searchPath = args.path || '.';
      const result = execSync(
        `grep -rn "${args.pattern.replace(/"/g, '\\"')}" ${searchPath} --include="*.js" --include="*.ts" --include="*.md" --include="*.json" 2>/dev/null | head -50`,
        { cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 }
      );
      return result || 'No matches found';
    }

    case 'run_command': {
      if (!isAllowedCommand(args.command)) {
        return `DENIED: Command not in whitelist. Allowed prefixes: ${COMMAND_WHITELIST.join(', ')}`;
      }
      try {
        return execSync(args.command, {
          cwd: ctx.cwd,
          encoding: 'utf-8',
          stdio: 'pipe',
          timeout: 60000,
        });
      } catch (err) {
        return `Command failed (exit ${err.status}): ${err.stderr?.slice(0, 500) || err.message}`;
      }
    }

    case 'git_diff': {
      const cmd = args.staged ? 'git diff --staged' : 'git diff';
      return execSync(cmd, { cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 10000 });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

function isAllowedCommand(cmd) {
  const trimmed = cmd.trim();
  return COMMAND_WHITELIST.some(prefix => trimmed.startsWith(prefix));
}
