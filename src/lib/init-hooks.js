/**
 * Git pre-commit hook installation — sentix init.
 *
 * .git/hooks/pre-commit 에 verify-gates 실행 스크립트를 설치한다.
 * 이미 SENTIX:GATE 마커가 있으면 건너뛴다.
 */

const HOOK_CONTENT = `#!/bin/sh
# sentix pre-commit hook — 하드 룰 검증 게이트
# 커밋 전에 verify-gates를 실행하여 위반 시 커밋을 블로킹한다.
# 설치: sentix init (자동)

# [SENTIX:GATE] marker for detection
node -e "
import('./src/lib/verify-gates.js')
  .then(m => m.runGates('.'))
  .then(r => {
    if (!r.passed) {
      console.error('\\\\n[SENTIX:GATE] Commit blocked — verification gate failed\\\\n');
      r.violations.forEach(v => console.error('  ✗ [' + v.rule + '] ' + v.message));
      console.error('\\\\nFix violations and try again.\\\\n');
      process.exit(1);
    }
  })
  .catch(() => process.exit(0))
" 2>&1

exit $?
`;

/**
 * Install the pre-commit hook. No-op if .git/ missing or hook already installed.
 */
export async function installPreCommitHook(ctx) {
  const hookPath = '.git/hooks/pre-commit';

  if (!ctx.exists('.git')) return;

  if (ctx.exists(hookPath)) {
    try {
      const existing = await ctx.readFile(hookPath);
      if (existing.includes('SENTIX:GATE')) return;
    } catch { /* fall through — overwrite */ }
  }

  await ctx.writeFile(hookPath, HOOK_CONTENT);

  // chmod +x (Windows 에서는 실패 가능 — 무시)
  try {
    const { chmodSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    chmodSync(resolve(ctx.cwd, hookPath), 0o755);
  } catch { /* ignore */ }

  ctx.success('Installed git pre-commit hook (verification gates)');
}
