import type { Express } from "express";
import {
  requireRole,
  type AuthenticatedRequest,
} from "../../middleware";
import {
  executeFactoryReset,
  FACTORY_RESET_CONFIRMATION_PHRASE,
  FactoryResetConfirmationError,
} from "../../factoryReset";
import {
  withDestructiveDbLock,
  DestructiveDbOpInProgressError,
} from "../../destructiveDbLock";

export function registerFactoryResetRoutes(app: Express) {
  /**
   * POST /api/ops/factory-reset
   *
   * Wipes ALL business data from the public schema and re-inserts a blank
   * company_settings row.  The ops schema (restore_runs) is intentionally
   * untouched.  Users table partially preserved (only Admin role retained).
   *
   * Deletion order respects FK constraints (children before parents).
   *
   * ─── Wall 2 of the four-wall defence (Task #331) ─────────────────────────
   * Body MUST contain { confirmation: "<exact phrase>" }. Any deviation
   * (missing, wrong text, wrong casing, extra whitespace) is rejected with
   * 400 BEFORE the helper is invoked. This stops the historical bug where
   * a bare POST with no body wiped the database. The phrase is exported
   * from server/factoryReset.ts as FACTORY_RESET_CONFIRMATION_PHRASE.
   */
  app.post('/api/ops/factory-reset', requireRole('Admin'), async (req: AuthenticatedRequest, res) => {
    const body = (req.body ?? {}) as { confirmation?: unknown };
    const confirmation = typeof body.confirmation === 'string' ? body.confirmation : '';

    if (confirmation !== FACTORY_RESET_CONFIRMATION_PHRASE) {
      // NOTE: do NOT echo the expected phrase back in the error body. The
      // phrase is shown in the UI dialog and lives at shared/factoryResetPhrase.ts;
      // a script must obtain it deliberately, not auto-recover from a 400.
      return res.status(400).json({
        error: 'factory_reset_confirmation_required',
        message:
          'Factory reset refused: the request body must include the exact ' +
          'confirmation phrase shown in the dialog. This is a deliberate ' +
          'guard against accidental data loss.',
      });
    }

    let databaseHost: string | undefined;
    try {
      databaseHost = new URL(process.env.DATABASE_URL ?? '').host || undefined;
    } catch {
      databaseHost = undefined;
    }

    // Task #368 (RF-5): factory-reset now uses the SHARED destructive-DB-op
    // advisory lock so it cannot overlap with a cloud or upload restore.
    // The original inline FACTORY_RESET_LOCK_KEY (-31) was retired during
    // this refactor. The 409 error code below is intentionally KEPT as
    // `factory_reset_in_progress` for backward compatibility — any
    // existing client/script that already checks for that code keeps
    // working — even though the underlying lock is now shared. Restore
    // endpoints surface the helper's generic `destructive_db_op_in_progress`
    // code instead. The lock-holding client is reused for the
    // `executeFactoryReset` transaction so we don't open a second
    // connection for the same op.
    try {
      await withDestructiveDbLock(async (client) => {
        await executeFactoryReset(
          client,
          { id: String(req.user!.id), name: req.user!.username },
          { confirmation, databaseHost },
        );
      });
      res.json({ ok: true, message: 'Factory reset complete. All business data has been wiped.' });
    } catch (error: any) {
      if (error instanceof DestructiveDbOpInProgressError) {
        return res.status(409).json({
          error: 'factory_reset_in_progress',
          message:
            'Another destructive database operation (factory reset or restore) ' +
            'is already running. Wait for it to finish, then try again.',
        });
      }
      if (error instanceof FactoryResetConfirmationError) {
        return res.status(400).json({
          error: 'factory_reset_confirmation_required',
          message: error.message,
        });
      }
      console.error('Factory reset failed:', error);
      res.status(500).json({ error: 'Factory reset failed', details: error.message });
    }
  });
}
