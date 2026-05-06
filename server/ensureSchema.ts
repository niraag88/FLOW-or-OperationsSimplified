/**
 * Boot-time idempotent schema patches (Task #441).
 *
 * The application's drizzle.config.ts only covers the `public` schema, so
 * `npx drizzle-kit push` does NOT add columns to tables in the `ops`
 * schema. To guarantee that fields newly added to ops tables exist on
 * every environment without requiring a manual migration step, we run
 * a tiny set of `ALTER TABLE … ADD COLUMN IF NOT EXISTS` statements at
 * server startup.
 *
 * Keep this file SHORT. Anything that the public-schema `db:push`
 * workflow already handles must NOT live here. Add an entry only when:
 *   1. The column is in a non-public schema (drizzle-kit push misses it),
 *   2. The column has a safe default / nullable initial state,
 *   3. The application code reads the column unconditionally.
 */

import { pool } from "./db";
import { logger } from "./logger";

const STATEMENTS: string[] = [
  // Task #441 — ops.restore_runs reconcile audit columns.
  // Without these, GET /api/ops/restore-runs throws "column does not
  // exist" on any DB that hasn't been hand-patched.
  `ALTER TABLE ops.restore_runs
     ADD COLUMN IF NOT EXISTS reconcile_status              text,
     ADD COLUMN IF NOT EXISTS reconcile_statements_applied  integer DEFAULT 0,
     ADD COLUMN IF NOT EXISTS reconcile_statements_skipped  integer DEFAULT 0,
     ADD COLUMN IF NOT EXISTS reconcile_warnings            text,
     ADD COLUMN IF NOT EXISTS reconcile_error               text,
     ADD COLUMN IF NOT EXISTS reconcile_finished_at         timestamp`,
];

export async function ensureSchemaPatches(): Promise<void> {
  for (const stmt of STATEMENTS) {
    try {
      await pool.query(stmt);
    } catch (err: any) {
      // Don't crash boot — log and continue. The corresponding feature
      // will surface a clear failure to the admin if the column is still
      // missing, which is preferable to refusing to start.
      logger.error(
        '[ensureSchema] Failed to apply boot-time patch:',
        err?.message ?? err,
      );
    }
  }
}
