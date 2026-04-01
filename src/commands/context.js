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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    const extraFiles = [
      'CLAUDE.md',
      'package.json',
      'pyproject.toml',
      'go.mod',
      'Cargo.toml',
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

  // --full: 프로젝트 프로필 자동 생성
  if (fullMode) {
    const profile = generateProjectProfile(project, sourcePath);
    if (profile) {
      await ctx.writeFile(`${contextDir}/PROFILE.md`, profile);
      ctx.success(`  PROFILE.md (auto-generated)`);
      count++;
    }
  }

  return count;
}

// ── 프로젝트 프로필 자동 생성 ────────────────────────

function generateProjectProfile(project, sourcePath) {
  // readdirSync는 top-level import에서 가져옴

  let profile = `# ${project.name} — Project Profile (auto-generated)\n\n`;

  // 1. 기술 스택 추출 (CLAUDE.md에서)
  const claudePath = resolve(sourcePath, 'CLAUDE.md');
  if (existsSync(claudePath)) {
    const claude = readFileSync(claudePath, 'utf-8');
    const stackMatch = claude.match(/## 기술 스택[\s\S]*?```([\s\S]*?)```/);
    if (stackMatch) {
      profile += `## Tech Stack\n\n\`\`\`\n${stackMatch[1].trim()}\n\`\`\`\n\n`;
    }
  }

  // 2. package.json에서 의존성 추출
  const pkgPath = resolve(sourcePath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.length > 0 || devDeps.length > 0) {
        profile += `## Dependencies\n\n`;
        if (deps.length) profile += `**Runtime**: ${deps.join(', ')}\n`;
        if (devDeps.length) profile += `**Dev**: ${devDeps.join(', ')}\n`;
        profile += '\n';
      }
    } catch { /* ignore */ }
  }

  // 3. 디렉토리 구조 스캔 (2레벨)
  profile += `## Directory Structure\n\n\`\`\`\n`;
  try {
    const entries = readdirSync(sourcePath, { withFileTypes: true })
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        profile += `${entry.name}/\n`;
        // 2레벨 스캔
        try {
          const sub = readdirSync(resolve(sourcePath, entry.name), { withFileTypes: true })
            .filter(e => !e.name.startsWith('.'))
            .slice(0, 10);
          for (const s of sub) {
            profile += `  ${s.name}${s.isDirectory() ? '/' : ''}\n`;
          }
          const total = readdirSync(resolve(sourcePath, entry.name)).filter(e => !e.startsWith('.')).length;
          if (total > 10) profile += `  ... (${total} items)\n`;
        } catch { /* permission denied */ }
      } else {
        profile += `${entry.name}\n`;
      }
    }
  } catch { /* source not scannable */ }
  profile += `\`\`\`\n\n`;

  // 4. INTERFACE.md에서 API/Schema 추출
  const ifacePath = resolve(sourcePath, 'INTERFACE.md');
  if (existsSync(ifacePath)) {
    const iface = readFileSync(ifacePath, 'utf-8');

    const apiMatch = iface.match(/## Exported APIs[\s\S]*?```([\s\S]*?)```/);
    if (apiMatch && !apiMatch[1].includes('없음')) {
      profile += `## Exported APIs\n\n\`\`\`\n${apiMatch[1].trim()}\n\`\`\`\n\n`;
    }

    const schemaMatch = iface.match(/## Schemas[\s\S]*?```([\s\S]*?)```/);
    if (schemaMatch && !schemaMatch[1].includes('없음')) {
      profile += `## Schemas\n\n\`\`\`\n${schemaMatch[1].trim()}\n\`\`\`\n\n`;
    }

    const patternMatch = iface.match(/## Key Patterns[\s\S]*?```([\s\S]*?)```/);
    if (patternMatch) {
      profile += `## Key Patterns\n\n\`\`\`\n${patternMatch[1].trim()}\n\`\`\`\n\n`;
    }
  }

  // 5. lessons.md 요약 (최근 3개)
  const lessonsPath = resolve(sourcePath, 'tasks/lessons.md');
  if (existsSync(lessonsPath)) {
    const lessons = readFileSync(lessonsPath, 'utf-8');
    const sections = lessons.split(/^## /m).filter(s => s.trim()).slice(0, 3);
    if (sections.length > 0) {
      profile += `## Recent Lessons (from this project)\n\n`;
      for (const s of sections) {
        const firstLine = s.split('\n')[0].trim();
        if (firstLine && !firstLine.startsWith('#')) {
          profile += `- ${firstLine}\n`;
        }
      }
      profile += '\n';
    }
  }

  return profile;
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
