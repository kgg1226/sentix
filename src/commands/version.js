/**
 * sentix version — 버전 관리
 *
 * sentix version current    — 현재 버전 표시
 * sentix version bump       — 버전 범프 + git tag + CHANGELOG
 * sentix version changelog  — CHANGELOG 미리보기 생성
 */

import { spawnSync, execSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { parseSemver, bumpSemver } from '../lib/semver.js';
import { generateForVersion, prependToChangelog, detectBumpType } from '../lib/changelog.js';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';
import { runCommandRoutine, routineFail } from '../lib/command-routine.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('version', {
  description: 'Manage project version (bump | current | changelog)',
  usage: 'sentix version <bump|current|changelog> [auto|major|minor|patch]',

  async run(args, ctx) {
    const subcommand = args[0];

    if (!subcommand || subcommand === 'current') {
      await showCurrent(ctx);
    } else if (subcommand === 'bump') {
      let type = args[1] || 'auto';
      let autoDetected = false;
      if (type === 'auto') {
        type = autoDetectBumpType(ctx);
        autoDetected = true;
      }
      if (!['major', 'minor', 'patch'].includes(type)) {
        ctx.error(`잘못된 bump type: ${type} (auto|major|minor|patch)`);
        process.exitCode = 1;
        return;
      }
      await bumpVersion(type, ctx, autoDetected);
    } else if (subcommand === 'changelog') {
      await showChangelog(ctx);
    } else {
      ctx.error(`Unknown subcommand: ${subcommand}`);
      ctx.log('Usage: sentix version <bump|current|changelog> [auto|major|minor|patch]');
    }
  },
});

// ── Auto-detect bump type from commits ───────────────

