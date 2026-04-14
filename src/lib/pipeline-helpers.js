/**
 * Pipeline helpers — 복잡도 감지, 티켓 파싱, 컨텍스트 로딩.
 *
 * pipeline.js 의 작은 유틸 함수들을 모았다. 모두 순수 또는 ctx 만 사용.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 티켓 내용에서 복잡도 감지.
 * @returns {'low'|'mid'|'high'}
 */
export function detectComplexity(ticketContent) {
  if (!ticketContent) return 'low';
  const lower = ticketContent.toLowerCase();
  if (/complexity:\s*high/i.test(lower)) return 'high';
  if (/parallel_hint/i.test(lower)) return 'high';
  if (/complexity:\s*mid/i.test(lower) || /complexity:\s*medium/i.test(lower)) return 'mid';
  return 'low';
}

/**
 * 티켓에서 병렬 실행 가능한 서브태스크 목록을 추출.
 * PARALLEL_HINT → SCOPE 디렉토리 분할 → fallback 순.
 */
export function parseSubtasks(ticketContent) {
  const subtasks = [];

  const hintMatch = ticketContent.match(/PARALLEL_HINT[:\s]*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
  if (hintMatch) {
    const lines = hintMatch[1].split('\n')
      .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
      .filter((l) => l.length > 5);
    if (lines.length > 1) return lines;
  }

  const scopeMatch = ticketContent.match(/SCOPE[:\s]*\n([\s\S]*?)(?=\n[A-Z_]+:|$)/i);
  if (scopeMatch) {
    const dirs = new Set();
    const lines = scopeMatch[1].split('\n');
    for (const line of lines) {
      const match = line.match(/(\w+)\//);
      if (match) dirs.add(match[1]);
    }
    if (dirs.size > 1) {
      return Array.from(dirs).map((d) => `Implement changes in ${d}/ directory`);
    }
  }

  subtasks.push(ticketContent);
  return subtasks;
}

/**
 * tasks/tickets/index.json 의 마지막 티켓 markdown 내용을 반환.
 */
export async function getLatestTicket(ctx) {
  if (!ctx.exists('tasks/tickets/index.json')) return null;

  try {
    const index = await ctx.readJSON('tasks/tickets/index.json');
    if (index.length === 0) return null;

    const latest = index[index.length - 1];
    const ticketPath = `tasks/tickets/${latest.id}.md`;
    if (ctx.exists(ticketPath)) {
      return await ctx.readFile(ticketPath);
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * lessons + patterns 로부터 learning context 블록 생성.
 */
export function buildLearningContext(lessons, patterns) {
  return [
    lessons.trim() ? `\n--- lessons (recent) ---\n${lessons.slice(-800)}` : '',
    patterns.trim() ? `\n--- patterns ---\n${patterns.slice(0, 500)}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * tasks/context/<project>/PROFILE.md 를 로드해서 cross-project context 블록 생성.
 * 각 프로젝트당 1500자 제한.
 */
export function loadCrossProjectContext(cwd) {
  try {
    const contextDir = join(cwd, 'tasks', 'context');
    if (!existsSync(contextDir)) return '';

    const projects = readdirSync(contextDir, { withFileTypes: true })
      .filter((e) => e.isDirectory());
    const profiles = [];
    for (const p of projects) {
      const profilePath = join(contextDir, p.name, 'PROFILE.md');
      if (existsSync(profilePath)) {
        const content = readFileSync(profilePath, 'utf-8');
        profiles.push(content.slice(0, 1500));
      }
    }
    if (profiles.length > 0) {
      return `\n--- Cross-Project Context ---\n${profiles.join('\n---\n')}`;
    }
  } catch { /* ignore */ }
  return '';
}
