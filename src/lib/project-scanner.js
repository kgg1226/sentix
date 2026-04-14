/**
 * project-scanner.js — 프로젝트 초기 스캔 + 작업 제안
 *
 * sentix init 후 또는 sentix scan 시 프로젝트를 분석하여
 * 개선이 필요한 영역을 자동 감지하고 작업을 제안한다.
 *
 * 스캔 항목:
 *   1. 테스트 유무 + 커버리지
 *   2. TODO/FIXME/HACK 코멘트
 *   3. 보안 패턴 (eval, hardcoded secrets)
 *   4. 대형 파일 (500줄+)
 *   5. 패키지 취약점 (npm audit)
 *   6. 기술 스택 감지
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { spawnSync } from 'node:child_process';

const CODE_EXTENSIONS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.java', '.rb']);
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.sentix', '.claude', 'tasks']);

/**
 * 프로젝트를 스캔하고 작업 제안 목록을 반환한다.
 * @param {string} cwd
 * @returns {object} { suggestions: Array, stats: object }
 */
export function scanProject(cwd) {
  const suggestions = [];
  const stats = { files: 0, lines: 0, testFiles: 0, todoCount: 0, securityIssues: 0, largeFiles: 0 };

  // 코드 파일 수집
  const codeFiles = collectCodeFiles(cwd);
  stats.files = codeFiles.length;

  // 1. 테스트 유무
  const testFiles = codeFiles.filter(f => f.includes('test') || f.includes('spec') || f.includes('__tests__'));
  stats.testFiles = testFiles.length;
  if (testFiles.length === 0 && codeFiles.length > 0) {
    suggestions.push({
      priority: 'high',
      category: '테스트',
      title: '테스트 파일 없음',
      detail: `코드 파일 ${codeFiles.length}개가 있지만 테스트가 없습니다.`,
      action: 'sentix run "프로젝트에 기본 테스트 추가"',
    });
  } else if (testFiles.length > 0 && testFiles.length < codeFiles.length * 0.3) {
    suggestions.push({
      priority: 'medium',
      category: '테스트',
      title: '테스트 커버리지 부족',
      detail: `코드 ${codeFiles.length}개 대비 테스트 ${testFiles.length}개 (${Math.round(testFiles.length / codeFiles.length * 100)}%)`,
      action: 'sentix run "테스트 커버리지 개선"',
    });
  }

  // 2. TODO/FIXME/HACK 스캔
  const todos = [];
  for (const file of codeFiles.slice(0, 50)) { // 최대 50파일만
    try {
      const content = readFileSync(resolve(cwd, file), 'utf-8');
      const lines = content.split('\n');
      stats.lines += lines.length;
      for (let i = 0; i < lines.length; i++) {
        if (/\b(TODO|FIXME|HACK|XXX)\b/i.test(lines[i])) {
          todos.push({ file, line: i + 1, text: lines[i].trim().slice(0, 80) });
        }
      }
    } catch { /* 읽기 실패 무시 */ }
  }
  stats.todoCount = todos.length;
  if (todos.length > 0) {
    suggestions.push({
      priority: todos.length > 10 ? 'high' : 'medium',
      category: '코드 정리',
      title: `TODO/FIXME ${todos.length}개 발견`,
      detail: todos.slice(0, 3).map(t => `  ${t.file}:${t.line} — ${t.text}`).join('\n'),
      action: 'sentix run "TODO/FIXME 항목 정리"',
    });
  }

  // 3. 보안 패턴
  const securityIssues = [];
  for (const file of codeFiles.slice(0, 50)) {
    if (file.includes('test') || file.includes('spec')) continue;
    try {
      const content = readFileSync(resolve(cwd, file), 'utf-8');
      if (/\beval\s*\(/.test(content)) securityIssues.push({ file, issue: 'eval() 사용' });
      if (/\.innerHTML\s*=/.test(content)) securityIssues.push({ file, issue: 'innerHTML 대입' });
      if (/(?:password|secret|api_?key)\s*[:=]\s*['"][^'"]{8,}/i.test(content)) {
        securityIssues.push({ file, issue: '하드코딩 시크릿 가능성' });
      }
    } catch { /* 읽기 실패 무시 */ }
  }
  stats.securityIssues = securityIssues.length;
  if (securityIssues.length > 0) {
    suggestions.push({
      priority: 'high',
      category: '보안',
      title: `보안 위험 패턴 ${securityIssues.length}개 발견`,
      detail: securityIssues.slice(0, 3).map(s => `  ${s.file} — ${s.issue}`).join('\n'),
      action: 'sentix run "보안 취약 패턴 수정"',
    });
  }

  // 4. 대형 파일
  const largeFiles = [];
  for (const file of codeFiles) {
    try {
      const content = readFileSync(resolve(cwd, file), 'utf-8');
      const lineCount = content.split('\n').length;
      if (lineCount > 500) largeFiles.push({ file, lines: lineCount });
    } catch { /* ignore */ }
  }
  stats.largeFiles = largeFiles.length;
  if (largeFiles.length > 0) {
    largeFiles.sort((a, b) => b.lines - a.lines);
    suggestions.push({
      priority: 'low',
      category: '구조',
      title: `대형 파일 ${largeFiles.length}개 (500줄+)`,
      detail: largeFiles.slice(0, 3).map(f => `  ${f.file} (${f.lines}줄)`).join('\n'),
      action: 'sentix run "대형 파일 모듈 분리"',
    });
  }

  // 5. npm audit (package-lock.json 있을 때만)
  if (existsSync(resolve(cwd, 'package-lock.json'))) {
    try {
      const audit = spawnSync('npm', ['audit', '--json', '--audit-level=high'], {
        cwd, encoding: 'utf-8', stdio: 'pipe', timeout: 15_000,
      });
      if (audit.status !== 0) {
        try {
          const data = JSON.parse(audit.stdout);
          const vulns = data.metadata?.vulnerabilities || {};
          const highCount = (vulns.high || 0) + (vulns.critical || 0);
          if (highCount > 0) {
            suggestions.push({
              priority: 'high',
              category: '보안',
              title: `npm 취약점 ${highCount}개 (high/critical)`,
              detail: `npm audit로 ${highCount}개의 심각한 취약점 발견`,
              action: 'npm audit fix',
            });
          }
        } catch { /* parse 실패 */ }
      }
    } catch { /* audit 실행 실패 */ }
  }

  // 우선순위 정렬
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return { suggestions, stats };
}

/**
 * 코드 파일 목록을 수집한다 (재귀).
 */
function collectCodeFiles(cwd, dir = '', files = []) {
  const fullDir = dir ? resolve(cwd, dir) : cwd;
  try {
    const entries = readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      const relPath = dir ? join(dir, entry.name) : entry.name;
      if (entry.isDirectory()) {
        collectCodeFiles(cwd, relPath, files);
      } else if (entry.isFile() && CODE_EXTENSIONS.has(extname(entry.name))) {
        files.push(relPath);
      }
    }
  } catch { /* 읽기 실패 무시 */ }
  return files;
}

/**
 * 스캔 결과를 사람이 읽을 수 있는 형태로 포맷한다.
 */
export function formatScanReport(result) {
  const { suggestions, stats } = result;
  const lines = [];

  lines.push(`  코드 파일  ${stats.files}    테스트 파일  ${stats.testFiles}`);
  lines.push(`  TODO/FIXME ${stats.todoCount}    보안 이슈   ${stats.securityIssues}`);
  lines.push(`  대형 파일  ${stats.largeFiles}`);
  lines.push('');

  if (suggestions.length === 0) {
    lines.push('  ✓ 개선 제안 없음 — 프로젝트가 양호합니다.');
  } else {
    lines.push(`  개선 제안 ${suggestions.length}개:`);
    lines.push('');
    for (let i = 0; i < suggestions.length; i++) {
      const s = suggestions[i];
      const icon = s.priority === 'high' ? '✗' : s.priority === 'medium' ? '⚠' : '○';
      lines.push(`  ${icon} [${s.category}] ${s.title}`);
      if (s.detail) {
        for (const d of s.detail.split('\n')) lines.push(`    ${d}`);
      }
      lines.push(`    → ${s.action}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
