/**
 * quality-gate.js — Deterministic code quality checks
 *
 * dev 완료 후, pr-review 전에 실행되는 결정론적 품질 게이트.
 * AI 판단이 아닌 기계적 검증으로 코드 결함을 잡는다.
 *
 * 검사 항목:
 *   1. Banned patterns — eval(), Function(), innerHTML, 하드코딩 시크릿
 *   2. Debug artifacts — console.log in src/ (테스트/스크립트 제외)
 *   3. Syntax check — node --check on modified .js files
 *   4. npm audit — known security vulnerabilities
 *   5. Test regression — pre-fix 대비 테스트 수 감소 감지
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Banned pattern definitions ──────────────────────────

const BANNED_PATTERNS = [
  {
    name: 'eval',
    pattern: /\beval\s*\(/,
    severity: 'error',
    message: 'eval() is a security risk — use safer alternatives',
  },
  {
    name: 'Function-constructor',
    pattern: /\bnew\s+Function\s*\(/,
    severity: 'error',
    message: 'new Function() is equivalent to eval — use safer alternatives',
  },
  {
    name: 'innerHTML',
    pattern: /\.innerHTML\s*=/,
    severity: 'warning',
    message: 'innerHTML assignment risks XSS — use textContent or sanitize',
  },
  {
    name: 'hardcoded-secret',
    pattern: /(?:password|secret|api_?key|token|credential)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    severity: 'error',
    message: 'Possible hardcoded secret — use environment variables',
  },
];

// ── Main entry point ────────────────────────────────────

/**
 * Run all quality gate checks.
 * @param {string} cwd - Working directory
 * @param {object} [options]
 * @param {boolean} [options.skipAudit] - Skip npm audit (e.g. offline)
 * @returns {object} Quality gate results
 */
export function runQualityGate(cwd, options = {}) {
  const results = {
    passed: true,
    checks: [],
    summary: '',
    total_issues: 0,
  };

  const diff = getAddedLines(cwd);

  // Check 1: Banned patterns
  const bannedResult = checkBannedPatterns(diff);
  results.checks.push(bannedResult);

  // Check 2: Debug artifacts (console.log in src/)
  const debugResult = checkDebugArtifacts(diff);
  results.checks.push(debugResult);

  // Check 3: Syntax validation
  const syntaxResult = checkSyntax(cwd);
  results.checks.push(syntaxResult);

  // Check 4: npm audit
  if (!options.skipAudit) {
    const auditResult = checkNpmAudit(cwd);
    results.checks.push(auditResult);
  }

  // Check 5: Test regression
  const regressionResult = checkTestRegression(cwd);
  results.checks.push(regressionResult);

  // Aggregate
  for (const check of results.checks) {
    if (!check.passed) {
      results.passed = false;
    }
    results.total_issues += check.issues.length;
  }

  const passCount = results.checks.filter((c) => c.passed).length;
  results.summary = `Quality gate: ${passCount}/${results.checks.length} checks passed, ${results.total_issues} issue(s)`;

  return results;
}

// ── Git diff: extract added lines ───────────────────────

function getAddedLines(cwd) {
  let diffContent;
  try {
    diffContent = execSync('git diff HEAD 2>/dev/null || git diff', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
  } catch {
    return { files: [], addedLines: [] };
  }

  const addedLines = [];
  const files = new Set();
  let currentFile = null;
  let lineNum = 0;

  for (const line of diffContent.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : null;
      if (currentFile) files.add(currentFile);
    } else if (line.startsWith('@@')) {
      const match = line.match(/\+(\d+)/);
      lineNum = match ? parseInt(match[1]) - 1 : 0;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      if (currentFile) {
        addedLines.push({
          file: currentFile,
          line: line.slice(1),
          lineNum,
        });
      }
    } else if (!line.startsWith('-')) {
      lineNum++;
    }
  }

  return { files: [...files], addedLines };
}

// ── Check 1: Banned patterns ────────────────────────────

