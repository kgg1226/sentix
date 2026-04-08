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
import { colors, makeBorders, cardLine, cardTitle } from '../lib/ui-box.js';

const { dim, bold, red, green, yellow, cyan } = colors;

registerCommand('evolve', {
  description: 'Self-analyze and improve (Layer 5)',
  usage: 'sentix evolve [--auto]',

  async run(args, ctx) {
    const autoFix = args.includes('--auto');
    const borders = makeBorders();
    const issues = [];

    ctx.log('');
    ctx.log(bold(cyan(' Sentix Evolve')) + dim('  ·  자기 분석 및 개선 (Layer 5)'));
    ctx.log('');

    // ── 1. 테스트 상태 ──────────────────────────────
    const testResult = spawnSync('npm', ['test'], {
      cwd: ctx.cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 60000,
    });
    let testStats = null;
    if (testResult.status === 0) {
      const passMatch = testResult.stdout.match(/# pass (\d+)/);
      const failMatch = testResult.stdout.match(/# fail (\d+)/);
      testStats = { pass: parseInt(passMatch?.[1] || '0', 10), fail: parseInt(failMatch?.[1] || '0', 10), ok: true };
    } else {
      testStats = { pass: 0, fail: 0, ok: false };
      issues.push({
        type: 'bug', severity: 'critical',
        title: 'Tests are failing',
        detail: testResult.stderr?.slice(-300) || 'Unknown error',
      });
    }

    // ── 2. 검증 게이트 ──────────────────────────────
    const gates = runGates(ctx.cwd);
    if (!gates.passed) {
      for (const v of gates.violations) {
        issues.push({
          type: 'bug', severity: 'warning',
          title: `Gate violation: ${v.rule}`,
          detail: v.message,
        });
      }
    }

    // ── 3. Doctor 체크 ──────────────────────────────
    const requiredFiles = [
      'CLAUDE.md', 'FRAMEWORK.md', '.sentix/config.toml',
      '.sentix/rules/hard-rules.md', 'tasks/lessons.md',
      'docs/governor-sop.md', 'docs/architecture.md',
    ];
    const missingFiles = requiredFiles.filter((f) => !ctx.exists(f));
    for (const file of missingFiles) {
      issues.push({
        type: 'bug', severity: 'suggestion',
        title: `Missing file: ${file}`,
        detail: `Required file ${file} does not exist`,
      });
    }

    // ── 4. 코드 품질 (큰 파일 탐지) ─────────────────
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
            const lines = Math.round(stat.size / 40);
            if (lines > 300) bigFiles.push({ path: relPath, lines });
          }
        }
      } catch { /* 접근 불가 디렉토리 무시 */ }
    }
    scanDir('src');
    scanDir('bin');

    for (const f of bigFiles) {
      issues.push({
        type: 'feature', severity: 'suggestion',
        title: `Refactor: ${f.path} is too large (~${f.lines} lines)`,
        detail: `Consider splitting into smaller modules`,
      });
    }

    // ── 5. 학습 파일 상태 ───────────────────────────
    let lessonCount = null;
    let metricsCount = null;
    if (ctx.exists('tasks/lessons.md')) {
      const lessons = await ctx.readFile('tasks/lessons.md');
      lessonCount = (lessons.match(/^##/gm) || []).length;
    }
    if (ctx.exists('tasks/agent-metrics.jsonl')) {
      const metrics = await ctx.readFile('tasks/agent-metrics.jsonl');
      metricsCount = metrics.trim().split('\n').filter(Boolean).length;
    }

    // ── 핵심 요약 ──────────────────────────────────
    const critical = issues.filter((i) => i.severity === 'critical');
    const warnings = issues.filter((i) => i.severity === 'warning');
    const suggestions = issues.filter((i) => i.severity === 'suggestion');
    const overallStatus =
      critical.length > 0 ? red('critical')   :
      warnings.length > 0 ? yellow('warnings') :
      suggestions.length > 0 ? cyan('suggestions') :
                               green('완벽');

    ctx.log(`  ${dim('총 이슈')}   ${String(issues.length).padStart(3)}     ${dim('상태')}  ${overallStatus}`);
    ctx.log(`  ${dim('치명적 ')}   ${(critical.length > 0 ? red : dim)(String(critical.length).padStart(3))}     ${dim('테스트')}  ${testStats.ok ? green(`${testStats.pass}✓`) : red('FAILING')}`);
    ctx.log(`  ${dim('경고   ')}   ${(warnings.length > 0 ? yellow : dim)(String(warnings.length).padStart(3))}     ${dim('게이트')}  ${gates.passed ? green('pass') : yellow('violated')}`);
    ctx.log(`  ${dim('제안   ')}   ${(suggestions.length > 0 ? cyan : dim)(String(suggestions.length).padStart(3))}`);
    ctx.log('');

    // ── 카드 1: 검사 결과 ──────────────────────────
    ctx.log(borders.top);
    ctx.log(cardTitle('검사 결과'));
    ctx.log(borders.mid);
    ctx.log(cardLine(`${testStats.ok ? green('✓') : red('✗')} 테스트  ${dim(`${testStats.pass}/${testStats.pass + testStats.fail} 통과`)}`));
    ctx.log(cardLine(`${gates.passed ? green('✓') : yellow('⚠')} 검증 게이트  ${dim(`${gates.checks.length - (gates.violations?.length || 0)}/${gates.checks.length} 통과`)}`));
    ctx.log(cardLine(`${missingFiles.length === 0 ? green('✓') : yellow('⚠')} 필수 문서  ${dim(`${requiredFiles.length - missingFiles.length}/${requiredFiles.length} 존재`)}`));
    ctx.log(cardLine(`${bigFiles.length === 0 ? green('✓') : cyan('·')} 코드 품질  ${dim(bigFiles.length === 0 ? '과대 파일 없음' : `${bigFiles.length}개 파일 300줄 초과`)}`));
    const learnInfo = [
      lessonCount !== null ? `lessons ${lessonCount}` : null,
      metricsCount !== null ? `metrics ${metricsCount}` : null,
    ].filter(Boolean).join('  ');
    ctx.log(cardLine(`${green('·')} 학습 상태  ${dim(learnInfo || '데이터 없음')}`));
    ctx.log(borders.bottom);
    ctx.log('');

    // ── 결과 분기 ───────────────────────────────────
    if (issues.length === 0) {
      ctx.log(`  ${green('●')} ${bold('완벽')}  ${green('발견된 이슈 없음 — sentix 가 좋은 상태입니다')}`);
      ctx.log('');
      return;
    }

    // ── 카드 2: 이슈 목록 (심각도 순) ──────────────
    ctx.log(borders.top);
    const stats = [
      critical.length > 0 ? red(`${critical.length}✗`) : null,
      warnings.length > 0 ? yellow(`${warnings.length}⚠`) : null,
      suggestions.length > 0 ? cyan(`${suggestions.length}·`) : null,
    ].filter(Boolean).join('  ');
    ctx.log(cardTitle('발견된 이슈', stats));
    ctx.log(borders.mid);
    const ordered = [...critical, ...warnings, ...suggestions];
    for (const issue of ordered) {
      const icon =
        issue.severity === 'critical'   ? red('✗') :
        issue.severity === 'warning'    ? yellow('⚠') :
                                          cyan('·');
      ctx.log(cardLine(`${icon} ${issue.title}`));
    }
    ctx.log(borders.bottom);
    ctx.log('');

    // ── 권장 티켓 생성 명령 ────────────────────────
    if (critical.length > 0 || warnings.length > 0) {
      ctx.log(`  ${bold('권장 티켓 생성')}`);
      for (const issue of [...critical, ...warnings]) {
        const cmdType = issue.type === 'feature' ? 'feature add' : 'ticket create';
        const severityFlag = issue.severity === 'critical' ? ' --severity critical' : '';
        ctx.log(`    ${green('→')} ${dim(`sentix ${cmdType} "${issue.title}"${severityFlag}`)}`);
      }
      ctx.log('');

      // --auto: 가장 심각한 이슈를 sentix run으로 자동 수정
      if (autoFix && critical.length > 0) {
        const firstIssue = critical[0];
        ctx.log(`  ${yellow('●')} ${bold('Auto-fix')}  ${dim(`sentix run "${firstIssue.title}"`)}`);
        ctx.log('');
        spawnSync('node', ['bin/sentix.js', 'run', firstIssue.title], {
          cwd: ctx.cwd, stdio: 'inherit', timeout: 600_000,
        });
      }
    }
  },
});
