/**
 * verify-gates.js — 하드 룰 검증 게이트
 *
 * 에이전트 작업 완료 후 git diff를 분석하여 하드 룰 위반 여부를 코드로 검증한다.
 * "AI에게 부탁하는 규칙"이 아닌 "코드가 강제하는 게이트".
 *
 * 검증 항목:
 *   #2 SCOPE 준수 — 변경 파일이 허용 범위 안에 있는가
 *   #3 export 삭제 금지 — export 키워드가 삭제되었는가
 *   #4 테스트 삭제 금지 — 테스트 파일에서 테스트가 삭제되었는가
 *   #5 순삭제 50줄 — net deletions이 50줄을 넘는가
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Run all verification gates against the current git diff.
 * @param {string} cwd - Working directory
 * @param {object} [options]
 * @param {string[]} [options.scope] - Allowed file patterns (glob-like). If empty, scope check is skipped.
 * @returns {object} Gate results
 */
export function runGates(cwd, options = {}) {
  const results = {
    passed: true,
    checks: [],
    violations: [],
    summary: '',
  };

  let diff;
  try {
    diff = getDiff(cwd);
  } catch {
    // No git repo or no changes — all gates pass trivially
    results.summary = 'No git changes detected — gates skipped';
    return results;
  }

  if (!diff.files.length) {
    results.summary = 'No file changes — gates skipped';
    return results;
  }

  // Gate #2: SCOPE compliance
  const scopeResult = checkScope(diff, options.scope);
  results.checks.push(scopeResult);
  if (!scopeResult.passed) {
    results.passed = false;
    results.violations.push(...scopeResult.violations);
  }

  // Gate #3: No export deletion
  const exportResult = checkExportDeletion(diff);
  results.checks.push(exportResult);
  if (!exportResult.passed) {
    results.passed = false;
    results.violations.push(...exportResult.violations);
  }

  // Gate #4: No test deletion
  const testResult = checkTestDeletion(diff);
  results.checks.push(testResult);
  if (!testResult.passed) {
    results.passed = false;
    results.violations.push(...testResult.violations);
  }

  // Gate #5: Net deletion limit (50 lines)
  const deletionResult = checkNetDeletion(diff);
  results.checks.push(deletionResult);
  if (!deletionResult.passed) {
    results.passed = false;
    results.violations.push(...deletionResult.violations);
  }

  const passCount = results.checks.filter(c => c.passed).length;
  results.summary = `${passCount}/${results.checks.length} gates passed`;

  return results;
}

// ── Git diff parsing ──────────────────────────────────

function getDiff(cwd) {
  const numstat = execSync('git diff --numstat HEAD 2>/dev/null || git diff --numstat', {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10000,
  }).trim();

  const diffContent = execSync('git diff HEAD 2>/dev/null || git diff', {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10000,
  });

  const files = [];
  let totalAdded = 0;
  let totalDeleted = 0;

  for (const line of numstat.split('\n')) {
    if (!line.trim()) continue;
    const [added, deleted, file] = line.split('\t');
    const a = parseInt(added) || 0;
    const d = parseInt(deleted) || 0;
    files.push({ file, added: a, deleted: d });
    totalAdded += a;
    totalDeleted += d;
  }

  // Extract deleted AND added lines from full diff
  const deletedLines = [];
  const addedLines = [];
  let currentFile = null;
  for (const line of diffContent.split('\n')) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      currentFile = match ? match[1] : null;
    } else if (line.startsWith('-') && !line.startsWith('---') && currentFile) {
      deletedLines.push({ file: currentFile, line: line.slice(1) });
    } else if (line.startsWith('+') && !line.startsWith('+++') && currentFile) {
      addedLines.push({ file: currentFile, line: line.slice(1) });
    }
  }

  return { files, totalAdded, totalDeleted, deletedLines, addedLines };
}

// ── Gate #2: SCOPE compliance ─────────────────────────

