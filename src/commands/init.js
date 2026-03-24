/**
 * sentix init — 프로젝트에 Sentix 설치
 *
 * CLAUDE.md + tasks/ 구조 생성, 기술 스택 자동 감지.
 */

import { registerCommand } from '../registry.js';

registerCommand('init', {
  description: 'Initialize Sentix in the current project',
  usage: 'sentix init',

  async run(args, ctx) {
    ctx.log('Initializing Sentix...\n');

    // ── 1. CLAUDE.md ────────────────────────────────
    if (ctx.exists('CLAUDE.md')) {
      ctx.warn('CLAUDE.md already exists — skipping');
    } else {
      const claudeTemplate = `# CLAUDE.md — Sentix Governor 실행 지침

> 이 파일은 Claude Code가 읽는 유일한 실행 문서다.
> 설계 배경은 FRAMEWORK.md를 참조하라.

---

## 기술 스택

\`\`\`
runtime: ${detectRuntime(ctx)}
package_manager: ${detectPackageManager(ctx)}
framework: ${detectFramework(ctx)}
test: npm run test
lint: npm run lint
build: npm run build
\`\`\`

---

## Governor SOP — 7단계 파이프라인

\`\`\`
Step 0: CLAUDE.md(이 파일) + FRAMEWORK.md 읽기
Step 1: 요청 수신
Step 2: lessons.md + patterns.md 로드
Step 3: 실행 계획 수립
Step 4: 에이전트 순차/병렬 소환 → 결과 수거 → 판단
Step 5: 이슈 시 교차 판단 (재시도 / 에스컬레이션)
Step 6: 전체 완료 → 인간에게 최종 보고
Step 7: pattern-engine 실행 → 사이클 학습
\`\`\`

---

## 파괴 방지 하드 룰 6개

1. 작업 전 테스트 스냅샷 필수
2. 티켓 SCOPE 밖 파일 수정 금지
3. 기존 export/API 삭제 금지
4. 기존 테스트 삭제/약화 금지
5. 순삭제 50줄 제한
6. 기존 기능/핸들러 삭제 금지
`;
      await ctx.writeFile('CLAUDE.md', claudeTemplate);
      ctx.success('Created CLAUDE.md');
    }

    // ── 2. .sentix/ config ──────────────────────────
    if (ctx.exists('.sentix/config.toml')) {
      ctx.warn('.sentix/config.toml already exists — skipping');
    } else {
      const config = `[framework]
version = "2.0.0"

[layers.core]
enabled = true

[layers.learning]
enabled = true

[layers.pattern_engine]
enabled = true

[layers.visual]
enabled = false

[layers.evolution]
enabled = false

[provider]
default = "claude"
`;
      await ctx.writeFile('.sentix/config.toml', config);
      ctx.success('Created .sentix/config.toml');
    }

    // ── 3. .sentix/rules/hard-rules.md ──────────────
    if (!ctx.exists('.sentix/rules/hard-rules.md')) {
      const rules = `# 파괴 방지 하드 룰 6개

1. 작업 전 테스트 스냅샷 필수
2. 티켓 SCOPE 밖 파일 수정 금지
3. 기존 export/API 삭제 금지
4. 기존 테스트 삭제/약화 금지
5. 순삭제 50줄 제한
6. 기존 기능/핸들러 삭제 금지
`;
      await ctx.writeFile('.sentix/rules/hard-rules.md', rules);
      ctx.success('Created .sentix/rules/hard-rules.md');
    }

    // ── 4. tasks/ ───────────────────────────────────
    const taskFiles = {
      'tasks/lessons.md': '# Lessons — 자동 축적되는 실패 패턴\n',
      'tasks/roadmap.md': '# Roadmap — 고도화 계획\n',
      'tasks/security-report.md': '# Security Report\n',
    };

    for (const [path, content] of Object.entries(taskFiles)) {
      if (ctx.exists(path)) {
        ctx.warn(`${path} already exists — skipping`);
      } else {
        await ctx.writeFile(path, content);
        ctx.success(`Created ${path}`);
      }
    }

    // Ensure tickets dir exists
    if (!ctx.exists('tasks/tickets')) {
      await ctx.writeFile('tasks/tickets/.gitkeep', '');
      ctx.success('Created tasks/tickets/');
    }

    // ── 5. .gitignore entries ───────────────────────
    const ignoreEntries = [
      'tasks/.pre-fix-test-results.json',
      'tasks/pattern-log.jsonl',
      'tasks/agent-metrics.jsonl',
      'tasks/strategies.jsonl',
      'tasks/governor-state.json',
    ];

    let gitignore = '';
    if (ctx.exists('.gitignore')) {
      gitignore = await ctx.readFile('.gitignore');
    }

    const newEntries = ignoreEntries.filter(e => !gitignore.includes(e));
    if (newEntries.length > 0) {
      const append = '\n# Sentix runtime files\n' + newEntries.join('\n') + '\n';
      await ctx.writeFile('.gitignore', gitignore + append);
      ctx.success(`Updated .gitignore (+${newEntries.length} entries)`);
    }

    // ── Done ────────────────────────────────────────
    ctx.log('\n=== Sentix initialized ===');
    ctx.log('');
    ctx.log('Next steps:');
    ctx.log('  1. Edit CLAUDE.md → 기술 스택을 프로젝트에 맞게 수정');
    ctx.log('  2. Run: sentix doctor');
    ctx.log('');
  },
});

// ── Tech stack detection helpers ─────────────────────────

function detectRuntime(ctx) {
  if (ctx.exists('package.json')) return 'Node.js 18+';
  if (ctx.exists('requirements.txt') || ctx.exists('pyproject.toml')) return 'Python';
  if (ctx.exists('go.mod')) return 'Go';
  if (ctx.exists('Cargo.toml')) return 'Rust';
  return '# 프로젝트에 맞게 설정';
}

function detectPackageManager(ctx) {
  if (ctx.exists('bun.lockb')) return 'bun';
  if (ctx.exists('pnpm-lock.yaml')) return 'pnpm';
  if (ctx.exists('yarn.lock')) return 'yarn';
  if (ctx.exists('package.json')) return 'npm';
  if (ctx.exists('pyproject.toml')) return 'poetry';
  if (ctx.exists('requirements.txt')) return 'pip';
  return '# 프로젝트에 맞게 설정';
}

function detectFramework(ctx) {
  if (!ctx.exists('package.json')) return '# 프로젝트에 맞게 설정';
  try {
    // Sync read not available — return placeholder
    // Actual detection happens at runtime when readFile is async
    return '# 프로젝트에 맞게 설정 (Next.js, Express, etc.)';
  } catch {
    return '# 프로젝트에 맞게 설정';
  }
}
