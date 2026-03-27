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

    // ── 0. Detect tech stack (async) ────────────────
    const techStack = await detectTechStack(ctx);

    // ── 1. CLAUDE.md ────────────────────────────────
    if (ctx.exists('CLAUDE.md')) {
      ctx.warn('CLAUDE.md already exists — skipping');
    } else {
      const claudeTemplate = `# CLAUDE.md — Sentix Governor 실행 지침

> 이 파일은 Claude Code가 읽는 실행 인덱스다.
> 상세 설계는 FRAMEWORK.md, 세부 규칙은 docs/ 를 참조하라.

---

## 기술 스택

\`\`\`
runtime: ${techStack.runtime}
language: ${techStack.language}
package_manager: ${techStack.packageManager}
framework: ${techStack.framework}
test: ${techStack.test}
lint: ${techStack.lint}
build: ${techStack.build}
\`\`\`

---

## Governor SOP — 7단계

0. CLAUDE.md + FRAMEWORK.md 읽기
1. 요청 수신
2. lessons.md + patterns.md 로드
3. 실행 계획 수립
4. 에이전트 소환 → 결과 수거 → 판단
5. 이슈 시 교차 판단 (재시도 / 에스컬레이션)
6. 인간에게 최종 보고
7. pattern-engine → 사이클 학습

> 상세 SOP + 실행 예시: docs/governor-sop.md

---

## 파괴 방지 하드 룰 6개

1. 작업 전 테스트 스냅샷 필수
2. 티켓 SCOPE 밖 파일 수정 금지
3. 기존 export/API 삭제 금지
4. 기존 테스트 삭제/약화 금지
5. 순삭제 50줄 제한
6. 기존 기능/핸들러 삭제 금지

> 상세 규칙: .sentix/rules/hard-rules.md
> 에이전트 범위: docs/agent-scopes.md
> Severity 분기: docs/severity.md
> 아키텍처 다이어그램: docs/architecture.md

---

## 프레임워크 업데이트

\`\`\`
curl -sL https://raw.githubusercontent.com/kgg1226/sentix/main/scripts/update-downstream.sh | bash
\`\`\`
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

[version]
auto_bump = true
auto_tag = true
auto_changelog = true
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

    // ── 3b. docs/ (lazy loading 참조 문서) ──────────
    const docFiles = {
      'docs/governor-sop.md': '# Governor SOP\n\n> 상세 SOP는 sentix update 실행 시 동기화됩니다.\n> 또는 FRAMEWORK.md Layer 1을 참조하세요.\n',
      'docs/agent-scopes.md': '# Agent Scopes\n\n> 에이전트별 파일 범위는 sentix update 실행 시 동기화됩니다.\n> 또는 FRAMEWORK.md 에이전트 정의를 참조하세요.\n',
      'docs/severity.md': '# Severity Logic\n\n> severity 분기 로직은 sentix update 실행 시 동기화됩니다.\n> 또는 FRAMEWORK.md Layer 1을 참조하세요.\n',
      'docs/architecture.md': '# Architecture\n\n> Mermaid 다이어그램은 sentix update 실행 시 동기화됩니다.\n> 또는 FRAMEWORK.md를 참조하세요.\n',
    };

    for (const [path, content] of Object.entries(docFiles)) {
      if (ctx.exists(path)) {
        ctx.warn(`${path} already exists — skipping`);
      } else {
        await ctx.writeFile(path, content);
        ctx.success(`Created ${path}`);
      }
    }

    // ── 4. tasks/ ───────────────────────────────────
    const taskFiles = {
      'tasks/lessons.md': '# Lessons — 자동 축적되는 실패 패턴\n',
      'tasks/patterns.md': '# User Patterns — auto-generated, do not edit manually\n',
      'tasks/predictions.md': '# Active Predictions — auto-updated by pattern engine\n',
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

    // Ensure tickets dir and index exist
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
      const iface = `# INTERFACE.md — API Contract

> 다른 프로젝트가 이 프로젝트를 참조할 때 읽는 계약서.
> Governor가 멀티 프로젝트 교차 참조 시 충돌 여부를 판단하는 기준.

## Project

\`\`\`
name: # 프로젝트 이름
version: # 현재 버전
type: # api | library | framework | service
\`\`\`

## Exported APIs

\`\`\`
# 다른 프로젝트가 참조하는 API 엔드포인트나 모듈
\`\`\`

## Changelog

| 날짜 | 변경 | 영향 범위 |
|---|---|---|
`;
      await ctx.writeFile('INTERFACE.md', iface);
      ctx.success('Created INTERFACE.md');
    }

    if (!ctx.exists('registry.md')) {
      const reg = `# registry.md — 연동 프로젝트 목록

> Governor와 deploy.yml cascade job이 이 파일을 참조.

## 연동 프로젝트

| 프로젝트 | 경로 | 참조 조건 |
|---|---|---|
`;
      await ctx.writeFile('registry.md', reg);
      ctx.success('Created registry.md');
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
    if (techStack.detected) {
      ctx.success(`Detected: ${techStack.runtime} / ${techStack.packageManager}${techStack.framework !== '# 프로젝트에 맞게 설정' ? ' / ' + techStack.framework : ''}`);
    }
    ctx.log('Next steps:');
    ctx.log('  1. Edit CLAUDE.md → 기술 스택을 프로젝트에 맞게 확인');
    ctx.log('  2. Run: sentix doctor');
    ctx.log('');
  },
});

