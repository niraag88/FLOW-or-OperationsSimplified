/**
 * Shared advisory-lock helper for backup runs (Task #345).
 *
 * Both the scheduled-backup tick (server/scheduler.ts) and the manual
 * route (POST /api/ops/run-backups) wrap their work in this helper so
 * only one backup is ever in flight at any moment, regardless of who
 * triggered it. Same lock key, same try-lock semantics, same release
 * pattern in finally — the helper is the single source of truth so
 * the two call sites cannot drift out of sync.
 *
 * The lock is a Postgres SESSION-level advisory lock taken on a single
 * dedicated client. Releasing requires the same connection, so we hold
 * the client for the full duration of the callback and release both the
 * lock and the client in finally. Because the lock is session-scoped,
 * a worker crash drops the connection and Postgres releases the lock
 * automatically — the next caller can re-acquire and proceed.
 *
 * The helper does NOT do any of the work itself. The callback owns the
 * backup pipeline, the schedule check, retention pruning, etc. — keeping
 * the helper narrow makes it trivial to reason about lock lifetime.
 */
import { pool } from "./db";
import { logger } from "./logger";

/**
 * The advisory-lock key shared by every backup-run path. Originally
 * lived in server/scheduler.ts as SCHEDULER_ADVISORY_LOCK_KEY; renamed
 * and moved here when the manual route started using the same lock so
 * the constant's name reflects its real scope. The numeric value MUST
 * NOT change — Postgres advisory locks are matched by integer key, and
 * a different value would defeat the protection by silently letting two
 * backup runs proceed in parallel during a rolling deploy that mixed
 * old and new processes.
 */
export const BACKUP_ADVISORY_LOCK_KEY = "7325142586001";

export type LockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false };

/**
 * Run `fn` while holding the backup advisory lock.
 *
 * Returns `{ acquired: false }` immediately if another caller already
 * holds the lock — the callback is NOT executed. Otherwise runs the
 * callback, returns `{ acquired: true, result }`, and releases the
 * lock in finally even if the callback throws.
 */
export async function withBackupLock<T>(
  fn: () => Promise<T>,
): Promise<LockOutcome<T>> {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lockRes = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [BACKUP_ADVISORY_LOCK_KEY],
    );
    lockAcquired = lockRes.rows[0]?.locked === true;
    if (!lockAcquired) {
      return { acquired: false };
    }
    const result = await fn();
    return { acquired: true, result };
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          BACKUP_ADVISORY_LOCK_KEY,
        ]);
      } catch (err) {
        // Connection-level release happens automatically anyway.
        logger.error("pg_advisory_unlock failed:", err);
      }
    }
    client.release();
  }
}
