/**
 * sentix init — 프로젝트에 Sentix 설치
 *
 * CLAUDE.md + tasks/ 구조 생성, 기술 스택 자동 감지, pre-commit hook 설치.
 * 파일 템플릿: src/lib/init-templates.js
 * Stack 감지: src/lib/init-stack.js
 * Hook 설치: src/lib/init-hooks.js
 */

import { registerCommand } from '../registry.js';
import { isConfigured } from '../lib/safety.js';
import { detectTechStack } from '../lib/init-stack.js';
import { installPreCommitHook } from '../lib/init-hooks.js';
import {
  generateClaudeMd,
  generateGovernorDirective,
  SENTIX_CONFIG_TOML,
  HARD_RULES_MD,
  DOC_PLACEHOLDERS,
  TASK_PLACEHOLDERS,
  INTERFACE_MD,
  REGISTRY_MD,
} from '../lib/init-templates.js';

registerCommand('init', {
  description: 'Initialize Sentix in the current project',
  usage: 'sentix init',

  async run(_args, ctx) {
    ctx.log('Initializing Sentix...\n');

    const techStack = await detectTechStack(ctx);

    // ── 1. CLAUDE.md ────────────────────────────────
    if (ctx.exists('CLAUDE.md')) {
      const existing = await ctx.readFile('CLAUDE.md');
      if (!existing.includes('Sentix Governor') && !existing.includes('sentix') && !existing.includes('SENTIX')) {
        await ctx.writeFile('CLAUDE.md', existing + '\n' + generateGovernorDirective());
        ctx.success('CLAUDE.md updated — Sentix Governor directive injected');
      } else {
        ctx.warn('CLAUDE.md already has Sentix directives — skipping');
      }
    } else {
      await ctx.writeFile('CLAUDE.md', generateClaudeMd(techStack));
      ctx.success('Created CLAUDE.md');
    }

    // ── 2. .sentix/config.toml ──────────────────────
    if (ctx.exists('.sentix/config.toml')) {
      ctx.warn('.sentix/config.toml already exists — skipping');
    } else {
      await ctx.writeFile('.sentix/config.toml', SENTIX_CONFIG_TOML);
      ctx.success('Created .sentix/config.toml');
    }

    // ── 3. .sentix/rules/hard-rules.md ──────────────
    if (!ctx.exists('.sentix/rules/hard-rules.md')) {
      await ctx.writeFile('.sentix/rules/hard-rules.md', HARD_RULES_MD);
      ctx.success('Created .sentix/rules/hard-rules.md');
    }

    // ── 3b. docs/ placeholder ───────────────────────
    for (const [path, content] of Object.entries(DOC_PLACEHOLDERS)) {
      if (ctx.exists(path)) {
        ctx.warn(`${path} already exists — skipping`);
      } else {
        await ctx.writeFile(path, content);
        ctx.success(`Created ${path}`);
      }
    }

    // ── 4. tasks/ ───────────────────────────────────
    for (const [path, content] of Object.entries(TASK_PLACEHOLDERS)) {
      if (ctx.exists(path)) {
        ctx.warn(`${path} already exists — skipping`);
      } else {
        await ctx.writeFile(path, content);
        ctx.success(`Created ${path}`);
      }
    }

    if (!ctx.exists('tasks/tickets')) {
      await ctx.writeFile('tasks/tickets/.gitkeep', '');
      ctx.success('Created tasks/tickets/');
    }
    if (!ctx.exists('tasks/tickets/index.json')) {
      await ctx.writeJSON('tasks/tickets/index.json', []);
      ctx.success('Created tasks/tickets/index.json');
    }

    // ── 4b. Multi-project files ─────────────────────
    if (!ctx.exists('INTERFACE.md')) {
      await ctx.writeFile('INTERFACE.md', INTERFACE_MD);
      ctx.success('Created INTERFACE.md');
    }
    if (!ctx.exists('registry.md')) {
      await ctx.writeFile('registry.md', REGISTRY_MD);
      ctx.success('Created registry.md');
    }

    // ── 5. .gitignore entries ───────────────────────
    await updateGitignore(ctx);

    // ── 6. Safety word + pre-commit hook ───────────
    const hasSafety = await isConfigured(ctx);
    await installPreCommitHook(ctx);

    if (hasSafety) {
      ctx.success('Safety word already configured — skipping');
    } else {
      renderSafetyWordNotice(ctx);
    }

    // ── Auto-sync framework + doctor ────────────────
    ctx.log('\n--- Syncing framework files ---\n');
    try {
      const { getCommand } = await import('../registry.js');
      const updateCmd = getCommand('update');
      if (updateCmd) await updateCmd.run([], ctx);
    } catch {
      ctx.warn('Auto-update skipped (run manually: sentix update)');
    }

    ctx.log('\n=== Sentix initialized ===\n');
    if (techStack.detected) {
      ctx.success(`Detected: ${techStack.runtime} / ${techStack.packageManager}${techStack.framework !== '# 프로젝트에 맞게 설정' ? ' / ' + techStack.framework : ''}`);
    }

    ctx.log('\n--- Health Check ---\n');
    try {
      const { getCommand } = await import('../registry.js');
      const doctorCmd = getCommand('doctor');
      if (doctorCmd) await doctorCmd.run([], ctx);
    } catch {
      ctx.warn('Auto-check skipped (run manually: sentix doctor)');
    }

    // ── 프로젝트 자동 스캔 + 작업 제안 ──────────────
    ctx.log('\n--- Project Scan ---\n');
    try {
      const { scanProject, formatScanReport } = await import('../lib/project-scanner.js');
      const scanResult = scanProject(ctx.cwd);
      if (scanResult.suggestions.length > 0) {
        ctx.log(formatScanReport(scanResult));
      } else {
        ctx.success('프로젝트 스캔 완료 — 개선 제안 없음');
      }
    } catch {
      ctx.warn('Auto-scan skipped (run manually: sentix scan)');
    }

    if (!hasSafety) {
      ctx.log('');
      ctx.log('Optional: sentix safety set <안전어>  (LLM 인젝션 방지)');
    }
    ctx.log('');
  },
});

