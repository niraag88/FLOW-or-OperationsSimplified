/**
 * Audit-log durability contract (Task #375).
 *
 * `writeAuditLogSync(tx, data)` is the only audit write path that's safe
 * for sensitive admin actions (factory reset, user delete, permanent
 * delete, invoice/DO cancel). The contract:
 *
 *   1. The audit insert runs INSIDE the caller's transaction.
 *   2. If the insert fails, the error PROPAGATES — it never silently
 *      swallows like the fire-and-forget `writeAuditLog` does.
 *   3. Because the error propagates out of the surrounding
 *      `db.transaction(...)`, the entire transaction rolls back so the
 *      destructive action and the audit record stay in lock-step:
 *      either both happened, or neither did.
 *
 * Without this contract a sensitive action could succeed while its
 * audit row silently disappears — exactly the gap Task #375 closes.
 *
 * The test exercises a real Drizzle transaction. We use the audit_log
 * table itself as a side-effect marker: insert a "good" sentinel row
 * inside the tx, then call writeAuditLogSync with a payload that
 * violates a NOT NULL constraint (`actor`). The expected outcome is
 * that the second insert throws, the tx rolls back, and the sentinel
 * row never lands in audit_log.
 *
 * Run with:  npx tsx --test tests/unit/auditLogDurability.test.ts
 *
 * Requires DATABASE_URL.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../server/db';
import { auditLog } from '../../shared/schema';
import { writeAuditLogSync, writeAuditLog } from '../../server/middleware';

test('writeAuditLogSync — failed audit insert rolls back the surrounding transaction', async () => {
  // Unique marker so concurrent test runs cannot see each other's rows
  // and so we never collide with real production audit data.
  const markerType = `audit-durability-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // The exact error message varies by driver (Drizzle wraps it as
  // "Failed query: ..." with the original "violates not-null constraint"
  // attached as `cause`). We just need to assert SOMETHING threw — the
  // important behavioural assertion is the rollback check below.
  await assert.rejects(
    () =>
      db.transaction(async (tx) => {
        // "Real work" representing the destructive action itself.
        // Use the audit_log table as a convenient side-effect marker —
        // if the tx commits, this row is visible afterwards; if it
        // rolls back, the row is gone.
        await tx.insert(auditLog).values({
          actor: 'durability-test-actor',
          actorName: 'durability-test',
          targetId: 'sentinel',
          targetType: markerType,
          action: 'CREATE',
          details: 'this row must not survive a failed audit insert',
        });

        // Now the audit-log write that must fail. Passing `null` for
        // `actor` violates the NOT NULL constraint and PostgreSQL
        // returns SQLSTATE 23502, which Drizzle propagates.
        // We cast through unknown to bypass the InsertAuditLog type
        // (this simulates a runtime DB error like a transient
        // connection drop or constraint violation).
        await writeAuditLogSync(tx, {
          actor: null as unknown as string,
          actorName: 'durability-test',
          targetId: 'X',
          targetType: markerType,
          action: 'TEST',
          details: 'should never be inserted',
        });
      }),
    (err: unknown) => err instanceof Error,
    'expected the failed audit insert to propagate an error',
  );

  // The transaction must have rolled back. Neither the sentinel nor
  // the (failed) audit row should be visible.
  const rows = await db.select().from(auditLog).where(eq(auditLog.targetType, markerType));
  assert.equal(
    rows.length,
    0,
    `expected zero audit_log rows for marker ${markerType} after rollback, found ${rows.length}`,
  );
});

test('writeAuditLogSync — successful audit insert commits with the surrounding transaction', async () => {
  // Sanity check: the same machinery, with a valid payload, should
  // commit normally. This guards against the test passing simply
  // because writeAuditLogSync is broken in some other way.
  const markerType = `audit-durability-success-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await db.transaction(async (tx) => {
    await writeAuditLogSync(tx, {
      actor: 'durability-test-actor',
      actorName: 'durability-test',
      targetId: 'commit-check',
      targetType: markerType,
      action: 'CREATE',
      details: 'sanity-check row that should commit',
    });
  });

  const rows = await db.select().from(auditLog).where(eq(auditLog.targetType, markerType));
  assert.equal(rows.length, 1, 'expected the sanity-check audit row to commit');

  // Clean up so we don't leave debris in audit_log.
  await db.delete(auditLog).where(eq(auditLog.targetType, markerType));
});

test('writeAuditLog (async) — eventually persists the row on the happy path', async () => {
  // The fire-and-forget wrapper now retries with exponential backoff.
  // On the happy path (no DB hiccup) it should still land within a
  // reasonable wait window. We poll for up to 2s — generous compared
  // to the immediate first-attempt write that should happen on a
  // healthy DB.
  const markerType = `audit-async-happy-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  writeAuditLog({
    actor: 'durability-test-actor',
    actorName: 'durability-test',
    targetId: 'async-check',
    targetType: markerType,
    action: 'CREATE',
    details: 'async happy-path row',
  });

  let rows: Array<{ id: number }> = [];
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    rows = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.targetType, markerType));
    if (rows.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(rows.length, 1, 'expected async writeAuditLog to persist within 2s on happy path');

  await db.delete(auditLog).where(eq(auditLog.targetType, markerType));
});

test.after(async () => {
  await pool.end();
});
