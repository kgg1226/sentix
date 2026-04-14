/**
 * sentix update — 프레임워크 파일을 최신 버전으로 동기화
 *
 * sentix 원본 패키지에서 프레임워크 공통 파일을 가져와 로컬 프로젝트를 업데이트한다.
 * 프로젝트 고유 파일(CLAUDE.md, .sentix/config.toml, providers/, env-profiles/)은 건드리지 않는다.
 *
 * 사용법:
 *   sentix update          # 실제 업데이트
 *   sentix update --dry    # 변경 사항만 미리 확인
 */

import { registerCommand } from '../registry.js';
import { VERSION } from '../version.js';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sentixRoot = resolve(__dirname, '..', '..');

// 동기화 대상: 프레임워크 공통 파일 (모든 프로젝트가 동일해야 하는 것)
const SYNC_FILES = [
  // CI/CD
  { src: '.github/workflows/deploy.yml',        dst: '.github/workflows/deploy.yml' },
  { src: '.github/workflows/security-scan.yml',  dst: '.github/workflows/security-scan.yml' },

  // 하드 룰 + 검증
  { src: '.sentix/rules/hard-rules.md',          dst: '.sentix/rules/hard-rules.md' },
  { src: 'scripts/pre-commit.js',                dst: 'scripts/pre-commit.js' },

  // Sentix enforcement hooks (Claude Code integration)
  { src: 'scripts/hooks/session-start.sh',       dst: 'scripts/hooks/session-start.sh' },
  { src: 'scripts/hooks/user-prompt-reminder.sh', dst: 'scripts/hooks/user-prompt-reminder.sh' },
  { src: 'scripts/hooks/require-ticket.js',      dst: 'scripts/hooks/require-ticket.js' },

  // 프레임워크 문서
  { src: 'FRAMEWORK.md',                         dst: 'FRAMEWORK.md' },
  { src: 'docs/governor-sop.md',                 dst: 'docs/governor-sop.md' },
  { src: 'docs/agent-scopes.md',                 dst: 'docs/agent-scopes.md' },
  { src: 'docs/agent-methods.md',                dst: 'docs/agent-methods.md' },
  { src: 'docs/severity.md',                     dst: 'docs/severity.md' },
  { src: 'docs/architecture.md',                 dst: 'docs/architecture.md' },

  // Claude Code 조건부 규칙 (paths frontmatter)
  { src: '.claude/rules/hard-rules.md',          dst: '.claude/rules/hard-rules.md' },
  { src: '.claude/rules/testing.md',             dst: '.claude/rules/testing.md' },
  { src: '.claude/rules/ci-workflows.md',        dst: '.claude/rules/ci-workflows.md' },
  { src: '.claude/rules/pipeline.md',            dst: '.claude/rules/pipeline.md' },
  { src: '.claude/rules/versioning.md',          dst: '.claude/rules/versioning.md' },

  // Claude Code 네이티브 에이전트
  { src: '.claude/settings.json',                dst: '.claude/settings.json' },
  { src: '.claude/agents/planner.md',            dst: '.claude/agents/planner.md' },
  { src: '.claude/agents/dev.md',                dst: '.claude/agents/dev.md' },
  { src: '.claude/agents/pr-review.md',          dst: '.claude/agents/pr-review.md' },
  { src: '.claude/agents/dev-fix.md',            dst: '.claude/agents/dev-fix.md' },
  { src: '.claude/agents/security.md',           dst: '.claude/agents/security.md' },

  // 토큰 절감용 ignore 파일
  { src: '.claudeignore',                        dst: '.claudeignore' },
];

// ── Worktree 감지: 현재 위치 + main working tree ────────