function checkScope(diff, scope) {
  const result = { rule: 'scope', passed: true, violations: [], detail: '' };

  if (!scope || scope.length === 0) {
    result.detail = 'No scope defined — skipped';
    return result;
  }

  for (const { file } of diff.files) {
    if (!matchesScope(file, scope)) {
      result.passed = false;
      result.violations.push({
        rule: 'scope',
        message: `File outside SCOPE: ${file}`,
        file,
      });
    }
  }

  result.detail = result.passed
    ? `${diff.files.length} files within scope`
    : `${result.violations.length} file(s) outside scope`;

  return result;
}

/**
 * export 구문에서 식별자(함수/변수/클래스 이름)를 추출한다.
 * 예: "export function foo({a,b})" → "foo"
 *     "export const bar = ..." → "bar"
 *     "export default class Baz" → "default:Baz" (default 재정의도 변경으로 판정)
 * 추출 실패 시 null.
 */
function extractExportId(line) {
  const trimmed = line.trim();
  // export default [function|class] Name
  let m = trimmed.match(/^export\s+default\s+(?:async\s+)?(?:function\*?|class)\s*([A-Za-z_$][\w$]*)/);
  if (m) return `default:${m[1]}`;
  if (/^export\s+default\b/.test(trimmed)) return 'default';
  // export (async )?function Name
  m = trimmed.match(/^export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  // export class Name
  m = trimmed.match(/^export\s+class\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  // export (const|let|var) Name
  m = trimmed.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/);
  if (m) return m[1];
  return null;
}

function matchesScope(file, patterns) {
  for (const pattern of patterns) {
    if (pattern.endsWith('/**')) {
      const dir = pattern.slice(0, -3);
      if (file.startsWith(dir + '/') || file === dir) return true;
    } else if (pattern.endsWith('/*')) {
      const dir = pattern.slice(0, -2);
      if (file.startsWith(dir + '/') && !file.slice(dir.length + 1).includes('/')) return true;
    } else if (file === pattern) {
      return true;
    }
  }
  return false;
}

// ── Gate #3: No export deletion ───────────────────────

function checkExportDeletion(diff) {
  const result = { rule: 'no-export-deletion', passed: true, violations: [], detail: '' };

  const exportPattern = /^export\s+(function|const|let|var|class|default|async)/;

  // 같은 파일의 추가 라인에 동일한 export 식별자가 있으면 시그니처 변경으로 간주해 제외.
  // (예: `export function foo(a)` → `export function foo(a, b)` 는 삭제가 아님)
  const addedByFile = new Map();
  for (const a of diff.addedLines || []) {
    if (!exportPattern.test(a.line.trim())) continue;
    const id = extractExportId(a.line);
    if (!id) continue;
    if (!addedByFile.has(a.file)) addedByFile.set(a.file, new Set());
    addedByFile.get(a.file).add(id);
  }

  const deletedExports = diff.deletedLines.filter(d => {
    if (!exportPattern.test(d.line.trim()) || isTestFile(d.file)) return false;
    const id = extractExportId(d.line);
    if (!id) return true;
    const added = addedByFile.get(d.file);
    return !(added && added.has(id)); // 같은 식별자가 추가 라인에 있으면 제외
  });

  if (deletedExports.length > 0) {
    result.passed = false;
    for (const d of deletedExports) {
      result.violations.push({
        rule: 'no-export-deletion',
        message: `Export deleted in ${d.file}: ${d.line.trim().substring(0, 60)}`,
        file: d.file,
      });
    }
  }

  result.detail = result.passed
    ? 'No exports deleted'
    : `${deletedExports.length} export(s) deleted`;

  return result;
}

// ── Gate #4: No test deletion ─────────────────────────

function checkTestDeletion(diff) {
  const result = { rule: 'no-test-deletion', passed: true, violations: [], detail: '' };

  const testPattern = /\b(describe|it|test)\s*\(/;
  const deletedTests = diff.deletedLines.filter(
    d => isTestFile(d.file) && testPattern.test(d.line)
  );

  if (deletedTests.length > 0) {
    result.passed = false;
    for (const d of deletedTests) {
      result.violations.push({
        rule: 'no-test-deletion',
        message: `Test deleted in ${d.file}: ${d.line.trim().substring(0, 60)}`,
        file: d.file,
      });
    }
  }

  result.detail = result.passed
    ? 'No tests deleted'
    : `${deletedTests.length} test(s) deleted`;

  return result;
}

function isTestFile(file) {
  return file.includes('__tests__/') ||
    file.includes('.test.') ||
    file.includes('.spec.') ||
    file.includes('test/');
}

// ── Gate #5: Net deletion limit ───────────────────────

function checkNetDeletion(diff, limit = 50) {
  const result = { rule: 'net-deletion-limit', passed: true, violations: [], detail: '' };

  const netDeletions = diff.totalDeleted - diff.totalAdded;

  if (netDeletions > limit) {
    result.passed = false;
    result.violations.push({
      rule: 'net-deletion-limit',
      message: `Net deletions: ${netDeletions} (limit: ${limit})`,
      net_deletions: netDeletions,
    });
  }

  result.detail = `Net: +${diff.totalAdded} -${diff.totalDeleted} (net ${netDeletions > 0 ? '+' : ''}${-netDeletions})`;

  return result;
}

// ══════════════════════════════════════════════════════
// Pre-execution gates — run BEFORE pipeline starts
// ══════════════════════════════════════════════════════

/**
 * Run pre-execution gates.
 * @param {string} cwd - Working directory
 * @param {object} [options]
 * @param {boolean} [options.skipTicketCheck] - Skip ticket gate (e.g. hotfix auto-creates)
 * @returns {object} Gate results
 */
export function runPreGates(cwd, options = {}) {
  const results = {
    passed: true,
    checks: [],
    violations: [],
    summary: '',
  };

  // Pre-Gate 1: "No ticket, no code"
  const ticketResult = checkTicketExists(cwd, options);
  results.checks.push(ticketResult);
  if (!ticketResult.passed) {
    results.passed = false;
    results.violations.push(...ticketResult.violations);
  }

  // Pre-Gate 2: Test snapshot exists
  const snapshotResult = checkTestSnapshot(cwd);
  results.checks.push(snapshotResult);
  // Snapshot is a warning, not a hard block
  if (!snapshotResult.passed) {
    results.violations.push(...snapshotResult.violations);
  }

  const passCount = results.checks.filter(c => c.passed).length;
  results.summary = `Pre-gates: ${passCount}/${results.checks.length} passed`;
  return results;
}

// ── Pre-Gate 1: Ticket existence ────────────────────

function checkTicketExists(cwd, options) {
  const result = { rule: 'ticket-required', passed: true, violations: [], detail: '' };

  if (options.skipTicketCheck) {
    result.detail = 'Ticket check skipped (hotfix mode)';
    return result;
  }

  try {
    const indexPath = resolve(cwd, 'tasks/tickets/index.json');
    if (!existsSync(indexPath)) {
      result.detail = 'No ticket index — skipped';
      return result;
    }

    const index = JSON.parse(readFileSync(indexPath, 'utf-8'));
    const activeTickets = index.filter(t =>
      t.status === 'open' || t.status === 'in_progress'
    );

    if (activeTickets.length === 0) {
      result.passed = false;
      result.violations.push({
        rule: 'ticket-required',
        message: 'No active ticket. Create one first: sentix ticket create "description"',
      });
      result.detail = 'No active tickets';
    } else {
      result.detail = `${activeTickets.length} active ticket(s)`;
    }
  } catch {
    result.detail = 'Ticket index read failed — skipped';
  }

  return result;
}

// ── Pre-Gate 2: Test snapshot ────────────────────────

function checkTestSnapshot(cwd) {
  const result = { rule: 'test-snapshot', passed: true, violations: [], detail: '' };

  const snapshotPath = resolve(cwd, 'tasks/.pre-fix-test-results.json');
  if (existsSync(snapshotPath)) {
    result.detail = 'Pre-fix snapshot exists';
  } else {
    result.passed = false;
    result.violations.push({
      rule: 'test-snapshot',
      message: 'Pre-fix test snapshot not found. Run tests before code changes.',
    });
    result.detail = 'No test snapshot — tests should run first';
  }

  return result;
}
