import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContext } from '../src/context.js';
import {
  loadIndex,
  addTicket,
  updateTicket,
  findTicket,
  findByStatus,
  nextTicketId,
  classifySeverity,
  createTicketEntry,
  sortBySeverity,
} from '../src/lib/ticket-index.js';

describe('ticket-index', () => {
  let tmpDir;
  let ctx;

  before(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'sentix-ticket-test-'));
    ctx = createContext(tmpDir);
    // Ensure the tickets directory exists for file_path references
    await mkdir(join(tmpDir, 'tasks', 'tickets'), { recursive: true });
  });

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // ── loadIndex / addTicket ─────────────────────────────

  describe('loadIndex', () => {
    it('returns empty array when index does not exist', async () => {
      const entries = await loadIndex(ctx);
      assert.deepEqual(entries, []);
    });
  });

  describe('addTicket', () => {
    it('persists a ticket to the index', async () => {
      const entry = createTicketEntry({
        id: 'bug-001',
        type: 'bug',
        title: 'Test bug',
        severity: 'warning',
        description: 'A test bug description',
      });
      await addTicket(ctx, entry);

      const entries = await loadIndex(ctx);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].id, 'bug-001');
      assert.equal(entries[0].status, 'open');
    });
  });

  // ── findTicket ────────────────────────────────────────

  describe('findTicket', () => {
    it('returns the ticket by id', async () => {
      const found = await findTicket(ctx, 'bug-001');
      assert.ok(found);
      assert.equal(found.id, 'bug-001');
    });

    it('returns null for unknown id', async () => {
      const found = await findTicket(ctx, 'bug-999');
      assert.equal(found, null);
    });
  });

  // ── updateTicket — normal transitions ─────────────────

  describe('updateTicket', () => {
    it('transitions open → in_progress', async () => {
      const updated = await updateTicket(ctx, 'bug-001', { status: 'in_progress' });
      assert.equal(updated.status, 'in_progress');
    });

    it('transitions in_progress → review', async () => {
      const updated = await updateTicket(ctx, 'bug-001', { status: 'review' });
      assert.equal(updated.status, 'review');
    });

    it('transitions review → resolved', async () => {
      const updated = await updateTicket(ctx, 'bug-001', { status: 'resolved' });
      assert.equal(updated.status, 'resolved');
    });

    it('transitions resolved → closed (normal close path)', async () => {
      const updated = await updateTicket(ctx, 'bug-001', { status: 'closed' });
      assert.equal(updated.status, 'closed');
    });

    it('throws on invalid transition (closed → open)', async () => {
      await assert.rejects(
        () => updateTicket(ctx, 'bug-001', { status: 'open' }),
        /Invalid transition/,
      );
    });

    it('returns null for unknown ticket id', async () => {
      const result = await updateTicket(ctx, 'bug-999', { status: 'closed' });
      assert.equal(result, null);
    });
  });

  // ── updateTicket — force option ────────────────────────

  describe('updateTicket (force)', () => {
    let forceCtx;
    let forceTmpDir;

    before(async () => {
      forceTmpDir = await mkdtemp(join(tmpdir(), 'sentix-force-test-'));
      forceCtx = createContext(forceTmpDir);
      await mkdir(join(forceTmpDir, 'tasks', 'tickets'), { recursive: true });

      // Seed an open ticket
      const entry = createTicketEntry({
        id: 'bug-002',
        type: 'bug',
        title: 'Force close test',
        severity: 'suggestion',
        description: 'Force close test',
      });
      await addTicket(forceCtx, entry);
    });

    after(async () => {
      await rm(forceTmpDir, { recursive: true, force: true });
    });

    it('force-closes an open ticket (skips transition validation)', async () => {
      const updated = await updateTicket(forceCtx, 'bug-002', { status: 'closed' }, { force: true });
      assert.equal(updated.status, 'closed');
    });

    it('normal call still rejects invalid transition even when force=false explicitly', async () => {
      // bug-002 is now closed; try to reopen without force
      await assert.rejects(
        () => updateTicket(forceCtx, 'bug-002', { status: 'open' }, { force: false }),
        /Invalid transition/,
      );
    });
  });

  // ── nextTicketId ──────────────────────────────────────

  describe('nextTicketId', () => {
    let idCtx;
    let idTmpDir;

    before(async () => {
      idTmpDir = await mkdtemp(join(tmpdir(), 'sentix-id-test-'));
      idCtx = createContext(idTmpDir);
      await mkdir(join(idTmpDir, 'tasks', 'tickets'), { recursive: true });
    });

    after(async () => {
      await rm(idTmpDir, { recursive: true, force: true });
    });

    it('returns bug-001 when index is empty', async () => {
      const id = await nextTicketId(idCtx, 'bug');
      assert.equal(id, 'bug-001');
    });

    it('increments correctly after existing entries', async () => {
      await addTicket(idCtx, createTicketEntry({
        id: 'bug-001',
        type: 'bug',
        title: 'First',
        severity: 'warning',
        description: 'First',
      }));
      await addTicket(idCtx, createTicketEntry({
        id: 'bug-003',
        type: 'bug',
        title: 'Third',
        severity: 'warning',
        description: 'Third',
      }));
      const id = await nextTicketId(idCtx, 'bug');
      assert.equal(id, 'bug-004');
    });
  });

  // ── classifySeverity ──────────────────────────────────

  describe('classifySeverity', () => {
    it('classifies crash as critical', () => {
      assert.equal(classifySeverity('app crash on startup'), 'critical');
    });

    it('classifies security as critical', () => {
      assert.equal(classifySeverity('security vulnerability in auth'), 'critical');
    });

    it('classifies error as warning', () => {
      assert.equal(classifySeverity('login returns wrong error'), 'warning');
    });

    it('classifies unknown description as suggestion', () => {
      assert.equal(classifySeverity('improve button alignment'), 'suggestion');
    });
  });

  // ── sortBySeverity ────────────────────────────────────

  describe('sortBySeverity', () => {
    it('orders critical before warning before suggestion', () => {
      const entries = [
        { id: 'a', severity: 'suggestion', created_at: '2026-01-01T00:00:00Z' },
        { id: 'b', severity: 'critical',   created_at: '2026-01-01T00:00:00Z' },
        { id: 'c', severity: 'warning',    created_at: '2026-01-01T00:00:00Z' },
      ];
      const sorted = sortBySeverity(entries);
      assert.equal(sorted[0].severity, 'critical');
      assert.equal(sorted[1].severity, 'warning');
      assert.equal(sorted[2].severity, 'suggestion');
    });
  });

  // ── findByStatus ──────────────────────────────────────

  describe('findByStatus', () => {
    it('filters entries by status', async () => {
      // The main ctx has bug-001 in closed state (from previous updateTicket tests)
      const closed = await findByStatus(ctx, 'closed');
      assert.ok(closed.some(e => e.id === 'bug-001'));
    });

    it('returns empty array when no entries match', async () => {
      const inProgress = await findByStatus(ctx, 'in_progress');
      assert.deepEqual(inProgress, []);
    });
  });
});
