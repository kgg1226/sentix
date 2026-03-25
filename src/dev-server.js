/**
 * Sentix Dev Server — 로컬 테스트용
 *
 * Governor 상태, Memory Layer, 에이전트 메트릭스를 JSON API로 제공.
 * 대시보드 개발 시 백엔드로 사용.
 *
 * Usage: node src/dev-server.js [port]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = parseInt(process.argv[2] || '4400', 10);
const CWD = process.cwd();

function filePath(rel) {
  return resolve(CWD, rel);
}

async function readJSON(path) {
  try {
    const full = filePath(path);
    if (!existsSync(full)) return null;
    return JSON.parse(await readFile(full, 'utf-8'));
  } catch { return null; }
}

async function readText(path) {
  try {
    const full = filePath(path);
    if (!existsSync(full)) return null;
    return await readFile(full, 'utf-8');
  } catch { return null; }
}

async function readJSONL(path) {
  const text = await readText(path);
  if (!text) return [];
  return text.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

const routes = {
  '/': async () => ({
    name: 'sentix-dev-server',
    version: '2.0.1',
    endpoints: Object.keys(routes),
  }),

  '/api/status': async () => ({
    governor: await readJSON('tasks/governor-state.json'),
    lessons: (await readText('tasks/lessons.md'))?.split('\n').filter(l => l.startsWith('- ')).length || 0,
    patterns: (await readText('tasks/patterns.md'))?.split('\n').filter(l => l.startsWith('- ')).length || 0,
    patternLogEntries: (await readJSONL('tasks/pattern-log.jsonl')).length,
    metricsEntries: (await readJSONL('tasks/agent-metrics.jsonl')).length,
  }),

  '/api/governor': async () => await readJSON('tasks/governor-state.json') || { status: 'idle' },

  '/api/lessons': async () => {
    const text = await readText('tasks/lessons.md');
    if (!text) return { entries: [] };
    const entries = text.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
    return { count: entries.length, entries };
  },

  '/api/patterns': async () => {
    const text = await readText('tasks/patterns.md');
    if (!text) return { entries: [] };
    const entries = text.split('\n').filter(l => l.startsWith('- ')).map(l => l.slice(2));
    return { count: entries.length, entries };
  },

  '/api/predictions': async () => await readText('tasks/predictions.md') || '',

  '/api/metrics': async () => {
    const entries = await readJSONL('tasks/agent-metrics.jsonl');
    const byAgent = {};
    for (const e of entries) {
      const agent = e.agent || 'unknown';
      if (!byAgent[agent]) byAgent[agent] = [];
      byAgent[agent].push(e);
    }
    return { totalRecords: entries.length, byAgent };
  },

  '/api/security': async () => await readText('tasks/security-report.md') || '',

  '/api/roadmap': async () => await readText('tasks/roadmap.md') || '',

  '/api/pattern-log': async () => {
    const entries = await readJSONL('tasks/pattern-log.jsonl');
    return { count: entries.length, entries: entries.slice(-100) }; // last 100
  },

  '/health': async () => ({ ok: true, ts: new Date().toISOString() }),
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const handler = routes[url.pathname];

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!handler) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found', available: Object.keys(routes) }));
    return;
  }

  try {
    const data = await handler();
    res.writeHead(200);
    res.end(typeof data === 'string' ? JSON.stringify({ content: data }) : JSON.stringify(data, null, 2));
  } catch (err) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Sentix dev server running at http://localhost:${PORT}`);
  console.log('');
  console.log('Endpoints:');
  for (const path of Object.keys(routes)) {
    console.log(`  http://localhost:${PORT}${path}`);
  }
  console.log('');
});
