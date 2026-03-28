/**
 * sentix evolve — 자기 개선 루프
 *
 * sentix가 자기 자신의 코드를 분석하고 개선점을 찾아 티켓을 생성한다.
 * --auto 플래그를 붙이면 sentix run으로 직접 수정까지 실행한다.
 *
 * 사용법:
 *   sentix evolve           # 분석 + 티켓 생성만
 *   sentix evolve --auto    # 분석 + 티켓 생성 + sentix run으로 자동 수정
 */

import { spawnSync } from 'node:child_process';
import { registerCommand } from '../registry.js';
import { runGates } from '../lib/verify-gates.js';

registerCommand('evolve', {
  description: 'Self-analyze and improve (Layer 5)',
  usage: 'sentix evolve [--auto]',

  async run(args, ctx) {
    const autoFix = args.includes('--auto');
    ctx.log('=== Sentix Self-Evolution ===\n');

    const issues = [];

    // ── 1. 테스트 상태 ──────────────────────────────
    ctx.log('--- Test Health ---\n');
    const testResult = spawnSync('npm', ['test'], {
      cwd: ctx.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 60000,
    });

    if (testResult.status === 0) {
      const passMatch = testResult.stdout.match(/# pass (\d+)/);
      const failMatch = testResult.stdout.match(/# fail (\d+)/);
      ctx.success(`Tests: ${passMatch?.[1] || '?'} passed, ${failMatch?.[1] || '0'} failed`);
    } else {
      ctx.error('Tests: FAILING');
      issues.push({
        type: 'bug',
        severity: 'critical',
        title: 'Tests are failing',
        detail: testResult.stderr?.slice(-300) || 'Unknown error',
      });
    }

    // ── 2. 검증 게이트 ──────────────────────────────
    ctx.log('\n--- Verification Gates ---\n');
    const gates = runGates(ctx.cwd);

    if (gates.passed) {
      ctx.success(`Gates: ${gates.checks.length}/${gates.checks.length} passed`);
    } else {
      for (const v of gates.violations) {
        ctx.warn(`Gate violation: [${v.rule}] ${v.message}`);
        issues.push({
          type: 'bug',
          severity: 'warning',
          title: `Gate violation: ${v.rule}`,
          detail: v.message,
        });
      }
    }

    // ── 3. Doctor 체크 ──────────────────────────────
    ctx.log('\n--- Doctor ---\n');

    const requiredFiles = [
      'CLAUDE.md', 'FRAMEWORK.md', '.sentix/config.toml',
      '.sentix/rules/hard-rules.md', 'tasks/lessons.md',
      'docs/governor-sop.md', 'docs/architecture.md',
    ];

    for (const file of requiredFiles) {
      if (!ctx.exists(file)) {
        ctx.warn(`Missing: ${file}`);
        issues.push({
          type: 'bug',
          severity: 'suggestion',
          title: `Missing file: ${file}`,
          detail: `Required file ${file} does not exist`,
        });
      }
    }

    if (requiredFiles.every(f => ctx.exists(f))) {
      ctx.success('All required files present');
    }

    // ── 4. 코드 품질 (간이 분석) ────────────────────
    ctx.log('\n--- Code Quality ---\n');

    // 큰 파일 탐지
    const { readdirSync, statSync } = await import('node:fs');
    const { resolve, join } = await import('node:path');

    const bigFiles = [];
    function scanDir(dir, prefix = '') {
      try {
        const entries = readdirSync(resolve(ctx.cwd, dir), { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const relPath = join(prefix, entry.name);
          if (entry.isDirectory()) {
            scanDir(join(dir, entry.name), relPath);
          } else if (entry.name.endsWith('.js')) {
            const stat = statSync(resolve(ctx.cwd, dir, entry.name));
            const lines = Math.round(stat.size / 40); // 대략적 줄 수
            if (lines > 300) {
              bigFiles.push({ path: relPath, lines });
            }
          }
        }
      } catch { /* 접근 불가 디렉토리 무시 */ }
    }

    scanDir('src');
    scanDir('bin');

    if (bigFiles.length > 0) {
      for (const f of bigFiles) {
        ctx.warn(`Large file: ${f.path} (~${f.lines} lines) — consider splitting`);
        issues.push({
          type: 'feature',
          severity: 'suggestion',
          title: `Refactor: ${f.path} is too large (~${f.lines} lines)`,
          detail: `Consider splitting into smaller modules`,
        });
      }
    } else {
      ctx.success('No oversized files');
    }

    // ── 5. 학습 파일 상태 ───────────────────────────
    ctx.log('\n--- Learning Health ---\n');

    if (ctx.exists('tasks/lessons.md')) {
      const lessons = await ctx.readFile('tasks/lessons.md');
      const lessonCount = (lessons.match(/^##/gm) || []).length;
      ctx.log(`  Lessons: ${lessonCount} entries`);
    }

    if (ctx.exists('tasks/agent-metrics.jsonl')) {
      const metrics = await ctx.readFile('tasks/agent-metrics.jsonl');
      const lineCount = metrics.trim().split('\n').filter(Boolean).length;
      ctx.log(`  Metrics: ${lineCount} records`);
    } else {
      ctx.log('  Metrics: (empty — run sentix run to collect)');
    }

    // ── 결과 요약 ───────────────────────────────────
    ctx.log('\n=== Evolution Summary ===\n');

    if (issues.length === 0) {
      ctx.success('No issues found. Sentix is in good shape.');
      return;
    }

    ctx.log(`Found ${issues.length} issue(s):\n`);

    const critical = issues.filter(i => i.severity === 'critical');
    const warnings = issues.filter(i => i.severity === 'warning');
    const suggestions = issues.filter(i => i.severity === 'suggestion');

    if (critical.length > 0) {
      ctx.error(`  Critical: ${critical.length}`);
      for (const i of critical) ctx.log(`    - ${i.title}`);
    }
    if (warnings.length > 0) {
      ctx.warn(`  Warning: ${warnings.length}`);
      for (const i of warnings) ctx.log(`    - ${i.title}`);
    }
    if (suggestions.length > 0) {
      ctx.log(`  Suggestion: ${suggestions.length}`);
      for (const i of suggestions) ctx.log(`    - ${i.title}`);
    }

    // ── 티켓 생성 ───────────────────────────────────
    if (critical.length > 0 || warnings.length > 0) {
      ctx.log('');
      for (const issue of [...critical, ...warnings]) {
        const cmdType = issue.type === 'feature' ? 'feature add' : 'ticket create';
        const severityFlag = issue.severity === 'critical' ? ' --severity critical' : '';
        ctx.log(`  → sentix ${cmdType} "${issue.title}"${severityFlag}`);
      }

      // --auto: 가장 심각한 이슈를 sentix run으로 자동 수정
      if (autoFix && critical.length > 0) {
        ctx.log('\n--- Auto-fix (critical issues) ---\n');
        const firstIssue = critical[0];

        ctx.log(`Running: sentix run "${firstIssue.title}"\n`);
        spawnSync('node', ['bin/sentix.js', 'run', firstIssue.title], {
          cwd: ctx.cwd,
          stdio: 'inherit',
          timeout: 600_000,
        });
      }
    }
  },
});
