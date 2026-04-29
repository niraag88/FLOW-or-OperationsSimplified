/**
 * Shared advisory-lock helper for wholesale-DB destructive operations
 * (Task #368, RF-5).
 *
 * Three operations wipe / replace the entire `public` schema in one go:
 *
 *   1. POST /api/ops/factory-reset       (server/factoryReset.ts)
 *   2. POST /api/ops/backup-runs/:id/restore   (cloud restore)
 *   3. POST /api/ops/restore-upload      (uploaded .sql.gz restore)
 *
 * Before this helper, only factory-reset took its own lock (Task #331).
 * Both restore endpoints took NO lock (Task #288, which proposed one,
 * was cancelled). That left three foot-guns:
 *
 *   - Two admins clicking Restore at the same time race each other; the
 *     second restore starts mid-way through the first, which is undefined
 *     behaviour for a `DROP SCHEMA public CASCADE; CREATE SCHEMA public; …`
 *     payload.
 *   - An admin can trigger a restore while another admin's factory reset
 *     is mid-flight, or vice versa.
 *   - The second caller would see whatever low-level pg error surfaces
 *     when the first wipe is partially done — not a friendly 409.
 *
 * This helper acquires ONE shared Postgres SESSION-level advisory lock so
 * that all three operations serialise against each other. The lock is
 * taken on a single dedicated client and released in `finally`, so a
 * worker crash drops the connection and Postgres releases the lock
 * automatically — the next caller can re-acquire and proceed without
 * intervention. Same pattern as `withBackupLock` in server/backupLock.ts;
 * the helpers are siblings deliberately so the lock-key constants live
 * next to their callers and cannot drift.
 *
 * The helper is the LAST guard, not a replacement for the typed-phrase
 * confirmation (Task #337). Every caller still validates its own typed
 * phrase first; this helper only stops two CONFIRMED destructive ops
 * from interleaving.
 */
import type { PoolClient } from "pg";
import { pool } from "./db";
import { logger } from "./logger";

/**
 * The single shared advisory-lock key for every wholesale-DB destructive
 * operation. The numeric value is arbitrary but MUST stay stable: Postgres
 * advisory locks match by integer key, and a different value during a
 * rolling deploy would silently let two destructive ops proceed in
 * parallel (defeating the whole point). Distinct from
 * `BACKUP_ADVISORY_LOCK_KEY` (server/backupLock.ts) so a backup never
 * blocks — and is never blocked by — a destructive op (different concerns:
 * a backup is read-only against the DB; the destructive ops here REPLACE
 * the DB).
 *
 * Distinct from the historical inline `FACTORY_RESET_LOCK_KEY = -31`
 * (Task #331) because the destructive set is now larger than just
 * factory-reset. The factory-reset route still surfaces its original
 * 409 `factory_reset_in_progress` error code for backward compatibility
 * with existing callers, but it acquires THIS lock under the hood.
 */
export const DESTRUCTIVE_DB_OP_LOCK_KEY = -3680;

/**
 * Thrown by `withDestructiveDbLock` when another destructive op is
 * already holding the shared lock. Each caller is responsible for
 * translating this into the appropriate HTTP 409 response — restore
 * endpoints use the generic `destructive_db_op_in_progress` code; the
 * factory-reset endpoint preserves its existing `factory_reset_in_progress`
 * code so callers that already check for it do not break.
 */
export class DestructiveDbOpInProgressError extends Error {
  readonly code = "destructive_db_op_in_progress";
  constructor() {
    super(
      "Another destructive database operation (factory reset or restore) " +
        "is already running. Try again in a moment.",
    );
    this.name = "DestructiveDbOpInProgressError";
  }
}

/**
 * Run `fn` while holding the shared destructive-DB-op advisory lock.
 *
 * The lock-holding `PoolClient` is passed to the callback so callers that
 * need to run a transaction on the same connection (e.g. factory-reset)
 * can do so without acquiring a second client. Callers that don't need
 * the client (e.g. the restore pipeline, which uses the regular `db`
 * pool) can ignore the parameter.
 *
 * Behaviour:
 *   - If the lock is acquired, runs `fn(client)`, returns its result, and
 *     releases the lock + client in `finally` even if `fn` throws.
 *   - If the lock is NOT acquired (another destructive op is running),
 *     throws `DestructiveDbOpInProgressError` BEFORE invoking `fn` so no
 *     DB writes are attempted. The lock-attempt client is released
 *     immediately in `finally`.
 *   - On uncaught throws inside `fn`, releases lock + client, then
 *     re-throws so the caller can convert to its preferred HTTP shape.
 *
 * The lock is auto-released on connection close (Postgres session-lock
 * semantics), so a worker crash mid-operation does not permanently brick
 * the system.
 */
export async function withDestructiveDbLock<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lockRes = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [DESTRUCTIVE_DB_OP_LOCK_KEY],
    );
    lockAcquired = lockRes.rows[0]?.locked === true;
    if (!lockAcquired) {
      throw new DestructiveDbOpInProgressError();
    }
    return await fn(client);
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [
          DESTRUCTIVE_DB_OP_LOCK_KEY,
        ]);
      } catch (err) {
        // Connection-level release happens automatically anyway; log so a
        // genuinely persistent advisory-unlock failure (which would block
        // the next caller until the connection is recycled) is visible.
        logger.error("pg_advisory_unlock (destructive-db) failed:", err);
      }
    }
    client.release();
  }
}