// ── .gitignore 업데이트 ──────────────────────────────────

async function updateGitignore(ctx) {
  let gitignore = '';
  if (ctx.exists('.gitignore')) {
    gitignore = await ctx.readFile('.gitignore');
  }

  // Safety file MUST be gitignored (PEM-key-level security)
  const safetyIgnore = '.sentix/safety.toml';
  if (!gitignore.includes(safetyIgnore)) {
    gitignore += '\n# Sentix security (NEVER commit — treat like PEM keys)\n' + safetyIgnore + '\n';
    await ctx.writeFile('.gitignore', gitignore);
    ctx.success('.gitignore: .sentix/safety.toml 보호 추가');
  }

  const ignoreEntries = [
    'tasks/.pre-fix-test-results.json',
    'tasks/pattern-log.jsonl',
    'tasks/agent-metrics.jsonl',
    'tasks/strategies.jsonl',
    'tasks/governor-state.json',
  ];

  const newEntries = ignoreEntries.filter((e) => !gitignore.includes(e));
  if (newEntries.length > 0) {
    const append = '\n# Sentix runtime files\n' + newEntries.join('\n') + '\n';
    await ctx.writeFile('.gitignore', gitignore + append);
    ctx.success(`Updated .gitignore (+${newEntries.length} entries)`);
  }
}

// ── Safety word 안내 ────────────────────────────────────

function renderSafetyWordNotice(ctx) {
  ctx.warn('Safety word not configured');
  ctx.log('');
  ctx.log('  ┌─────────────────────────────────────────────────┐');
  ctx.log('  │  LLM 인젝션 방지를 위해 안전어 설정을 권장합니다  │');
  ctx.log('  └─────────────────────────────────────────────────┘');
  ctx.log('');
  ctx.log('  안전어란?');
  ctx.log('  → 위험한 요청(기억 삭제, 외부 전송, 규칙 변경 등) 시');
  ctx.log('    Governor가 안전어를 요구하여 무단 실행을 차단합니다.');
  ctx.log('');
  ctx.log('  보안 수준: PEM 키와 동일');
  ctx.log('  → SHA-256 해시만 로컬에 저장됩니다 (평문 저장 안 함)');
  ctx.log('  → .gitignore에 자동 등록됩니다 (git 커밋 안 됨)');
  ctx.log('  → 절대 외부에 공유하지 마세요 (Slack, 이메일, 문서 등)');
  ctx.log('  → 절대 AI 대화에 붙여넣지 마세요');
  ctx.log('');
  ctx.log('  설정: sentix safety set <나만의 안전어>');
  ctx.log('  예시: sentix safety set "blue ocean"');
  ctx.log('');
}