function checkBannedPatterns(diff) {
  const result = {
    name: 'banned-patterns',
    passed: true,
    issues: [],
    detail: '',
  };

  for (const { file, line, lineNum } of diff.addedLines) {
    // Skip test files and config files
    if (isTestOrConfig(file)) continue;

    for (const banned of BANNED_PATTERNS) {
      if (banned.pattern.test(line)) {
        const issue = {
          severity: banned.severity,
          file,
          lineNum,
          pattern: banned.name,
          message: banned.message,
          snippet: line.trim().substring(0, 80),
        };
        result.issues.push(issue);
        if (banned.severity === 'error') {
          result.passed = false;
        }
      }
    }
  }

  result.detail = result.issues.length === 0
    ? 'No banned patterns found'
    : `${result.issues.length} banned pattern(s) detected`;

  return result;
}

// ── Check 2: Debug artifacts ────────────────────────────

function checkDebugArtifacts(diff) {
  const result = {
    name: 'no-debug-artifacts',
    passed: true,
    issues: [],
    detail: '',
  };

  const debugPattern = /\bconsole\.(log|debug|info)\s*\(/;

  for (const { file, line, lineNum } of diff.addedLines) {
    // Only flag in src/ production code, not tests/scripts/docs
    if (!file.startsWith('src/') && !file.startsWith('lib/') && !file.startsWith('app/')) continue;
    if (isTestOrConfig(file)) continue;

    if (debugPattern.test(line)) {
      // Allow if explicitly marked as intentional
      if (line.includes('// keep') || line.includes('// intentional')) continue;

      result.issues.push({
        severity: 'warning',
        file,
        lineNum,
        message: 'console.log in production code — use a proper logger or remove',
        snippet: line.trim().substring(0, 80),
      });
    }
  }

  // Warnings don't fail the gate, but errors do
  // Debug artifacts are warnings — they show in report but don't block
  result.detail = result.issues.length === 0
    ? 'No debug artifacts found'
    : `${result.issues.length} debug artifact(s) — consider removing`;

  return result;
}

// ── Check 3: Syntax validation ──────────────────────────

function checkSyntax(cwd) {
  const result = {
    name: 'syntax-check',
    passed: true,
    issues: [],
    detail: '',
  };

  // Get modified .js files from git
  let modifiedFiles;
  try {
    const output = execSync('git diff --name-only HEAD 2>/dev/null || git diff --name-only', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    }).trim();
    modifiedFiles = output.split('\n').filter((f) => f.endsWith('.js') && f.trim());
  } catch {
    result.detail = 'Could not determine modified files — skipped';
    return result;
  }

  if (modifiedFiles.length === 0) {
    result.detail = 'No .js files modified';
    return result;
  }

  let checkedCount = 0;
  for (const file of modifiedFiles) {
    const fullPath = resolve(cwd, file);
    if (!existsSync(fullPath)) continue;

    const check = spawnSync('node', ['--check', fullPath], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 10_000,
    });

    checkedCount++;
    if (check.status !== 0) {
      result.passed = false;
      result.issues.push({
        severity: 'error',
        file,
        message: `Syntax error: ${(check.stderr || '').trim().split('\n')[0]}`,
      });
    }
  }

  result.detail = result.passed
    ? `${checkedCount} file(s) passed syntax check`
    : `${result.issues.length} file(s) have syntax errors`;

  return result;
}

// ── Check 4: npm audit ──────────────────────────────────

function checkNpmAudit(cwd) {
  const result = {
    name: 'npm-audit',
    passed: true,
    issues: [],
    detail: '',
  };

  // Skip if no node_modules or no package-lock.json
  if (!existsSync(resolve(cwd, 'package-lock.json'))) {
    result.detail = 'No package-lock.json — skipped';
    return result;
  }

  try {
    const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
      cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30_000,
    });

    if (audit.status === 0) {
      result.detail = 'No high/critical vulnerabilities';
      return result;
    }

    // Parse audit output
    let auditData;
    try {
      auditData = JSON.parse(audit.stdout);
    } catch {
      result.detail = 'npm audit output parse failed — skipped';
      return result;
    }

    const vulns = auditData.metadata?.vulnerabilities || {};
    const highCount = (vulns.high || 0) + (vulns.critical || 0);

    if (highCount > 0) {
      result.passed = false;
      result.issues.push({
        severity: 'error',
        message: `${highCount} high/critical vulnerability(ies) found`,
        details: vulns,
      });
    }

    result.detail = highCount === 0
      ? 'No high/critical vulnerabilities'
      : `${highCount} high/critical vulnerability(ies)`;
  } catch {
    result.detail = 'npm audit failed to run — skipped';
  }

  return result;
}

