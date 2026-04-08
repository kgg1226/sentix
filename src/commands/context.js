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
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';
import { generateProjectProfile } from '../lib/context-profile.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('context', {
  description: 'Fetch cross-project context from registry',
  usage: 'sentix context [project] [--full] [--list] [--clean]',

  async run(args, ctx) {
    const listOnly = args.includes('--list');
    const fullMode = args.includes('--full');
    const cleanMode = args.includes('--clean');
    const target = args.find((a) => !a.startsWith('--'));
    const borders = makeBorders();

    ctx.log('');
    ctx.log(bold(cyan(' Sentix Context')) + dim('  ·  멀티 프로젝트 컨텍스트 동기화'));
    ctx.log('');

    // ── registry.md 파싱 ────────────────────────────
    if (!ctx.exists('registry.md')) {
      ctx.log(`  ${red('●')} ${bold('차단')}  ${red('registry.md 없음')}`);
      ctx.log(`  ${dim('실행:')} ${dim('sentix init')}`);
      ctx.log('');
      process.exitCode = 1;
      return;
    }

    const registry = await ctx.readFile('registry.md');
    const projects = parseRegistry(registry);

    if (projects.length === 0) {
      ctx.log(`  ${yellow('●')} ${bold('빈 레지스트리')}  ${yellow('등록된 프로젝트 없음')}`);
      ctx.log(`  ${dim('registry.md 의 표에 프로젝트를 추가하세요')}`);
      ctx.log('');
      return;
    }

    // ── --list ──────────────────────────────────────
    if (listOnly) {
      const enriched = projects.map((p) => ({ ...p, access: checkProjectAccess(p, ctx.cwd) }));
      const localCount  = enriched.filter((p) => p.access.type === 'local').length;
      const githubCount = enriched.filter((p) => p.access.type === 'github').length;
      const noneCount   = enriched.filter((p) => p.access.type === 'none').length;

      ctx.log(`  ${dim('총    ')}  ${enriched.length}`);
      ctx.log(`  ${dim('로컬  ')}  ${localCount > 0 ? green(localCount) : dim('0')}`);
      ctx.log(`  ${dim('GitHub')}  ${githubCount > 0 ? cyan(githubCount) : dim('0')}`);
      if (noneCount > 0) ctx.log(`  ${dim('차단  ')}  ${red(noneCount)}`);
      ctx.log('');

      ctx.log(borders.top);
      ctx.log(cardTitle('등록 프로젝트', dim(String(enriched.length))));
      ctx.log(borders.mid);

      const nameWidth = Math.max(12, ...enriched.map((p) => p.name.length));
      for (const p of enriched) {
        const icon =
          p.access.type === 'local'  ? green('●') :
          p.access.type === 'github' ? cyan('○')  :
                                       red('✗');
        const name = p.name.padEnd(nameWidth);
        ctx.log(cardLine(`${icon} ${bold(name)}  ${dim(p.access.label)}`));
      }
      ctx.log(borders.bottom);
      ctx.log('');
      return;
    }

    // ── --clean ─────────────────────────────────────
    if (cleanMode) {
      if (ctx.exists('tasks/context')) {
        const { rmSync } = await import('node:fs');
        rmSync(resolve(ctx.cwd, 'tasks/context'), { recursive: true, force: true });
        ctx.log(`  ${green('●')} ${bold('정리')}  ${green('tasks/context/ 삭제됨')}`);
      } else {
        ctx.log(`  ${dim('●')} ${dim('tasks/context/ 가 이미 존재하지 않음')}`);
      }
      ctx.log('');
      return;
    }

    // ── 대상 프로젝트 필터링 ────────────────────────
    const targets = target
      ? projects.filter((p) => p.name === target)
      : projects;

    if (target && targets.length === 0) {
      ctx.log(`  ${red('●')} ${bold('차단')}  ${red(`"${target}" 프로젝트를 찾을 수 없음`)}`);
      ctx.log(`  ${dim('등록된 프로젝트:')} ${dim(projects.map((p) => p.name).join(', '))}`);
      ctx.log('');
      process.exitCode = 1;
      return;
    }

    ctx.log(`  ${dim('모드')}  ${fullMode ? cyan('full') : dim('basic')}${fullMode ? dim('  (소스 스키마 포함)') : ''}`);
    ctx.log(`  ${dim('대상')}  ${targets.length}개${target ? dim(`  (${target})`) : ''}`);
    ctx.log('');

    let totalSynced = 0;
    let totalFailed = 0;
    const results = [];

    for (const project of targets) {
      const access = checkProjectAccess(project, ctx.cwd);
      const contextDir = `tasks/context/${project.name}`;
      let count = 0;
      let status = 'ok';
      let source = '';

      if (access.type === 'local') {
        source = access.path + dim(' (local)');
        count = await syncLocalQuiet(project, access.path, contextDir, fullMode, ctx);
      } else if (access.type === 'github') {
        source = `github.com/kgg1226/${project.name}`;
        count = await syncGitHubQuiet(project, contextDir, fullMode, ctx);
      } else {
        status = 'fail';
        totalFailed++;
      }

      totalSynced += count;
      results.push({ project, access, source, count, status });
    }

    // 각 프로젝트 카드
    for (const r of results) {
      const stats =
        r.status === 'fail' ? red('✗') :
        r.count > 0         ? green(`${r.count}✓`) :
                              dim('0');
      ctx.log(borders.top);
      ctx.log(cardTitle(r.project.name, stats));
      ctx.log(borders.mid);
      if (r.status === 'fail') {
        ctx.log(cardLine(`${red('✗')} ${r.project.name} ${dim('— 로컬/GitHub 모두 접근 불가')}`));
      } else {
        ctx.log(cardLine(`${dim('소스')}  ${r.source}`));
        ctx.log(cardLine(`${dim('위치')}  ${dim('tasks/context/' + r.project.name + '/')}`));
        ctx.log(cardLine(`${green('✓')} ${r.count}개 파일 동기화`));
      }
      ctx.log(borders.bottom);
      ctx.log('');
    }

    // ── 최종 배너 ──────────────────────────────────
    if (totalFailed > 0 && totalSynced === 0) {
      ctx.log(`  ${red('●')} ${bold('실패')}  ${red(`${totalFailed}개 프로젝트 모두 접근 불가`)}`);
    } else if (totalFailed > 0) {
      ctx.log(`  ${yellow('●')} ${bold('부분 성공')}  ${green(`${totalSynced}개 파일`)} ${dim('동기화')}  ${yellow(`${totalFailed}개 프로젝트 실패`)}`);
    } else {
      ctx.log(`  ${green('●')} ${bold('완료')}  ${green(`${totalSynced}개 파일`)} ${dim('tasks/context/ 에 캐시됨')}`);
      ctx.log(`  ${dim('Claude Code 가 이제 멀티 프로젝트 참조에 사용할 수 있습니다')}`);
    }
    ctx.log('');
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

// ── 로컬 동기화 (조용한 버전 — 카운트만 반환) ──────
async function syncLocalQuiet(project, sourcePath, contextDir, fullMode, ctx) {
  let count = 0;

  const files = ['INTERFACE.md', 'README.md'];
  if (fullMode) {
    files.push('CLAUDE.md', 'package.json', 'pyproject.toml',
               'go.mod', 'Cargo.toml', '.sentix/config.toml', 'tasks/lessons.md');
  }

  for (const src of files) {
    const srcPath = resolve(sourcePath, src);
    if (existsSync(srcPath)) {
      const content = readFileSync(srcPath, 'utf-8');
      await ctx.writeFile(`${contextDir}/${src}`, content);
      count++;
    }
  }

  // --full: 프로젝트 프로필 자동 생성
  if (fullMode) {
    const profile = generateProjectProfile(project, sourcePath);
    if (profile) {
      await ctx.writeFile(`${contextDir}/PROFILE.md`, profile);
      count++;
    }
  }

  return count;
}

// ── GitHub 동기화 (조용한 버전 — 카운트만 반환) ────
async function syncGitHubQuiet(project, contextDir, fullMode, ctx) {
  let count = 0;

  const files = ['INTERFACE.md', 'README.md'];
  if (fullMode) {
    files.push('package.json', '.sentix/config.toml', 'tasks/lessons.md');
  }

  for (const file of files) {
    try {
      const url = `https://raw.githubusercontent.com/kgg1226/${project.name}/main/${file}`;
      const content = execSync(`curl -sf "${url}"`, {
        encoding: 'utf-8', timeout: 10000, stdio: 'pipe',
      });

      if (content) {
        await ctx.writeFile(`${contextDir}/${file}`, content);
        count++;
      }
    } catch {
      // File not found on GitHub — skip silently
    }
  }

  return count;
}