// ── Tech stack detection (async — reads package.json) ────

async function detectTechStack(ctx) {
  const result = {
    detected: false,
    runtime: '# 프로젝트에 맞게 설정',
    language: '# 프로젝트에 맞게 설정',
    packageManager: '# 프로젝트에 맞게 설정',
    framework: '# 프로젝트에 맞게 설정',
    test: '# 프로젝트에 맞게 설정',
    lint: '# 프로젝트에 맞게 설정',
    build: '# 프로젝트에 맞게 설정',
  };

  // ── Node.js ────────────────────────────────────
  if (ctx.exists('package.json')) {
    result.detected = true;
    result.runtime = 'Node.js 18+';
    result.language = 'TypeScript / JavaScript';

    // Package manager
    if (ctx.exists('bun.lockb')) result.packageManager = 'bun';
    else if (ctx.exists('pnpm-lock.yaml')) result.packageManager = 'pnpm';
    else if (ctx.exists('yarn.lock')) result.packageManager = 'yarn';
    else result.packageManager = 'npm';

    // TypeScript check
    if (ctx.exists('tsconfig.json')) {
      result.language = 'TypeScript';
    } else {
      result.language = 'JavaScript';
    }

    // Framework detection from package.json
    try {
      const pkg = await ctx.readJSON('package.json');
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next']) result.framework = 'Next.js';
      else if (deps['express']) result.framework = 'Express';
      else if (deps['fastify']) result.framework = 'Fastify';
      else if (deps['@nestjs/core']) result.framework = 'NestJS';
      else if (deps['koa']) result.framework = 'Koa';
      else if (deps['hono']) result.framework = 'Hono';
      else if (deps['react'] && !deps['next']) result.framework = 'React';
      else if (deps['vue']) result.framework = 'Vue';
      else if (deps['svelte']) result.framework = 'Svelte';

      // Scripts detection
      const scripts = pkg.scripts || {};
      const pm = result.packageManager;
      result.test = scripts.test ? `${pm} run test` : `# ${pm} run test`;
      result.lint = scripts.lint ? `${pm} run lint` : `# ${pm} run lint`;
      result.build = scripts.build ? `${pm} run build` : `# ${pm} run build`;
    } catch {
      result.test = `${result.packageManager} run test`;
      result.lint = `${result.packageManager} run lint`;
      result.build = `${result.packageManager} run build`;
    }

    return result;
  }

  // ── Python ─────────────────────────────────────
  if (ctx.exists('pyproject.toml') || ctx.exists('requirements.txt')) {
    result.detected = true;
    result.runtime = 'Python 3.10+';
    result.language = 'Python';
    result.packageManager = ctx.exists('pyproject.toml') ? 'poetry' : 'pip';
    result.test = 'pytest';
    result.lint = 'ruff check .';
    result.build = '# 프로젝트에 맞게 설정';
    return result;
  }

  // ── Go ─────────────────────────────────────────
  if (ctx.exists('go.mod')) {
    result.detected = true;
    result.runtime = 'Go 1.21+';
    result.language = 'Go';
    result.packageManager = 'go mod';
    result.test = 'go test ./...';
    result.lint = 'golangci-lint run';
    result.build = 'go build ./...';
    return result;
  }

  // ── Rust ───────────────────────────────────────
  if (ctx.exists('Cargo.toml')) {
    result.detected = true;
    result.runtime = 'Rust';
    result.language = 'Rust';
    result.packageManager = 'cargo';
    result.test = 'cargo test';
    result.lint = 'cargo clippy';
    result.build = 'cargo build --release';
    return result;
  }

  return result;
}