// ── Check 5: Test regression ────────────────────────────

function checkTestRegression(cwd) {
  const result = {
    name: 'test-regression',
    passed: true,
    issues: [],
    detail: '',
  };

  const snapshotPath = resolve(cwd, 'tasks/.pre-fix-test-results.json');
  if (!existsSync(snapshotPath)) {
    result.detail = 'No pre-fix snapshot — skipped';
    return result;
  }

  // Parse pre-fix snapshot
  let preStats;
  try {
    const raw = readFileSync(snapshotPath, 'utf-8');
    preStats = parseTestOutput(raw);
  } catch {
    result.detail = 'Pre-fix snapshot parse failed — skipped';
    return result;
  }

  // Run current tests
  const testRun = spawnSync('npm', ['test'], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 60_000,
  });

  const postStats = parseTestOutput(testRun.stdout || '');

  // Compare
  if (postStats.fail > 0) {
    result.passed = false;
    result.issues.push({
      severity: 'error',
      message: `${postStats.fail} test(s) failing`,
      pre: preStats,
      post: postStats,
    });
  }

  if (postStats.total < preStats.total) {
    result.passed = false;
    result.issues.push({
      severity: 'error',
      message: `Test count decreased: ${preStats.total} → ${postStats.total} (${preStats.total - postStats.total} test(s) missing)`,
      pre: preStats,
      post: postStats,
    });
  }

  if (result.issues.length === 0) {
    result.detail = `Tests: ${postStats.pass}/${postStats.total} pass (was ${preStats.pass}/${preStats.total})`;
  } else {
    result.detail = result.issues.map((i) => i.message).join('; ');
  }

  return result;
}

// ── Helpers ─────────────────────────────────────────────

function parseTestOutput(output) {
  const stats = { total: 0, pass: 0, fail: 0 };

  // Try JSON format first (node --test --json or jest --json)
  try {
    const json = JSON.parse(output);
    if (json.numTotalTests != null) {
      // Jest format
      stats.total = json.numTotalTests;
      stats.pass = json.numPassedTests;
      stats.fail = json.numFailedTests;
      return stats;
    }
  } catch {
    // Not JSON, parse text output
  }

  // Parse Node.js built-in test runner output
  const totalMatch = output.match(/# tests (\d+)/);
  const passMatch = output.match(/# pass (\d+)/);
  const failMatch = output.match(/# fail (\d+)/);

  if (totalMatch) stats.total = parseInt(totalMatch[1]);
  if (passMatch) stats.pass = parseInt(passMatch[1]);
  if (failMatch) stats.fail = parseInt(failMatch[1]);

  return stats;
}

function isTestOrConfig(file) {
  return (
    file.includes('__tests__/') ||
    file.includes('.test.') ||
    file.includes('.spec.') ||
    file.includes('test/') ||
    file.endsWith('.json') ||
    file.endsWith('.toml') ||
    file.endsWith('.yml') ||
    file.endsWith('.yaml') ||
    file.endsWith('.md') ||
    file.endsWith('.sh') ||
    file.startsWith('scripts/') ||
    file.startsWith('docs/')
  );
}

/**
 * Format quality gate results for human-readable output.
 * @param {object} results - Output from runQualityGate()
 * @returns {string} Formatted report
 */
export function formatQualityReport(results) {
  const lines = ['', '┌─ Quality Gate Report ─────────────────────────┐'];

  for (const check of results.checks) {
    const icon = check.passed ? '✓' : '✗';
    lines.push(`│  ${icon} ${check.name}: ${check.detail}`);

    for (const issue of check.issues) {
      const prefix = issue.severity === 'error' ? '✗' : '⚠';
      const loc = issue.file ? `${issue.file}${issue.lineNum ? ':' + issue.lineNum : ''}` : '';
      lines.push(`│    ${prefix} ${loc} ${issue.message}`);
      if (issue.snippet) {
        lines.push(`│      → ${issue.snippet}`);
      }
    }
  }

  lines.push(`│`);
  lines.push(`│  ${results.passed ? '✓ PASSED' : '✗ FAILED'} — ${results.summary}`);
  lines.push('└───────────────────────────────────────────────┘');

  return lines.join('\n');
}
