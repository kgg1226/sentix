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
];

// ── Worktree 감지: 현재 위치 + main working tree ────────

function getUpdateTargets(ctx) {
  const cwd = resolve(ctx.cwd);
  const targets = [cwd];

  try {
    // git worktree인지 확인
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const mainGitDir = resolve(cwd, gitCommonDir);

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
        ctx.log(`Worktree detected → also updating main: ${resolvedMain}`);
      }
    }
  } catch {
    // git 없거나 worktree 아님 — 현재 디렉토리만
  }

  return targets;
}

// ── 파일 동기화 실행 ─────────────────────────────────────

async function syncFiles(targetDir, dryRun, ctx) {
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

      const srcLines = srcContent.split('\n');
      const dstLines = dstContent.split('\n');
      const added = srcLines.length - dstLines.length;

      ctx.log(`${dryRun ? '[DRY] ' : ''}Updating: ${dst}`);
      ctx.log(`  ${dstLines.length} lines → ${srcLines.length} lines (${added >= 0 ? '+' : ''}${added})`);

      if (!dryRun) {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, srcContent);
        ctx.success(`Updated: ${dst}`);
      }
      results.updated.push(dst);
    } else {
      ctx.log(`${dryRun ? '[DRY] ' : ''}Creating: ${dst}`);
      if (!dryRun) {
        mkdirSync(dirname(dstPath), { recursive: true });
        writeFileSync(dstPath, srcContent);
        ctx.success(`Created: ${dst}`);
      }
      results.created.push(dst);
    }
  }

  // 요약
  const totalChanges = results.updated.length + results.created.length;
  if (results.updated.length > 0) {
    ctx.log(`Updated: ${results.updated.length} — ${results.updated.join(', ')}`);
  }
  if (results.created.length > 0) {
    ctx.log(`Created: ${results.created.length} — ${results.created.join(', ')}`);
  }
  if (totalChanges === 0) {
    ctx.success('Already up to date.');
  } else if (!dryRun) {
    ctx.success(`${totalChanges} file(s) updated to sentix v${VERSION}.`);
  }
}

registerCommand('update', {
  description: 'Update framework files to the latest sentix version',
  usage: 'sentix update [--dry]',

  async run(args, ctx) {
    const dryRun = args.includes('--dry');

    ctx.log(`sentix update v${VERSION}`);
    ctx.log(`source: ${sentixRoot}`);

    // sentix 원본에서 실행 중인지 확인
    if (resolve(ctx.cwd) === resolve(sentixRoot)) {
      ctx.error('Cannot update sentix itself. Run this from a downstream project.');
      return;
    }

    // 업데이트 대상 디렉토리 수집 (현재 + worktree면 root도)
    const targets = getUpdateTargets(ctx);

    for (const target of targets) {
      ctx.log(`\n--- target: ${target} ---`);
      if (dryRun) ctx.warn('DRY RUN\n');

      // sentix가 초기화된 프로젝트인지 확인
      const hasConfig = existsSync(resolve(target, '.sentix/config.toml'));
      const hasClaude = existsSync(resolve(target, 'CLAUDE.md'));
      if (!hasConfig && !hasClaude) {
        ctx.warn(`Not a sentix project: ${target} — skipping`);
        continue;
      }

      await syncFiles(target, dryRun, ctx);
    }
  },
});
