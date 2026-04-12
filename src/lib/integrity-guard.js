/**
 * integrity-guard.js — 보호 파일 무결성 감시 + 자동 복원
 *
 * 핵심 보호 파일의 SHA-256 해시를 .sentix/integrity.json에 저장하고,
 * 세션 시작 시 변조 여부를 검증한다. 변조 감지 시 git에서 자동 복원.
 *
 * 보호 대상:
 *   - .claude/settings.json (훅 등록)
 *   - .claude/agents/*.md (에이전트 프롬프트)
 *   - scripts/hooks/*.js (차단 로직)
 *   - .sentix/rules/*.md (하드 룰)
 *
 * LLM은 이 파일들을 수정할 수 없음 (deny 리스트 + 이 모듈이 이중 보호).
 * 만약 deny를 우회하더라도, 다음 세션 시작 시 이 모듈이 변조를 감지하고 복원.
 *
 * 외부 의존성: 없음 (Node.js 내장 모듈만 사용)
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, relative } from 'node:path';

const INTEGRITY_PATH = '.sentix/integrity.json';

// ── 보호 대상 파일 패턴 ─────────────────────────────────

const PROTECTED_PATTERNS = [
  '.claude/settings.json',
  '.claude/agents/',       // 디렉토리 → 내부 모든 파일
  'scripts/hooks/',        // 디렉토리 → 내부 모든 파일
  '.sentix/rules/',        // 디렉토리 → 내부 모든 파일
];

/**
 * 보호 대상 파일 목록을 수집한다.
 * @param {string} cwd
 * @returns {string[]} 상대 경로 목록
 */
export function collectProtectedFiles(cwd) {
  const files = [];

  for (const pattern of PROTECTED_PATTERNS) {
    const fullPath = resolve(cwd, pattern);

    if (pattern.endsWith('/')) {
      // 디렉토리 → 내부 파일 수집
      if (existsSync(fullPath)) {
        try {
          const entries = readdirSync(fullPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile()) {
              files.push(join(pattern, entry.name));
            }
          }
        } catch { /* 읽기 실패 무시 */ }
      }
    } else {
      // 개별 파일
      if (existsSync(fullPath)) {
        files.push(pattern);
      }
    }
  }

  return files;
}

/**
 * 파일의 SHA-256 해시를 계산한다.
 */
function hashFile(cwd, filePath) {
  const fullPath = resolve(cwd, filePath);
  if (!existsSync(fullPath)) return null;

  const content = readFileSync(fullPath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 현재 보호 파일들의 해시 스냅샷을 생성하고 저장한다.
 * sentix init 또는 sentix update 후에 호출.
 *
 * @param {string} cwd
 * @returns {object} { files: number, path: string }
 */
export function snapshotIntegrity(cwd) {
  const files = collectProtectedFiles(cwd);
  const snapshot = {
    version: 1,
    created_at: new Date().toISOString(),
    files: {},
  };

  for (const file of files) {
    const hash = hashFile(cwd, file);
    if (hash) {
      snapshot.files[file] = hash;
    }
  }

  const integrityPath = resolve(cwd, INTEGRITY_PATH);
  writeFileSync(integrityPath, JSON.stringify(snapshot, null, 2));

  return { files: Object.keys(snapshot.files).length, path: INTEGRITY_PATH };
}

/**
 * 보호 파일의 무결성을 검증한다.
 *
 * @param {string} cwd
 * @returns {object} { passed: boolean, violations: Array, missing: Array, restored: Array }
 */
export function verifyIntegrity(cwd) {
  const result = {
    passed: true,
    violations: [],  // 변조된 파일
    missing: [],     // 삭제된 파일
    restored: [],    // 자동 복원된 파일
    skipped: false,  // 스냅샷 없으면 true
  };

  const integrityPath = resolve(cwd, INTEGRITY_PATH);
  if (!existsSync(integrityPath)) {
    result.skipped = true;
    return result;
  }

  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(integrityPath, 'utf-8'));
  } catch {
    result.skipped = true;
    return result;
  }

  if (!snapshot.files || typeof snapshot.files !== 'object') {
    result.skipped = true;
    return result;
  }

  for (const [file, expectedHash] of Object.entries(snapshot.files)) {
    const fullPath = resolve(cwd, file);

    if (!existsSync(fullPath)) {
      // 파일이 삭제됨
      result.passed = false;
      result.missing.push(file);

      // git에서 복원 시도
      const restored = restoreFromGit(cwd, file);
      if (restored) {
        result.restored.push(file);
      }
      continue;
    }

    const currentHash = hashFile(cwd, file);
    if (currentHash !== expectedHash) {
      // 파일이 변조됨
      result.passed = false;
      result.violations.push({
        file,
        expected: expectedHash.slice(0, 12),
        actual: currentHash?.slice(0, 12) || 'null',
      });

      // git에서 복원 시도
      const restored = restoreFromGit(cwd, file);
      if (restored) {
        result.restored.push(file);
      }
    }
  }

  return result;
}

/**
 * git에서 파일을 복원한다.
 * @returns {boolean} 복원 성공 여부
 */
function restoreFromGit(cwd, file) {
  try {
    execSync(`git checkout HEAD -- "${file}"`, {
      cwd,
      stdio: 'pipe',
      timeout: 5000,
    });
    return existsSync(resolve(cwd, file));
  } catch {
    return false;
  }
}

/**
 * 무결성 검증 결과를 사람이 읽을 수 있는 형태로 포맷한다.
 */
export function formatIntegrityReport(result) {
  if (result.skipped) {
    return '[INTEGRITY] 스냅샷 없음 — sentix init 또는 sentix update 후 자동 생성됩니다.';
  }

  if (result.passed) {
    return '[INTEGRITY] 모든 보호 파일 무결성 확인 ✓';
  }

  const lines = ['', '╔══════════════════════════════════════════════════════╗'];
  lines.push('║  [SENTIX:INTEGRITY] 보호 파일 변조 감지!               ║');
  lines.push('╚══════════════════════════════════════════════════════╝');

  if (result.violations.length > 0) {
    lines.push('');
    lines.push('  변조된 파일:');
    for (const v of result.violations) {
      const status = result.restored.includes(v.file) ? '→ 복원됨' : '→ 복원 실패!';
      lines.push(`    ✗ ${v.file} (expected: ${v.expected}... actual: ${v.actual}...) ${status}`);
    }
  }

  if (result.missing.length > 0) {
    lines.push('');
    lines.push('  삭제된 파일:');
    for (const m of result.missing) {
      const status = result.restored.includes(m) ? '→ 복원됨' : '→ 복원 실패!';
      lines.push(`    ✗ ${m} ${status}`);
    }
  }

  if (result.restored.length > 0) {
    lines.push('');
    lines.push(`  ${result.restored.length}개 파일이 git에서 자동 복원되었습니다.`);
  }

  const unrestored = [...result.violations.map(v => v.file), ...result.missing]
    .filter(f => !result.restored.includes(f));
  if (unrestored.length > 0) {
    lines.push('');
    lines.push('  ⚠ 복원 실패 파일은 수동 복구가 필요합니다:');
    lines.push('    git checkout HEAD -- <파일경로>');
  }

  return lines.join('\n');
}