function getUpdateTargets(ctx) {
  const cwd = resolve(ctx.cwd);
  const targets = [cwd];
  let worktreeNote = null;

  try {
    // git worktree인지 확인
    execSync('git rev-parse --git-common-dir', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // main working tree 경로 찾기
    const worktreeList = execSync('git worktree list --porcelain', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    });

    const mainMatch = worktreeList.match(/^worktree (.+)$/m);
    if (mainMatch) {
      const mainRoot = mainMatch[1].trim();
      const resolvedMain = resolve(mainRoot);
      if (resolvedMain !== cwd && existsSync(resolvedMain)) {
        targets.push(resolvedMain);
        worktreeNote = resolvedMain;
      }
    }
  } catch {
    // git 없거나 worktree 아님 — 현재 디렉토리만
  }

  return { targets, worktreeNote };
}

// ── 파일 동기화 실행 ─────────────────────────────────────

/**
 * 파일을 동기화하고 결과를 { updated, created, skipped, unchanged } 로 반환.
 * 출력은 하지 않음 — caller 가 카드 형식으로 렌더링.
 */
async function syncFilesQuiet(targetDir, dryRun) {
  const results = { updated: [], created: [], skipped: [], unchanged: [] };

  for (const { src, dst } of SYNC_FILES) {
    const srcPath = resolve(sentixRoot, src);
    const dstPath = resolve(targetDir, dst);

    if (!existsSync(srcPath)) {
      results.skipped.push({ file: dst, reason: 'source not found' });
      continue;
    }

    const srcContent = readFileSync(srcPath, 'utf-8');

    if (existsSync(dstPath)) {
      const dstContent = readFileSync(dstPath, 'utf-8');

      if (srcContent === dstContent) {
        results.unchanged.push(dst);
        continue;
      }

      const srcLines = srcContent.split('\n').length;
      const dstLines = dstContent.split('\n').length;
      const delta = srcLines - dstLines;

      if (!dryRun) {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, srcContent);
      }
      results.updated.push({ file: dst, delta });
    } else {
      if (!dryRun) {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, srcContent);
      }
      results.created.push(dst);
    }
  }

  return results;
}

