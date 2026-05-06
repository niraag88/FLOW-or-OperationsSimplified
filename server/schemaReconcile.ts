/**
 * Task #441 — Post-restore schema reconciliation.
 *
 * Why this exists
 * ---------------
 * The restore pipeline (server/routes/system/restore.ts → scripts/restoreBackup.js)
 * deliberately replaces the entire `public` schema with whatever was in the
 * backup file. This is correct for data, but wrong for SCHEMA when the
 * backup was taken before a code upgrade — the just-restored DB will be
 * missing columns/tables the running code expects, and the affected
 * screens throw "column does not exist" until someone manually runs
 * `npm run db:push`.
 *
 * This helper closes that gap by running drizzle-kit's `pushSchema()`
 * programmatically against the live DB right after a successful restore,
 * inside the same destructive-DB lock.
 *
 * Failure semantics
 * -----------------
 *   - No diff at all                      → 'no_changes'
 *   - Additive-only diff, applied cleanly → 'success'
 *   - Diff includes data-loss changes:
 *       acceptDataLoss=false (default)    → 'warnings_skipped' (nothing applied)
 *       acceptDataLoss=true               → 'warnings_applied'
 *   - Diff applied but a statement errored → 'failed'  (errorMessage set)
 *
 * The helper NEVER throws. It always returns a structured result so the
 * caller can persist it on the restore_runs row and surface it in the UI.
 */

import * as schema from "@shared/schema";
import { db } from "./db";
import { logger } from "./logger";

export type ReconcileStatus =
  | 'no_changes'
  | 'success'
  | 'warnings_skipped'
  | 'warnings_applied'
  | 'failed';

export interface ReconcileResult {
  status: ReconcileStatus;
  statementsApplied: number;
  statementsSkipped: number;
  /** Plain-English warning lines from drizzle-kit's pgSuggestions. */
  warnings: string[];
  /** Statements that were considered (applied or skipped). */
  statements: string[];
  /** Set when status === 'failed'. */
  error?: string;
  durationMs: number;
}

/**
 * Run drizzle-kit's pushSchema() against the live database and either
 * apply the diff or skip it depending on safety.
 *
 * @param opts.acceptDataLoss  When true, applies the diff even if drizzle-kit
 *   reports `hasDataLoss` (column drops, table drops, etc). Default false.
 */
export async function reconcileSchemaAfterRestore(
  opts: { acceptDataLoss?: boolean } = {},
): Promise<ReconcileResult> {
  const { acceptDataLoss = false } = opts;
  const startedAt = Date.now();

  try {
    // drizzle-kit exposes pushSchema() in its `api` entry point. We import
    // dynamically so this dev-time toolkit isn't pulled into the regular
    // hot path; it's only loaded when a restore actually completes.
    // @ts-ignore — drizzle-kit/api has no published type entry in our setup
    const { pushSchema } = await import("drizzle-kit/api");

    // Cover BOTH schemas the app owns:
    //   - public  (everything restored from backup)
    //   - ops     (restore_runs etc — preserved across restores; new
    //              columns added here, like the reconcile_* set in
    //              shared/schema.ts, also need to land in live DB)
    // The live `drizzle` schema (migration tracking) is intentionally NOT
    // reconciled — it's not modelled in shared/schema.ts and is owned by
    // drizzle-kit's CLI workflow.
    const result = await pushSchema(
      schema as unknown as Record<string, unknown>,
      db as any,
      ["public", "ops"],
    );

    const statements: string[] = result.statementsToExecute ?? [];
    const warnings: string[] = result.warnings ?? [];
    const hasDataLoss: boolean = !!result.hasDataLoss;

    // Nothing to do — backup was already in sync with code.
    if (statements.length === 0) {
      return {
        status: 'no_changes',
        statementsApplied: 0,
        statementsSkipped: 0,
        warnings: [],
        statements: [],
        durationMs: Date.now() - startedAt,
      };
    }

    // Safe additive diff (no data loss) → apply unconditionally.
    if (!hasDataLoss) {
      try {
        await result.apply();
        return {
          status: 'success',
          statementsApplied: statements.length,
          statementsSkipped: 0,
          warnings,
          statements,
          durationMs: Date.now() - startedAt,
        };
      } catch (applyErr: any) {
        const message = applyErr?.message ?? String(applyErr);
        logger.error('[schemaReconcile] apply() failed:', message);
        return {
          status: 'failed',
          statementsApplied: 0,
          statementsSkipped: statements.length,
          warnings,
          statements,
          error: message,
          durationMs: Date.now() - startedAt,
        };
      }
    }

    // Data-loss diff. Only apply with explicit consent.
    if (!acceptDataLoss) {
      return {
        status: 'warnings_skipped',
        statementsApplied: 0,
        statementsSkipped: statements.length,
        warnings,
        statements,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      await result.apply();
      return {
        status: 'warnings_applied',
        statementsApplied: statements.length,
        statementsSkipped: 0,
        warnings,
        statements,
        durationMs: Date.now() - startedAt,
      };
    } catch (applyErr: any) {
      const message = applyErr?.message ?? String(applyErr);
      logger.error('[schemaReconcile] apply() (with data loss) failed:', message);
      return {
        status: 'failed',
        statementsApplied: 0,
        statementsSkipped: statements.length,
        warnings,
        statements,
        error: message,
        durationMs: Date.now() - startedAt,
      };
    }
  } catch (err: any) {
    const message = err?.message ?? String(err);
    logger.error('[schemaReconcile] pushSchema() failed:', message);
    return {
      status: 'failed',
      statementsApplied: 0,
      statementsSkipped: 0,
      warnings: [],
      statements: [],
      error: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * Convert a ReconcileResult into the fields stored on the
 * ops.restore_runs row. Keeps the persistence shape in one place so
 * both the auto post-restore path and the manual force-reconcile path
 * write the same columns.
 */
export function reconcileResultToRow(r: ReconcileResult) {
  return {
    reconcileStatus: r.status,
    reconcileStatementsApplied: r.statementsApplied,
    reconcileStatementsSkipped: r.statementsSkipped,
    reconcileWarnings: r.warnings.length > 0 ? r.warnings.join('\n') : null,
    reconcileError: r.error ?? null,
    reconcileFinishedAt: new Date(),
  };
}
