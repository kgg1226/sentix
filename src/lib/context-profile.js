/**
 * Cross-project profile generation.
 *
 * registry.md 에 등록된 외부 프로젝트의 소스 디렉토리를 스캔하여
 * tech stack / dependencies / directory structure / APIs / lessons 를
 * 요약한 PROFILE.md 내용을 반환한다.
 *
 * 순수 함수 (파일 쓰기 없음) — caller 가 결과를 저장한다.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * @param {{name: string}} project
 * @param {string} sourcePath - absolute path to the project root
 * @returns {string|null} markdown profile, or null if not generatable
 */
export function generateProjectProfile(project, sourcePath) {
  let profile = `# ${project.name} — Project Profile (auto-generated)\n\n`;

  // 1. Tech stack (from CLAUDE.md)
  const claudePath = resolve(sourcePath, 'CLAUDE.md');
  if (existsSync(claudePath)) {
    const claude = readFileSync(claudePath, 'utf-8');
    const stackMatch = claude.match(/## 기술 스택[\s\S]*?```([\s\S]*?)```/);
    if (stackMatch) {
      profile += `## Tech Stack\n\n\`\`\`\n${stackMatch[1].trim()}\n\`\`\`\n\n`;
    }
  }

  // 2. Dependencies (from package.json)
  const pkgPath = resolve(sourcePath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      if (deps.length > 0 || devDeps.length > 0) {
        profile += `## Dependencies\n\n`;
        if (deps.length) profile += `**Runtime**: ${deps.join(', ')}\n`;
        if (devDeps.length) profile += `**Dev**: ${devDeps.join(', ')}\n`;
        profile += '\n';
      }
    } catch { /* ignore */ }
  }

  // 3. Directory structure (2 levels)
  profile += `## Directory Structure\n\n\`\`\`\n`;
  try {
    const entries = readdirSync(sourcePath, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build')
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        profile += `${entry.name}/\n`;
        try {
          const sub = readdirSync(resolve(sourcePath, entry.name), { withFileTypes: true })
            .filter((e) => !e.name.startsWith('.'))
            .slice(0, 10);
          for (const s of sub) {
            profile += `  ${s.name}${s.isDirectory() ? '/' : ''}\n`;
          }
          const total = readdirSync(resolve(sourcePath, entry.name))
            .filter((e) => !e.startsWith('.')).length;
          if (total > 10) profile += `  ... (${total} items)\n`;
        } catch { /* permission denied */ }
      } else {
        profile += `${entry.name}\n`;
      }
    }
  } catch { /* source not scannable */ }
  profile += `\`\`\`\n\n`;

  // 4. APIs and schemas from INTERFACE.md
  const ifacePath = resolve(sourcePath, 'INTERFACE.md');
  if (existsSync(ifacePath)) {
    const iface = readFileSync(ifacePath, 'utf-8');

    const apiMatch = iface.match(/## Exported APIs[\s\S]*?```([\s\S]*?)```/);
    if (apiMatch && !apiMatch[1].includes('없음')) {
      profile += `## Exported APIs\n\n\`\`\`\n${apiMatch[1].trim()}\n\`\`\`\n\n`;
    }

    const schemaMatch = iface.match(/## Schemas[\s\S]*?```([\s\S]*?)```/);
    if (schemaMatch && !schemaMatch[1].includes('없음')) {
      profile += `## Schemas\n\n\`\`\`\n${schemaMatch[1].trim()}\n\`\`\`\n\n`;
    }

    const patternMatch = iface.match(/## Key Patterns[\s\S]*?```([\s\S]*?)```/);
    if (patternMatch) {
      profile += `## Key Patterns\n\n\`\`\`\n${patternMatch[1].trim()}\n\`\`\`\n\n`;
    }
  }

  // 5. Recent lessons (top 3)
  const lessonsPath = resolve(sourcePath, 'tasks/lessons.md');
  if (existsSync(lessonsPath)) {
    const lessons = readFileSync(lessonsPath, 'utf-8');
    const sections = lessons.split(/^## /m).filter((s) => s.trim()).slice(0, 3);
    if (sections.length > 0) {
      profile += `## Recent Lessons (from this project)\n\n`;
      for (const s of sections) {
        const firstLine = s.split('\n')[0].trim();
        if (firstLine && !firstLine.startsWith('#')) {
          profile += `- ${firstLine}\n`;
        }
      }
      profile += '\n';
    }
  }

  return profile;
}
