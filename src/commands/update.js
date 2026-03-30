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
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
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

  // Claude Code 네이티브 에이전트
  { src: '.claude/settings.json',                dst: '.claude/settings.json' },
  { src: '.claude/agents/planner.md',            dst: '.claude/agents/planner.md' },
  { src: '.claude/agents/dev.md',                dst: '.claude/agents/dev.md' },
  { src: '.claude/agents/pr-review.md',          dst: '.claude/agents/pr-review.md' },
  { src: '.claude/agents/dev-fix.md',            dst: '.claude/agents/dev-fix.md' },
  { src: '.claude/agents/security.md',           dst: '.claude/agents/security.md' },
];

registerCommand('update', {
  description: 'Update framework files to the latest sentix version',
  usage: 'sentix update [--dry]',

  async run(args, ctx) {
    const dryRun = args.includes('--dry');

    ctx.log(`sentix update v${VERSION}`);
    ctx.log(`source: ${sentixRoot}`);
    ctx.log(`target: ${ctx.cwd}`);
    if (dryRun) ctx.warn('DRY RUN — no files will be changed\n');
    else ctx.log('');

    // sentix 원본에서 실행 중인지 확인
    if (resolve(ctx.cwd) === resolve(sentixRoot)) {
      ctx.error('Cannot update sentix itself. Run this from a downstream project.');
      return;
    }

    // sentix가 초기화된 프로젝트인지 확인
    if (!ctx.exists('.sentix/config.toml') && !ctx.exists('CLAUDE.md')) {
      ctx.error('This project has not been initialized with sentix.');
      ctx.log('Run: sentix init');
      return;
    }

    const results = { updated: [], created: [], skipped: [], unchanged: [] };

    for (const { src, dst } of SYNC_FILES) {
      const srcPath = resolve(sentixRoot, src);

      // 원본 파일이 없으면 스킵
      if (!existsSync(srcPath)) {
        results.skipped.push({ file: dst, reason: 'source not found' });
        continue;
      }

      const srcContent = readFileSync(srcPath, 'utf-8');

      if (ctx.exists(dst)) {
        const dstContent = await ctx.readFile(dst);

        if (srcContent === dstContent) {
          results.unchanged.push(dst);
          continue;
        }

        // diff 요약 생성
        const srcLines = srcContent.split('\n');
        const dstLines = dstContent.split('\n');
        const added = srcLines.length - dstLines.length;

        ctx.log(`${dryRun ? '[DRY] ' : ''}Updating: ${dst}`);
        ctx.log(`  ${dstLines.length} lines → ${srcLines.length} lines (${added >= 0 ? '+' : ''}${added})`);

        // 주요 변경 내용 표시 (새로 추가된 라인 중 의미 있는 것)
        const dstSet = new Set(dstLines.map(l => l.trim()));
        const newLines = srcLines
          .filter(l => l.trim() && !l.trim().startsWith('#') && !dstSet.has(l.trim()))
          .slice(0, 5);
        if (newLines.length > 0) {
          ctx.log('  New:');
          for (const line of newLines) {
            ctx.log(`    + ${line.trim().substring(0, 80)}`);
          }
        }

        if (!dryRun) {
          await ctx.writeFile(dst, srcContent);
          ctx.success(`Updated: ${dst}`);
        }
        results.updated.push(dst);
      } else {
        ctx.log(`${dryRun ? '[DRY] ' : ''}Creating: ${dst}`);
        if (!dryRun) {
          await ctx.writeFile(dst, srcContent);
          ctx.success(`Created: ${dst}`);
        }
        results.created.push(dst);
      }
    }

    // 요약
    ctx.log('\n=== Update Summary ===');
    if (results.updated.length > 0) {
      ctx.log(`Updated:   ${results.updated.length} file(s)`);
      for (const f of results.updated) ctx.log(`  ${f}`);
    }
    if (results.created.length > 0) {
      ctx.log(`Created:   ${results.created.length} file(s)`);
      for (const f of results.created) ctx.log(`  ${f}`);
    }
    if (results.unchanged.length > 0) {
      ctx.log(`Unchanged: ${results.unchanged.length} file(s)`);
    }
    if (results.skipped.length > 0) {
      ctx.warn(`Skipped:   ${results.skipped.length} file(s)`);
      for (const s of results.skipped) ctx.log(`  ${s.file} (${s.reason})`);
    }

    const totalChanges = results.updated.length + results.created.length;
    if (totalChanges === 0) {
      ctx.success('\nAlready up to date.');
    } else if (dryRun) {
      ctx.warn(`\n${totalChanges} file(s) would be changed. Run without --dry to apply.`);
    } else {
      ctx.success(`\n${totalChanges} file(s) updated to sentix v${VERSION}.`);
      ctx.log('Run: sentix doctor  — to verify project health');
    }
  },
});
