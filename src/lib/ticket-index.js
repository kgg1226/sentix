/**
 * Ticket Index — CRUD operations for tasks/tickets/index.json
 *
 * Manages ticket lifecycle: open → in_progress → review → resolved → closed
 * Zero external dependencies.
 */

import { createHash } from 'node:crypto';

const INDEX_PATH = 'tasks/tickets/index.json';

const VALID_TRANSITIONS = {
  open:        ['in_progress'],
  in_progress: ['review', 'open'],
  review:      ['resolved', 'in_progress'],
  resolved:    ['closed'],
  closed:      [],
};

const SEVERITY_ORDER = { critical: 0, warning: 1, suggestion: 2 };

// ── CRUD ──────────────────────────────────────────────

export async function loadIndex(ctx) {
  if (!ctx.exists(INDEX_PATH)) return [];
  try {
    return await ctx.readJSON(INDEX_PATH);
  } catch {
    return [];
  }
}

export async function saveIndex(ctx, entries) {
  await ctx.writeJSON(INDEX_PATH, entries);
}

export async function nextTicketId(ctx, prefix) {
  const entries = await loadIndex(ctx);
  const matching = entries
    .filter(e => e.id.startsWith(`${prefix}-`))
    .map(e => parseInt(e.id.split('-')[1], 10))
    .filter(n => Number.isFinite(n));

  const next = matching.length > 0 ? Math.max(...matching) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

export async function addTicket(ctx, entry) {
  const entries = await loadIndex(ctx);
  entries.push(entry);
  await saveIndex(ctx, entries);
  return entry;
}

export async function updateTicket(ctx, id, updates, { force = false } = {}) {
  const entries = await loadIndex(ctx);
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return null;

  // Validate status transition if status is being changed
  if (!force && updates.status && updates.status !== entries[idx].status) {
    const allowed = VALID_TRANSITIONS[entries[idx].status] || [];
    if (!allowed.includes(updates.status)) {
      throw new Error(
        `Invalid transition: ${entries[idx].status} → ${updates.status} (allowed: ${allowed.join(', ') || 'none'})`
      );
    }
  }

  entries[idx] = {
    ...entries[idx],
    ...updates,
    updated_at: new Date().toISOString(),
  };
  await saveIndex(ctx, entries);
  return entries[idx];
}

export async function findTicket(ctx, id) {
  const entries = await loadIndex(ctx);
  return entries.find(e => e.id === id) || null;
}

export async function findByStatus(ctx, status) {
  const entries = await loadIndex(ctx);
  return entries.filter(e => e.status === status);
}

export async function findByType(ctx, type) {
  const entries = await loadIndex(ctx);
  return entries.filter(e => e.type === type);
}

// ── Severity auto-classification ──────────────────────

const CRITICAL_KEYWORDS = ['crash', 'security', 'data loss', 'corruption', 'undefined is not', 'econnrefused', 'injection', 'vulnerability', '보안', '데이터 손실', '크래시'];
const WARNING_KEYWORDS = ['slow', 'wrong', 'broken', 'error', 'fail', 'incorrect', 'bug', '오류', '에러', '느림', '실패'];

export function classifySeverity(description) {
  const lower = description.toLowerCase();
  if (CRITICAL_KEYWORDS.some(k => lower.includes(k))) return 'critical';
  if (WARNING_KEYWORDS.some(k => lower.includes(k))) return 'warning';
  return 'suggestion';
}

// ── Helpers ───────────────────────────────────────────

export function descriptionHash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 8);
}

export function sortBySeverity(entries) {
  return [...entries].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 3;
    const sb = SEVERITY_ORDER[b.severity] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

/**
 * Create a standard TicketEntry object.
 */
export function createTicketEntry({ id, type, title, severity, description }) {
  return {
    id,
    type,
    title,
    severity: severity || 'suggestion',
    status: 'open',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    pipeline_status: 'pending',
    description_hash: descriptionHash(description || title),
    related_cycle: null,
    file_path: `tasks/tickets/${id}.md`,
  };
}
