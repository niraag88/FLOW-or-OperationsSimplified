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

  // Task #427 — backup_runs file-archive columns.
  // backup_runs lives in the public schema and IS covered by
  // drizzle-kit push, but we patch here too as a belt-and-braces so
  // existing deployed environments pick the columns up at first boot
  // without a manual `npm run db:push` step.
  `ALTER TABLE backup_runs
     ADD COLUMN IF NOT EXISTS files_success       boolean,
     ADD COLUMN IF NOT EXISTS files_filename      text,
     ADD COLUMN IF NOT EXISTS files_storage_key   text,
     ADD COLUMN IF NOT EXISTS files_size          bigint,
     ADD COLUMN IF NOT EXISTS files_object_count  integer`,

  // Task #427 — ops.year_archives catalog (in ops schema so it
  // survives DROP SCHEMA public CASCADE on restore, just like
  // restore_runs, and is not subject to rolling backup retention).
  `CREATE TABLE IF NOT EXISTS ops.year_archives (
     year             integer PRIMARY KEY,
     sealed_at        timestamp NOT NULL DEFAULT now(),
     sealed_by        varchar,
     sealed_by_name   text,
     storage_key      text,
     filename         text,
     file_size        bigint,
     object_count     integer,
     success          boolean NOT NULL DEFAULT false,
     error_message    text
   )`,
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
