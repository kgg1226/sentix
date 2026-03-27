/**
 * sentix context — 연동 프로젝트의 컨텍스트를 가져온다
 *
 * registry.md에 등록된 프로젝트의 INTERFACE.md, README.md 등을
 * 로컬(../) 또는 GitHub API로 가져와 tasks/context/에 캐시한다.
 *
 * 사용법:
 *   sentix context                    # 전체 프로젝트 컨텍스트 동기화
 *   sentix context asset-manager      # 특정 프로젝트만
 *   sentix context asset-manager --full  # src/ 스키마까지 포함
 *   sentix context --list             # 등록된 프로젝트 목록만 출력
 *   sentix context --clean            # 캐시 삭제
 */

import { registerCommand } from '../registry.js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

registerCommand('context', {
  description: 'Fetch cross-project context from registry',
  usage: 'sentix context [project] [--full] [--list] [--clean]',

  async run(args, ctx) {
    const listOnly = args.includes('--list');
    const fullMode = args.includes('--full');
    const cleanMode = args.includes('--clean');
    const target = args.find(a => !a.startsWith('--'));

    // ── registry.md 파싱 ────────────────────────────
    if (!ctx.exists('registry.md')) {
      ctx.error('registry.md not found. Run: sentix init');
      return;
    }

    const registry = await ctx.readFile('registry.md');
    const projects = parseRegistry(registry);

    if (projects.length === 0) {
      ctx.warn('No projects registered in registry.md');
      ctx.log('Add projects to the table in registry.md');
      return;
    }

    // ── --list ──────────────────────────────────────
    if (listOnly) {
      ctx.log('=== Registered Projects ===\n');
      for (const p of projects) {
        const status = checkProjectAccess(p, ctx.cwd);
        ctx.log(`  ${status.icon} ${p.name.padEnd(20)} ${status.label}`);
      }
      return;
    }

    // ── --clean ─────────────────────────────────────
    if (cleanMode) {
      if (ctx.exists('tasks/context')) {
        const { rmSync } = await import('node:fs');
        rmSync(resolve(ctx.cwd, 'tasks/context'), { recursive: true, force: true });
        ctx.success('Cleared tasks/context/');
      } else {
        ctx.log('tasks/context/ does not exist');
      }
      return;
    }

    // ── 대상 프로젝트 필터링 ────────────────────────
    const targets = target
      ? projects.filter(p => p.name === target)
      : projects;

    if (target && targets.length === 0) {
      ctx.error(`Project "${target}" not found in registry.md`);
      ctx.log('Registered: ' + projects.map(p => p.name).join(', '));
      return;
    }

    ctx.log(`=== Cross-Project Context Sync ===\n`);

    let synced = 0;
    let failed = 0;

    for (const project of targets) {
      ctx.log(`--- ${project.name} ---`);

      const access = checkProjectAccess(project, ctx.cwd);
      const contextDir = `tasks/context/${project.name}`;

      if (access.type === 'local') {
        // ── 로컬 파일시스템 ───────────────────────
        ctx.log(`  Source: ${access.path} (local)`);
        synced += await syncLocal(project, access.path, contextDir, fullMode, ctx);
      } else if (access.type === 'github') {
        // ── GitHub API ────────────────────────────
        ctx.log(`  Source: github.com/kgg1226/${project.name}`);
        synced += await syncGitHub(project, contextDir, fullMode, ctx);
      } else {
        ctx.warn(`  Cannot access ${project.name} — not found locally or on GitHub`);
        failed++;
      }

      ctx.log('');
    }

    // ── 요약 ────────────────────────────────────────
    ctx.log('=== Summary ===');
    ctx.log(`  Synced: ${synced} file(s)`);
    if (failed > 0) ctx.warn(`  Failed: ${failed} project(s)`);
    if (synced > 0) {
      ctx.success(`Context cached in tasks/context/`);
      ctx.log('  Claude Code can now read these files for cross-project reference.');
    }
  },
});

// ── registry.md 파서 ──────────────────────────────────
function parseRegistry(content) {
  const projects = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // 테이블 행 파싱: | name | path | condition |
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|$/);
    if (!match) continue;

    const [, name, path, condition] = match;
    // 헤더 행, 구분선 건너뛰기
    if (name === '프로젝트' || name === '---' || name.includes('---')) continue;

    projects.push({
      name: name.trim(),
      path: path.trim(),
      condition: condition.trim(),
    });
  }

  return projects;
}

// ── 프로젝트 접근 가능성 확인 ─────────────────────────
function checkProjectAccess(project, cwd) {
  // 1. 로컬 경로 확인
  const localPath = resolve(cwd, project.path);
  if (existsSync(resolve(localPath, 'INTERFACE.md')) || existsSync(resolve(localPath, 'README.md'))) {
    return { type: 'local', path: localPath, icon: '●', label: `local (${project.path})` };
  }

  // 2. GitHub 접근 가능성 (gh CLI 또는 curl)
  try {
    const result = execSync(
      `curl -sf -o /dev/null -w "%{http_code}" "https://api.github.com/repos/kgg1226/${project.name}"`,
      { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }
    ).trim();
    if (result === '200') {
      return { type: 'github', icon: '○', label: 'github (remote)' };
    }
  } catch {
    // GitHub 접근 불가
  }

  return { type: 'none', icon: '✗', label: 'not accessible' };
}

// ── 로컬 동기화 ──────────────────────────────────────
async function syncLocal(project, sourcePath, contextDir, fullMode, ctx) {
  let count = 0;

  const files = [
    { src: 'INTERFACE.md', label: 'INTERFACE.md (API contract)' },
    { src: 'README.md', label: 'README.md' },
  ];

  if (fullMode) {
    // --full: 주요 설정 파일도 포함
    const extraFiles = [
      'package.json',
      '.sentix/config.toml',
      'tasks/lessons.md',
    ];
    for (const f of extraFiles) {
      files.push({ src: f, label: f });
    }
  }

  for (const { src, label } of files) {
    const srcPath = resolve(sourcePath, src);
    if (existsSync(srcPath)) {
      const content = readFileSync(srcPath, 'utf-8');
      await ctx.writeFile(`${contextDir}/${src}`, content);
      ctx.success(`  ${label}`);
      count++;
    }
  }

  return count;
}

// ── GitHub 동기화 ────────────────────────────────────
async function syncGitHub(project, contextDir, fullMode, ctx) {
  let count = 0;

  const files = ['INTERFACE.md', 'README.md'];
  if (fullMode) {
    files.push('package.json', '.sentix/config.toml', 'tasks/lessons.md');
  }

  for (const file of files) {
    try {
      const url = `https://raw.githubusercontent.com/kgg1226/${project.name}/main/${file}`;
      const content = execSync(`curl -sf "${url}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        stdio: 'pipe',
      });

      if (content) {
        await ctx.writeFile(`${contextDir}/${file}`, content);
        ctx.success(`  ${file}`);
        count++;
      }
    } catch {
      // File not found on GitHub — skip silently
    }
  }

  return count;
}