function autoDetectBumpType(ctx) {
  try {
    // Get commits since last tag
    let range = '';
    try {
      const lastTag = execSync('git describe --tags --abbrev=0 HEAD~1 2>/dev/null', {
        cwd: ctx.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      if (lastTag) range = `${lastTag}..HEAD`;
    } catch {
      range = 'HEAD~20..HEAD';
    }

    const log = execSync(`git log ${range} --pretty=format:"%s" 2>/dev/null`, {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const messages = log ? log.split('\n') : [];
    return detectBumpType(messages);
  } catch {
    return 'patch';
  }
}

// ── sentix version current ────────────────────────────

async function showCurrent(ctx) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Version')) + dim('  ·  버전 상태'));
  ctx.log('');

  // Read from package.json
  let currentVersion = 'unknown';
  let pkgReadError = false;
  if (ctx.exists('package.json')) {
    try {
      const pkg = await ctx.readJSON('package.json');
      currentVersion = pkg.version || 'unknown';
    } catch {
      pkgReadError = true;
    }
  }

  // Check latest git tag
  let latestTag = null;
  let tagMismatch = false;
  const tagResult = spawnSync('git', ['describe', '--tags', '--abbrev=0'], {
    cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
  });
  if (tagResult.status === 0 && tagResult.stdout.trim()) {
    latestTag = tagResult.stdout.trim();
    tagMismatch = latestTag.replace(/^v/i, '') !== currentVersion;
  }

  // Check INTERFACE.md version
  let interfaceVersion = null;
  let interfaceMismatch = false;
  if (ctx.exists('INTERFACE.md')) {
    try {
      const iface = await ctx.readFile('INTERFACE.md');
      const match = iface.match(/version:\s*(\S+)/);
      if (match) {
        interfaceVersion = match[1];
        interfaceMismatch = interfaceVersion !== currentVersion;
      }
    } catch { /* non-critical */ }
  }

  // ── 요약 ────────────────────────────────────────
  ctx.log(`  ${dim('버전')}  ${cyan('v' + currentVersion)}`);
  if (latestTag) {
    ctx.log(`  ${dim('태그')}  ${latestTag}${tagMismatch ? '  ' + yellow('⚠ 버전 불일치') : ''}`);
  }
  if (interfaceVersion) {
    ctx.log(`  ${dim('API ')}  ${interfaceVersion}${interfaceMismatch ? '  ' + yellow('⚠ 불일치') : ''}`);
  }
  ctx.log('');

  // ── 경고 카드 (있을 때만) ──────────────────────
  const warnings = [];
  if (pkgReadError) warnings.push({ msg: 'package.json 읽기 실패', fix: 'JSON 형식 확인' });
  if (!latestTag)   warnings.push({ msg: 'git 태그 없음', fix: 'sentix version bump' });
  if (tagMismatch)  warnings.push({ msg: `태그(${latestTag})와 버전(${currentVersion}) 불일치`, fix: 'sentix version bump' });
  if (interfaceMismatch) warnings.push({ msg: `INTERFACE.md 버전 불일치 (${interfaceVersion})`, fix: 'sentix version bump' });

  if (warnings.length > 0) {
    ctx.log(borders.top);
    ctx.log(cardTitle('주의', yellow(`${warnings.length}⚠`)));
    ctx.log(borders.mid);
    for (const w of warnings) {
      ctx.log(cardLine(`${yellow('⚠')} ${w.msg}`));
      if (w.fix) ctx.log(cardLine(`  ${dim('└')} ${dim(w.fix)}`));
    }
    ctx.log(borders.bottom);
    ctx.log('');
  } else {
    ctx.log(`  ${green('●')} ${dim('정상 — 모든 버전 동기화됨')}`);
    ctx.log('');
  }
}

// ── sentix version bump ───────────────────────────────

async function bumpVersion(type, ctx, autoDetected = false) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Version Bump')) + dim('  ·  버전 범프'));
  ctx.log('');

  // 1. Read current version
  if (!ctx.exists('package.json')) {
    ctx.log(`  ${red('●')} ${bold('차단')}  ${red('package.json 없음')}`);
    ctx.log('');
    process.exitCode = 1;
    return;
  }

  const pkg = await ctx.readJSON('package.json');
  const current = pkg.version;
  let newVersion;

  try {
    parseSemver(current);
    newVersion = bumpSemver(current, type);
  } catch (e) {
    ctx.log(`  ${red('●')} ${bold('차단')}  ${red(e.message)}`);
    ctx.log('');
    process.exitCode = 1;
    return;
  }

  // ── 요약 ────────────────────────────────────────
  const typeBadge =
    type === 'major' ? red('major') :
    type === 'minor' ? yellow('minor') :
                       cyan('patch');
  ctx.log(`  ${dim('현재  ')}  ${dim('v' + current)}`);
  ctx.log(`  ${dim('다음  ')}  ${bold(cyan('v' + newVersion))}`);
  ctx.log(`  ${dim('유형  ')}  ${typeBadge}${autoDetected ? '  ' + dim('(자동 감지)') : ''}`);
  ctx.log('');

  // 단계별 결과 수집
  const steps = [];

  const fileWriteRoutine = await runCommandRoutine(ctx, {
    name: 'version:bump',
    targets: ['package.json', 'INTERFACE.md', 'CHANGELOG.md'],
  }, {
    async validate() {
      if (!newVersion || typeof newVersion !== 'string') {
        routineFail('validate', 'newVersion not computed',
          'Check bumpSemver() output before running the routine.');
      }
    },
    async execute() {
      pkg.version = newVersion;
      await ctx.writeJSON('package.json', pkg);
      steps.push({ ok: true, label: 'package.json 업데이트' });

      if (ctx.exists('INTERFACE.md')) {
        try {
          let iface = await ctx.readFile('INTERFACE.md');
          iface = iface.replace(/version:\s*\S+/, `version: ${newVersion}`);
          await ctx.writeFile('INTERFACE.md', iface);
          steps.push({ ok: true, label: 'INTERFACE.md 업데이트' });
        } catch {
          steps.push({ ok: false, label: 'INTERFACE.md 업데이트 실패', level: 'warn' });
        }
      }

      try {
        const entry = await generateForVersion(ctx, newVersion);
        if (entry.trim()) {
          await prependToChangelog(ctx, entry);
          steps.push({ ok: true, label: 'CHANGELOG.md 생성' });
        } else {
          steps.push({ ok: true, label: 'CHANGELOG 생성할 내용 없음', level: 'skip' });
        }
      } catch (e) {
        steps.push({ ok: false, label: `CHANGELOG 생성 실패: ${e.message}`, level: 'warn' });
      }
    },
    async verify() {
      const written = await ctx.readJSON('package.json');
      if (written.version !== newVersion) {
        routineFail('verify', `package.json version mismatch: ${written.version} !== ${newVersion}`,
          'Inspect package.json for concurrent writes.');
      }
    },
  });

  if (!fileWriteRoutine.ok) {
    process.exitCode = 1;
    return;
  }

  // 5. Git commit + tag
  const gitAdd = spawnSync('git', ['add', 'package.json', 'CHANGELOG.md', 'INTERFACE.md'], {
    cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
  });

  if (gitAdd.status === 0) {
    const commitMsg = `chore: bump version to v${newVersion}`;
    const gitCommit = spawnSync('git', ['commit', '-m', commitMsg], {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
    });

    if (gitCommit.status === 0) {
      steps.push({ ok: true, label: `git commit: ${commitMsg}` });

      const gitTag = spawnSync('git', ['tag', '-a', `v${newVersion}`, '-m', `Release v${newVersion}`], {
        cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe',
      });

      if (gitTag.status === 0) {
        steps.push({ ok: true, label: `git tag: v${newVersion}` });
      } else {
        steps.push({ ok: false, label: `git tag 실패: ${gitTag.stderr?.trim() || 'unknown'}`, level: 'warn' });
      }
    } else {
      steps.push({ ok: false, label: `git commit 실패: ${gitCommit.stderr?.trim() || 'unknown'}`, level: 'warn' });
    }
  } else {
    steps.push({ ok: false, label: 'git staging 실패 — 파일만 수정됨', level: 'warn' });
  }

  // ── 결과 카드 ───────────────────────────────────
  const okCount = steps.filter((s) => s.ok).length;
  const failCount = steps.length - okCount;
  const stats = [
    okCount > 0 ? green(`${okCount}✓`) : null,
    failCount > 0 ? yellow(`${failCount}⚠`) : null,
  ].filter(Boolean).join('  ');

  ctx.log(borders.top);
  ctx.log(cardTitle('단계', stats));
  ctx.log(borders.mid);
  for (const s of steps) {
    const icon = s.ok ? green('✓') : yellow('⚠');
    const label = s.ok ? dim(s.label) : s.label;
    ctx.log(cardLine(`${icon} ${label}`));
  }
  ctx.log(borders.bottom);
  ctx.log('');

  if (failCount === 0) {
    ctx.log(`  ${green('●')} ${bold('완료')}  ${dim('v' + current + ' → ')}${green('v' + newVersion)}`);
    ctx.log(`  ${dim('배포:')} ${dim('git push && git push --tags')}`);
  } else {
    ctx.log(`  ${yellow('●')} ${bold('완료 (경고)')}  ${yellow(`${failCount}개 단계 실패`)}`);
    ctx.log(`  ${dim('위 카드의 ⚠ 항목을 검토하세요')}`);
  }
  ctx.log('');

  // 6. Log event
  await ctx.appendJSONL('tasks/pattern-log.jsonl', {
    ts: new Date().toISOString(),
    event: 'version:bump',
    from: current,
    to: newVersion,
    type,
  });
}

// ── sentix version changelog ──────────────────────────

async function showChangelog(ctx) {
  const borders = makeBorders();

  ctx.log('');
  ctx.log(bold(cyan(' Sentix Changelog')) + dim('  ·  다음 릴리즈 미리보기'));
  ctx.log('');

  let currentVersion = 'next';
  if (ctx.exists('package.json')) {
    try {
      const pkg = await ctx.readJSON('package.json');
      currentVersion = pkg.version || 'next';
    } catch { /* use default */ }
  }

  ctx.log(`  ${dim('버전')}  ${cyan('v' + currentVersion)}`);
  ctx.log('');

  try {
    const entry = await generateForVersion(ctx, currentVersion);
    if (entry.trim()) {
      // changelog 는 긴 마크다운이므로 카드가 아닌 그대로 출력 (절단 방지)
      ctx.log(entry);
    } else {
      ctx.log(borders.top);
      ctx.log(cardTitle('미리보기'));
      ctx.log(borders.mid);
      ctx.log(cardLine(`${dim('· 아직 해결된 티켓/사이클 없음')}`));
      ctx.log(cardLine(`  ${dim('└')} ${dim('sentix run 으로 작업 완료 후 다시 시도')}`));
      ctx.log(borders.bottom);
      ctx.log('');
    }
  } catch (e) {
    ctx.log(`  ${red('●')} ${bold('오류')}  ${red(e.message)}`);
    ctx.log('');
    process.exitCode = 1;
  }
}