registerCommand('update', {
  description: 'Update framework files to the latest sentix version',
  usage: 'sentix update [--dry]',

  async run(args, ctx) {
    const dryRun = args.includes('--dry');
    const borders = makeBorders();

    ctx.log('');
    ctx.log(bold(cyan(' Sentix Update')) + dim('  ·  프레임워크 동기화'));
    ctx.log('');

    // sentix 원본에서 실행 중인지 확인
    if (resolve(ctx.cwd) === resolve(sentixRoot)) {
      ctx.log(`  ${red('●')} ${bold('차단')}  ${red('sentix 저장소 자체에서는 실행할 수 없음')}`);
      ctx.log(`  ${dim('다운스트림 프로젝트에서 실행하세요')}`);
      ctx.log('');
      process.exitCode = 1;
      return;
    }

    // 업데이트 대상 수집
    const { targets, worktreeNote } = getUpdateTargets(ctx);

    ctx.log(`  ${dim('소스  ')}  ${dim(sentixRoot)}`);
    ctx.log(`  ${dim('버전  ')}  ${cyan('v' + VERSION)}`);
    ctx.log(`  ${dim('모드  ')}  ${dryRun ? yellow('dry-run (미리보기)') : green('실제 적용')}`);
    ctx.log(`  ${dim('대상  ')}  ${targets.length}개${worktreeNote ? dim(` (worktree + main)`) : ''}`);
    if (worktreeNote) {
      ctx.log(`  ${dim('      ')}  ${dim('main: ' + worktreeNote)}`);
    }
    ctx.log('');

    // 각 타겟별 처리
    let grandUpdated = 0, grandCreated = 0, grandUnchanged = 0, grandSkipped = 0;

    for (const target of targets) {
      // sentix가 초기화된 프로젝트인지 확인
      const hasConfig = existsSync(resolve(target, '.sentix/config.toml'));
      const hasClaude = existsSync(resolve(target, 'CLAUDE.md'));
      if (!hasConfig && !hasClaude) {
        ctx.log(borders.top);
        ctx.log(cardTitle(shortPath(target), yellow('skip')));
        ctx.log(borders.mid);
        ctx.log(cardLine(`${yellow('⚠')} sentix 프로젝트가 아님 — .sentix/config.toml 또는 CLAUDE.md 필요`));
        ctx.log(borders.bottom);
        ctx.log('');
        continue;
      }

      const results = await syncFilesQuiet(target, dryRun);

      // README 버전 자동 갱신
      if (!dryRun) {
        updateReadmeVersion(target, VERSION);
      }
      grandUpdated += results.updated.length;
      grandCreated += results.created.length;
      grandUnchanged += results.unchanged.length;
      grandSkipped += results.skipped.length;

      const changeCount = results.updated.length + results.created.length;
      const stats = [
        results.updated.length > 0 ? cyan(`${results.updated.length}↻`)   : null,
        results.created.length > 0 ? green(`${results.created.length}+`)  : null,
        results.unchanged.length > 0 ? dim(`${results.unchanged.length}=`) : null,
        results.skipped.length > 0 ? yellow(`${results.skipped.length}?`) : null,
      ].filter(Boolean).join('  ');

      ctx.log(borders.top);
      ctx.log(cardTitle(shortPath(target), stats));
      ctx.log(borders.mid);

      if (changeCount === 0 && results.skipped.length === 0) {
        ctx.log(cardLine(`${green('✓')} ${dim('최신 상태 — 변경 없음')} ${dim('(' + results.unchanged.length + '개 파일 확인)')}`));
      } else {
        // 생성된 파일 (+)
        for (const f of results.created) {
          ctx.log(cardLine(`${green('+')} ${f}${dryRun ? dim('  (dry-run)') : ''}`));
        }
        // 업데이트된 파일 (↻) with delta
        for (const { file, delta } of results.updated) {
          const deltaStr = delta > 0 ? green(`+${delta}`) : delta < 0 ? red(String(delta)) : dim('0');
          ctx.log(cardLine(`${cyan('↻')} ${file}  ${dim('(' + deltaStr + dim(' 줄)') + ')')}${dryRun ? dim('  (dry-run)') : ''}`));
        }
        // 스킵된 파일 (?)
        for (const { file, reason } of results.skipped) {
          ctx.log(cardLine(`${yellow('?')} ${file} ${dim('— ' + reason)}`));
        }
        if (results.unchanged.length > 0) {
          ctx.log(cardLine(`${dim('·')} ${dim(`${results.unchanged.length}개 파일 변경 없음`)}`));
        }
      }
      ctx.log(borders.bottom);
      ctx.log('');
    }

    // ── 최종 배너 ──────────────────────────────────
    const totalChanges = grandUpdated + grandCreated;
    if (totalChanges === 0) {
      ctx.log(`  ${green('●')} ${bold('최신 상태')}  ${dim('모든 파일이 sentix v' + VERSION + ' 와 동기화됨')}`);
    } else if (dryRun) {
      ctx.log(`  ${yellow('●')} ${bold('DRY RUN')}  ${yellow(`${totalChanges}개 파일 변경 예정`)} ${dim(`(실제 적용: sentix update)`)}`);
    } else {
      ctx.log(`  ${green('●')} ${bold('완료')}  ${green(`${totalChanges}개 파일 sentix v${VERSION} 로 동기화`)}`);
    }
    ctx.log('');
  },
});

/** README.md 첫 줄의 버전을 현재 sentix 버전으로 갱신 */
function updateReadmeVersion(targetDir, version) {
  const readmePath = resolve(targetDir, 'README.md');
  if (!existsSync(readmePath)) return;

  try {
    const content = readFileSync(readmePath, 'utf-8');
    const updated = content.replace(
      /^# Sentix `v[\d.]+`/m,
      `# Sentix \`v${version}\``
    );
    if (updated !== content) {
      writeFileSync(readmePath, updated);
    }
  } catch { /* non-critical */ }
}

/** 긴 경로를 축약해서 표시 (마지막 2개 세그먼트만) */
function shortPath(fullPath) {
  const parts = fullPath.split(/[/\\]/).filter(Boolean);
  if (parts.length <= 2) return fullPath;
  return '…/' + parts.slice(-2).join('/');
}
