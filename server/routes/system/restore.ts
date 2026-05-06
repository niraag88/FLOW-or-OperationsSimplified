import type { Express } from "express";
import { backupRuns, restoreRuns } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import { createWriteStream, unlink } from 'fs';
import { tmpdir } from 'os';
import crypto from 'crypto';
import {
  requireAuth,
  writeAuditLog,
  objectStorageClient,
  type AuthenticatedRequest,
} from "../../middleware";
import { sendIfMissingConfirmation } from "../../typedConfirmation";
import { RESTORE_PHRASE, FORCE_RECONCILE_PHRASE } from "../../../shared/destructiveActionPhrases";
import {
  withDestructiveDbLock,
  DestructiveDbOpInProgressError,
} from "../../destructiveDbLock";
import { logger } from "../../logger";
import {
  reconcileSchemaAfterRestore,
  reconcileResultToRow,
  type ReconcileResult,
} from "../../schemaReconcile";
import { restoreRollingFiles } from "../../restoreRollingFiles";

export function registerRestoreRoutes(app: Express) {
  // ─── Restore Endpoints ────────────────────────────────────────────────────

  /**
   * Shared restore helper.
   *
   * Audit persistence strategy:
   *   1. BEFORE the restore, insert a "pending" row into ops.restore_runs.
   *      The ops schema is NOT dropped by the restore (only public is), so
   *      this record is guaranteed to survive regardless of outcome.
   *   2. RUN the restore. The new restoreBackup() validates and decompresses
   *      the .sql.gz to a temp file BEFORE any destructive action, then
   *      runs DROP SCHEMA public + CREATE SCHEMA public + the dump in ONE
   *      psql --single-transaction. Any failure rolls back; live data
   *      remains intact.
   *   3. AFTER a successful restore, run schemaReconcile (Task #441) to
   *      forward-port the just-restored data structure to whatever the
   *      running app code expects. Result is captured in the same
   *      restore_runs row.
   *   4. Update the pre-created row with the final result.
   */
  async function runRestore(opts: {
    /** A readable .sql.gz stream OR a path to an existing .sql.gz file on disk. */
    sqlGzInput: import('stream').Readable | string;
    triggeredBy: string;
    sourceBackupRunId?: number;
    sourceFilename?: string;
    res: import('express').Response;
    actorName: string;
    /** Task #441: when true, schema reconcile may apply changes that drop columns/tables. */
    acceptDataLoss?: boolean;
    /**
     * Task #427: when present, after a successful DB restore (and
     * reconcile) we ALSO replace the rolling-file set in object
     * storage from the supplied tar.gz path. Closed-year sealed scans
     * are never touched. The local tarball is deleted by the caller in
     * its own try/finally — runRestore does not own the temp file.
     */
    fileRestore?: { tarGzPath: string; runId: string | number };
  }) {
    const { sqlGzInput, triggeredBy, sourceBackupRunId, sourceFilename, res, actorName, acceptDataLoss, fileRestore } = opts;
    const label = sourceFilename || (sourceBackupRunId ? `backup run #${sourceBackupRunId}` : 'unknown');

    // Task #368 (RF-5): take the shared destructive-DB-op lock BEFORE
    // pre-creating the restore_runs row or invoking restoreBackup, so a
    // second restore (or a concurrent factory-reset) gets a friendly 409
    // with no DB writes attempted. The lock is released in `finally` even
    // if restoreBackup throws; a worker crash drops the connection and
    // Postgres releases the session-level advisory lock automatically.
    try {
      return await withDestructiveDbLock(async () => {
        return await runRestoreLocked();
      });
    } catch (err) {
      if (err instanceof DestructiveDbOpInProgressError) {
        return res.status(409).json({
          error: err.code,
          message: err.message,
        });
      }
      throw err;
    }

    async function runRestoreLocked() {
    // Step 1: Pre-create a pending record in ops.restore_runs BEFORE the restore.
    // ops schema is not touched by DROP SCHEMA public CASCADE, so this always persists.
    let preCreatedId: number | null = null;
    try {
      const [inserted] = await db.insert(restoreRuns).values({
        triggeredBy,
        triggeredByName: actorName,
        sourceBackupRunId: sourceBackupRunId ?? null,
        sourceFilename: sourceFilename ?? null,
        success: null,  // pending — will be updated after restore
      }).returning({ id: restoreRuns.id });
      preCreatedId = inserted?.id ?? null;
    } catch (preErr) {
      logger.error('Could not pre-create ops.restore_runs record:', preErr);
    }

    // Step 2: Run the restore.
    let result: { success: boolean; error?: string; durationMs: number };
    try {
      // @ts-ignore
      const { restoreBackup } = await import('../../../scripts/restoreBackup.js');
      result = await restoreBackup(sqlGzInput);
    } catch (importOrRunError: any) {
      logger.error('Error during restore execution:', importOrRunError);
      result = { success: false, error: importOrRunError.message || 'Restore failed unexpectedly', durationMs: 0 };
    }

    const finishedAt = new Date();

    // Step 3 (Task #441): if the SQL restore succeeded, run schema reconciliation.
    // We do this INSIDE the same destructive-DB lock, so no concurrent
    // factory-reset/restore can run while reconcile is in flight. Reconcile
    // never throws — it always returns a structured result we can persist.
    let reconcile: ReconcileResult | null = null;
    if (result.success) {
      try {
        reconcile = await reconcileSchemaAfterRestore({ acceptDataLoss });
        logger.info(
          `[restore] schema reconcile after ${label}: ${reconcile.status} ` +
          `(applied=${reconcile.statementsApplied}, skipped=${reconcile.statementsSkipped})`
        );
      } catch (reconErr: unknown) {
        // Defence in depth — reconcileSchemaAfterRestore itself catches
        // errors, but any unexpected throw must not mark the whole
        // restore as failed (the data IS restored at this point). Raw
        // exception text stays in server logs only; the persisted /
        // API-returned `error` is always a friendly sentence so the
        // restore-runs UI never exposes internals.
        logger.error('[restore] schema reconcile threw unexpectedly:', reconErr);
        reconcile = {
          status: 'failed',
          statementsApplied: 0,
          statementsSkipped: 0,
          warnings: [],
          statements: [],
          error: 'Schema reconciliation could not be completed automatically. Check the server logs for the technical reason.',
          rawErrorForLogs: reconErr instanceof Error ? reconErr.message : String(reconErr),
          durationMs: 0,
        };
      }
    }

    // Step 4: Update the pre-created ops record with the final outcome.
    // The ops schema was untouched by the restore, so this always works.
    const reconcileRow = reconcile
      ? reconcileResultToRow(reconcile)
      : { reconcileStatus: 'not_run' as const };

    if (preCreatedId !== null) {
      try {
        await db.update(restoreRuns)
          .set({
            finishedAt,
            success: result.success,
            errorMessage: result.error ?? null,
            durationMs: result.durationMs ?? null,
            ...reconcileRow,
          })
          .where(eq(restoreRuns.id, preCreatedId));
      } catch (updateErr) {
        logger.error('Could not update ops.restore_runs record after restore:', updateErr);
      }
    } else {
      // Pre-create failed — insert a new complete record now.
      try {
        const [retried] = await db.insert(restoreRuns).values({
          triggeredBy,
          triggeredByName: actorName,
          sourceBackupRunId: sourceBackupRunId ?? null,
          sourceFilename: sourceFilename ?? null,
          finishedAt,
          success: result.success,
          errorMessage: result.error ?? null,
          durationMs: result.durationMs ?? null,
          ...reconcileRow,
        }).returning({ id: restoreRuns.id });
        // So the restore response can still return a usable
        // restoreRunId for the Force Reconciliation button.
        preCreatedId = retried?.id ?? preCreatedId;
      } catch (retryErr) {
        logger.error('Could not insert ops.restore_runs record after restore:', retryErr);
      }
    }

    // Step 5 (best-effort): Write to public.audit_log in the now-restored DB.
    try {
      const reconcileSummary = reconcile
        ? ` [schema reconcile: ${reconcile.status}, applied=${reconcile.statementsApplied}, skipped=${reconcile.statementsSkipped}]`
        : '';
      writeAuditLog({
        actor: triggeredBy,
        actorName,
        targetId: 'restore',
        targetType: 'restore_run',
        action: 'CREATE',
        details:
          `Database restore from ${label} ${result.success ? 'succeeded' : `failed: ${result.error}`} ` +
          `(durationMs: ${result.durationMs})${reconcileSummary}`,
      });
    } catch (_) {}

    // Step 6 (Task #427): if the DB restore succeeded AND a file
    // archive was supplied, also restore the rolling-file set. We do
    // this INSIDE the destructive-DB lock so backups can't snapshot a
    // half-restored bucket. Failure here does NOT roll the DB back —
    // the DB is already restored — but the snapshot prefix is left in
    // place so an admin can recover.
    let fileRestoreOutcome: { success: boolean; restoredCount?: number; error?: string; snapshotPrefix?: string; snapshotKept?: boolean; rolledBack?: boolean } | null = null;
    if (result.success && fileRestore) {
      try {
        const out = await restoreRollingFiles(fileRestore.tarGzPath, fileRestore.runId);
        fileRestoreOutcome = {
          success: out.success,
          restoredCount: out.restoredCount,
          error: out.error,
          snapshotPrefix: out.snapshotPrefix,
          snapshotKept: out.snapshotKept,
          rolledBack: out.rolledBack,
        };
        try {
          writeAuditLog({
            actor: triggeredBy,
            actorName,
            targetId: 'restore_files',
            targetType: 'restore_run',
            action: 'CREATE',
            details: out.success
              ? `File-archive restore from ${label}: ${out.restoredCount} object(s) re-uploaded`
              : `File-archive restore from ${label} FAILED: ${out.error}; rollback ${out.rolledBack ? 'succeeded' : 'PARTIAL'}; snapshot at ${out.snapshotPrefix}`,
          });
        } catch (_) {}
      } catch (frErr) {
        logger.error('[restore] file-restore threw unexpectedly:', frErr);
        fileRestoreOutcome = {
          success: false,
          error: frErr instanceof Error ? frErr.message : String(frErr),
        };
      }
    }

    if (result.success) {
      return res.json({
        success: true,
        durationMs: result.durationMs,
        // Task #441 (review fix) — return the exact restore_runs row id
        // we just wrote to, so the UI can target Force Reconciliation at
        // that specific run instead of guessing via restoreHistory[0].id
        // (which can be briefly stale right after restore).
        restoreRunId: preCreatedId,
        reconcile: reconcile
          ? {
              status: reconcile.status,
              statementsApplied: reconcile.statementsApplied,
              statementsSkipped: reconcile.statementsSkipped,
              warnings: reconcile.warnings,
              error: reconcile.error,
            }
          : null,
        // Task #427: surface file-restore outcome so the UI can show
        // "DB restored ✓ Files restored ✓" or warn on partial recovery.
        fileRestore: fileRestoreOutcome,
      });
    } else {
      return res.status(500).json({ success: false, error: result.error || 'Restore failed', durationMs: result.durationMs });
    }
    }
  }

  // POST /api/ops/backup-runs/:id/restore — restore from a stored cloud
  // backup. Requires the typed confirmation phrase in the body.
  app.post('/api/ops/backup-runs/:id/restore', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    if (!sendIfMissingConfirmation(
      res,
      req.body,
      RESTORE_PHRASE,
      'restore_confirmation_required',
      'Emergency restore from cloud backup',
    )) return;

    const runId = parseInt(req.params.id, 10);
    if (isNaN(runId)) return res.status(400).json({ error: 'Invalid backup run ID' });

    const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1);
    if (!run) return res.status(404).json({ error: 'Backup run not found' });
    if (!run.success) return res.status(400).json({ error: 'This backup run did not fully succeed — only fully successful backup runs can be restored' });
    if (!run.dbSuccess || !run.dbStorageKey) return res.status(400).json({ error: 'This backup run does not have a successful DB dump to restore from' });

    const existsResult = await objectStorageClient.exists(run.dbStorageKey);
    if (!existsResult.ok || !existsResult.value) {
      return res.status(404).json({ error: 'Backup file no longer exists in storage — it may have been deleted' });
    }

    // Task #427 — if this run also has a file-bytes archive, stage it
    // to a temp file BEFORE entering the destructive lock so a missing
    // tarball (e.g. pruned from storage) fails fast instead of leaving
    // the bucket in a partially-restored state. The temp file is
    // cleaned up after runRestore returns.
    let filesTempPath: string | null = null;
    if (run.filesStorageKey && run.filesSuccess) {
      try {
        const filesExists = await objectStorageClient.exists(run.filesStorageKey);
        if (filesExists.ok && filesExists.value) {
          filesTempPath = `${tmpdir()}/restore-files-${crypto.randomUUID()}.tar.gz`;
          await new Promise<void>((resolve, reject) => {
            const ws = createWriteStream(filesTempPath!);
            const fs = objectStorageClient.downloadAsStream(run.filesStorageKey!);
            fs.on('error', reject);
            ws.on('error', reject);
            ws.on('finish', () => resolve());
            fs.pipe(ws);
          });
        } else {
          logger.warn(`[restore] backup run #${runId} has filesStorageKey=${run.filesStorageKey} but it no longer exists in storage — proceeding with DB-only restore`);
        }
      } catch (stageErr) {
        logger.error(`[restore] failed to stage files archive for run #${runId}:`, stageErr);
        if (filesTempPath) {
          unlink(filesTempPath, () => {});
          filesTempPath = null;
        }
      }
    }

    const stream = objectStorageClient.downloadAsStream(run.dbStorageKey);
    try {
      return await runRestore({
        sqlGzInput: stream,
        triggeredBy: req.user!.id,
        actorName: req.user?.username || req.user!.id,
        sourceBackupRunId: runId,
        sourceFilename: run.dbStorageKey.split('/').pop() || run.dbStorageKey,
        acceptDataLoss: req.body?.acceptDataLoss === true,
        fileRestore: filesTempPath ? { tarGzPath: filesTempPath, runId } : undefined,
        res,
      });
    } finally {
      if (filesTempPath) {
        const p = filesTempPath;
        unlink(p, (err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error('Failed to delete temp files archive after restore:', err.message);
          }
        });
      }
    }
  });

  /**
   * Task #427 — POST /api/ops/restore-files-upload
   *
   * Replaces the rolling-file set (logos + open-year scans) from an
   * uploaded .tar.gz produced by archiveFiles. Closed-year sealed scans
   * are never touched. Held under the same destructive-DB lock as the
   * SQL restore so concurrent backups can't snapshot a half-restored
   * bucket. Requires the same typed RESTORE_PHRASE confirmation.
   */
  app.post('/api/ops/restore-files-upload', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Request must be multipart/form-data' });
    }

    // @ts-ignore
    const Busboy = (await import('busboy')).default;
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 500 * 1024 * 1024 } });

    const triggeredBy = req.user!.id;
    const actorName = req.user?.username || req.user!.id;

    let fileHandled = false;
    let tempPath: string | null = null;
    let hitSizeLimit = false;
    let sourceFilename = '';
    let confirmationField: string | undefined;

    bb.on('field', (fieldname: string, value: string) => {
      if (fieldname === 'confirmation') confirmationField = value;
    });

    let writePromise: Promise<void> = Promise.resolve();

    const cleanupTemp = () => {
      if (tempPath) {
        const p = tempPath;
        tempPath = null;
        unlink(p, (err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error('Failed to delete temp files-restore upload:', err.message);
          }
        });
      }
    };

    bb.on('file', (fieldname: string, fileStream: import('stream').Readable, info: { filename: string }) => {
      if (fieldname !== 'file') { fileStream.resume(); return; }
      if (fileHandled) { fileStream.resume(); return; }
      fileHandled = true;

      const { filename } = info;
      if (!filename.endsWith('.tar.gz') && !filename.endsWith('.tgz')) {
        fileStream.resume();
        res.status(400).json({ error: 'File must be a .tar.gz archive produced by the file backup' });
        return;
      }

      // Audit follow-up: validate the typed RESTORE_PHRASE BEFORE
      // accepting the up-to-500 MB upload (parity with the DB-restore
      // upload endpoint). Aborts the stream early so /tmp is never
      // touched without a valid confirmation.
      if (confirmationField !== RESTORE_PHRASE) {
        fileStream.resume();
        if (!res.headersSent) {
          res.status(400).json({
            error: 'restore_confirmation_required',
            message: `Type "${RESTORE_PHRASE}" in the confirmation field before uploading.`,
          });
        }
        return;
      }

      sourceFilename = filename;
      tempPath = `${tmpdir()}/restore-files-upload-${crypto.randomUUID()}.tar.gz`;
      const ws = createWriteStream(tempPath);

      fileStream.on('limit', () => { hitSizeLimit = true; fileStream.resume(); });
      writePromise = new Promise<void>((resolve, reject) => {
        fileStream.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
      });
      fileStream.pipe(ws);
    });

    bb.on('finish', async () => {
      if (!fileHandled) {
        if (!res.headersSent) res.status(400).json({ error: 'No file uploaded. Send a .tar.gz file as multipart field "file".' });
        return;
      }
      if (res.headersSent) return;

      try { await writePromise; } catch (err: any) {
        logger.error('Error staging files upload to temp file:', err.message);
        cleanupTemp();
        if (!res.headersSent) res.status(500).json({ error: 'Failed to buffer uploaded file' });
        return;
      }

      if (hitSizeLimit) {
        cleanupTemp();
        if (!res.headersSent) res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' });
        return;
      }

      if (!sendIfMissingConfirmation(
        res,
        { confirmation: confirmationField },
        RESTORE_PHRASE,
        'restore_confirmation_required',
        'Restore files from uploaded archive',
      )) {
        cleanupTemp();
        return;
      }

      try {
        return await withDestructiveDbLock(async () => {
          const out = await restoreRollingFiles(tempPath!, `upload-${Date.now()}`);
          try {
            writeAuditLog({
              actor: triggeredBy,
              actorName,
              targetId: 'restore_files_upload',
              targetType: 'restore_run',
              action: 'CREATE',
              details: out.success
                ? `Files restored from upload "${sourceFilename}": ${out.restoredCount} object(s)`
                : `Files restore from upload "${sourceFilename}" FAILED: ${out.error}; rollback ${out.rolledBack ? 'succeeded' : 'PARTIAL'}; snapshot at ${out.snapshotPrefix}`,
            });
          } catch (_) {}
          if (out.success) {
            return res.json({ success: true, restoredCount: out.restoredCount });
          }
          return res.status(500).json({
            success: false,
            error: out.error || 'File restore failed',
            rolledBack: out.rolledBack,
            snapshotPrefix: out.snapshotPrefix,
          });
        });
      } catch (err) {
        if (err instanceof DestructiveDbOpInProgressError) {
          return res.status(409).json({ error: err.code, message: err.message });
        }
        logger.error('Files-upload restore error:', err);
        return res.status(500).json({ error: 'Files restore failed' });
      } finally {
        cleanupTemp();
      }
    });

    bb.on('error', (err: Error) => {
      logger.error('Busboy parse error (files restore):', err);
      cleanupTemp();
      if (!res.headersSent) res.status(400).json({ error: 'Failed to parse multipart upload' });
    });

    req.pipe(bb);
  });

  // POST /api/ops/restore-upload — restore from an uploaded .sql.gz file.
  // The upload is buffered to a temp file before runRestore is invoked so
  // the file-size check completes before any destructive action begins.
  // Requires a multipart `confirmation` field with the typed phrase.
  app.post('/api/ops/restore-upload', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Request must be multipart/form-data' });
    }

    // @ts-ignore
    const Busboy = (await import('busboy')).default;
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 500 * 1024 * 1024 } });

    const triggeredBy = req.user!.id;
    const actorName = req.user?.username || req.user!.id;

    let fileHandled = false;
    let tempPath: string | null = null;
    let hitSizeLimit = false;
    let sourceFilename = '';
    let confirmationField: string | undefined;
    let acceptDataLossField = false;

    bb.on('field', (fieldname: string, value: string) => {
      if (fieldname === 'confirmation') confirmationField = value;
      // Task #441: opt-in to applying schema changes that would drop
      // columns/tables. String 'true' (form field semantics) only.
      if (fieldname === 'acceptDataLoss' && value === 'true') acceptDataLossField = true;
    });

    // Resolves when the write stream finishes flushing to disk; rejects on error.
    // Default to resolved so bb.on('finish') can always await it safely when
    // no file event fired (e.g. wrong field name, extension error paths).
    let writePromise: Promise<void> = Promise.resolve();

    const cleanupTemp = () => {
      if (tempPath) {
        const p = tempPath;
        tempPath = null;
        unlink(p, (err) => {
          if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error('Failed to delete temp restore file:', err.message);
          }
        });
      }
    };

    bb.on('file', (fieldname: string, fileStream: import('stream').Readable, info: { filename: string }) => {
      if (fieldname !== 'file') { fileStream.resume(); return; }
      if (fileHandled) { fileStream.resume(); return; }
      fileHandled = true;

      const { filename } = info;
      if (!filename.endsWith('.sql.gz')) {
        fileStream.resume();
        res.status(400).json({ error: 'File must be a .sql.gz gzip-compressed PostgreSQL dump' });
        return;
      }

      // Audit follow-up: validate the typed RESTORE_PHRASE BEFORE
      // accepting the up-to-500 MB upload. Well-formed multipart sends
      // text fields ahead of the file part (the BackupSettings UI
      // appends `confirmation` first), so by the time `on('file')`
      // fires the `confirmation` field is already populated. If it is
      // missing or wrong we abort the stream immediately and avoid
      // touching the disk — closes the auth-gated DoS surface where
      // an admin could fill /tmp by uploading without the phrase.
      if (confirmationField !== RESTORE_PHRASE) {
        fileStream.resume();
        if (!res.headersSent) {
          res.status(400).json({
            error: 'restore_confirmation_required',
            message: `Type "${RESTORE_PHRASE}" in the confirmation field before uploading.`,
          });
        }
        return;
      }

      sourceFilename = filename;
      tempPath = `${tmpdir()}/restore-upload-${crypto.randomUUID()}.sql.gz`;
      const ws = createWriteStream(tempPath);

      fileStream.on('limit', () => {
        hitSizeLimit = true;
        fileStream.resume();
      });

      writePromise = new Promise<void>((resolve, reject) => {
        fileStream.on('error', reject);
        ws.on('error', reject);
        ws.on('finish', resolve);
      });

      fileStream.pipe(ws);
    });

    bb.on('finish', async () => {
      if (!fileHandled) {
        if (!res.headersSent) res.status(400).json({ error: 'No file uploaded. Send a .sql.gz file as multipart field "file".' });
        return;
      }

      // Extension-check already sent a 400 — nothing more to do
      if (res.headersSent) return;

      // Wait for the upload to be fully flushed to disk before any destructive action
      try {
        await writePromise;
      } catch (err: any) {
        logger.error('Error staging upload to temp file:', err.message);
        cleanupTemp();
        if (!res.headersSent) res.status(500).json({ error: 'Failed to buffer uploaded file' });
        return;
      }

      if (hitSizeLimit) {
        cleanupTemp();
        if (!res.headersSent) res.status(413).json({ error: 'File too large. Maximum size is 500 MB.' });
        return;
      }

      // Task #337 typed-phrase guard. Same shared helper as the JSON
      // routes — the multipart `confirmation` field captured above is
      // wrapped into a body-shaped object so the helper sees the same
      // shape it expects from `req.body`.
      if (
        !sendIfMissingConfirmation(
          res,
          { confirmation: confirmationField },
          RESTORE_PHRASE,
          'restore_confirmation_required',
          'Emergency restore from uploaded file',
        )
      ) {
        cleanupTemp();
        return;
      }

      try {
        // Pass the temp file path directly so restoreBackup() doesn't have to
        // re-stage the upload; restoreBackup will read from this path, validate,
        // and decompress to its own temp file before any destructive action.
        await runRestore({
          sqlGzInput: tempPath!,
          triggeredBy,
          actorName,
          sourceFilename,
          acceptDataLoss: acceptDataLossField,
          res,
        });
      } finally {
        cleanupTemp();
      }
    });

    bb.on('error', (err: Error) => {
      logger.error('Busboy parse error:', err);
      cleanupTemp();
      if (!res.headersSent) res.status(400).json({ error: 'Failed to parse multipart upload' });
    });

    req.pipe(bb);
  });

  /**
   * GET /api/ops/restore-runs — last 10 restore run records.
   *
   * Reads from ops.restore_runs which is NOT in the public schema
   * and is therefore unaffected by database restores.
   * Uses triggeredByName (denormalized) since users table is in public
   * and may reflect a different state after restore.
   * LEFT JOIN on backup_runs (public) for the backup filename — best-effort.
   */
  app.get('/api/ops/restore-runs', requireAuth(['Admin']), async (req, res) => {
    try {
      const rows = await db
        .select({
          id: restoreRuns.id,
          restoredAt: restoreRuns.restoredAt,
          finishedAt: restoreRuns.finishedAt,
          triggeredBy: restoreRuns.triggeredBy,
          triggeredByName: restoreRuns.triggeredByName,
          sourceBackupRunId: restoreRuns.sourceBackupRunId,
          sourceFilename: restoreRuns.sourceFilename,
          success: restoreRuns.success,
          errorMessage: restoreRuns.errorMessage,
          durationMs: restoreRuns.durationMs,
          backupDbFilename: backupRuns.dbFilename,
          // Task #441 — schema reconcile audit fields
          reconcileStatus: restoreRuns.reconcileStatus,
          reconcileStatementsApplied: restoreRuns.reconcileStatementsApplied,
          reconcileStatementsSkipped: restoreRuns.reconcileStatementsSkipped,
          reconcileWarnings: restoreRuns.reconcileWarnings,
          reconcileError: restoreRuns.reconcileError,
          reconcileFinishedAt: restoreRuns.reconcileFinishedAt,
        })
        .from(restoreRuns)
        .leftJoin(backupRuns, eq(restoreRuns.sourceBackupRunId, backupRuns.id))
        .orderBy(desc(restoreRuns.restoredAt))
        .limit(10);
      res.json({ runs: rows });
    } catch (error) {
      logger.error('Error fetching restore runs:', error);
      res.status(500).json({ error: 'Failed to fetch restore history' });
    }
  });

  /**
   * POST /api/ops/restore-runs/:id/force-reconcile  (Task #441)
   *
   * Re-runs the post-restore schema reconciliation against the live DB,
   * applying changes even when drizzle-kit reports `hasDataLoss`. Used
   * when a previous restore landed in `warnings_skipped` state because
   * the diff included drops the admin had not opted-in to.
   *
   * Requires `confirmation: 'I ACCEPT DATA LOSS'` in the body so this
   * cannot be triggered accidentally. Updates the latest restore_runs row
   * (or the explicitly-targeted one) with the new reconcile outcome.
   *
   * Held under the shared destructive-DB lock so it cannot interleave
   * with a concurrent restore or factory-reset.
   */
  app.post('/api/ops/restore-runs/:id/force-reconcile', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    if (req.body?.confirmation !== FORCE_RECONCILE_PHRASE) {
      return res.status(400).json({
        error: 'force_reconcile_confirmation_required',
        message: `To force reconciliation with possible data loss, send confirmation = "${FORCE_RECONCILE_PHRASE}".`,
      });
    }

    const runId = parseInt(req.params.id, 10);
    if (isNaN(runId)) return res.status(400).json({ error: 'Invalid restore run ID' });

    const [existing] = await db.select().from(restoreRuns).where(eq(restoreRuns.id, runId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Restore run not found' });

    // Task #441 (review fix) — tighten audit semantics: force-reconcile is
    // only meaningful for runs that left the schema out of sync. Refusing
    // unrelated targets prevents accidentally overwriting reconcile fields
    // on a healthy historical row and confusing the audit trail.
    const reconcileStatus = existing.reconcileStatus;
    const FORCE_ELIGIBLE: ReadonlySet<string> = new Set(['warnings_skipped', 'failed']);
    if (!reconcileStatus || !FORCE_ELIGIBLE.has(reconcileStatus)) {
      return res.status(409).json({
        error: 'force_reconcile_not_eligible',
        message: `Force reconciliation is only allowed for restore runs in "warnings_skipped" or "failed" state. This run is "${reconcileStatus ?? 'unknown'}".`,
      });
    }

    try {
      return await withDestructiveDbLock(async () => {
        const reconcile = await reconcileSchemaAfterRestore({ acceptDataLoss: true });
        const row = reconcileResultToRow(reconcile);
        try {
          await db.update(restoreRuns).set(row).where(eq(restoreRuns.id, runId));
        } catch (updateErr) {
          logger.error('Could not update restore_runs after force-reconcile:', updateErr);
        }
        try {
          writeAuditLog({
            actor: req.user!.id,
            actorName: req.user?.username || req.user!.id,
            targetId: String(runId),
            targetType: 'restore_run',
            action: 'UPDATE',
            details:
              `Force schema reconcile (accept data loss) on restore run #${runId}: ${reconcile.status} ` +
              `(applied=${reconcile.statementsApplied}, skipped=${reconcile.statementsSkipped})`,
          });
        } catch (_) {}
        return res.json({
          success: reconcile.status === 'success' || reconcile.status === 'warnings_applied' || reconcile.status === 'no_changes',
          reconcile: {
            status: reconcile.status,
            statementsApplied: reconcile.statementsApplied,
            statementsSkipped: reconcile.statementsSkipped,
            warnings: reconcile.warnings,
            error: reconcile.error,
          },
        });
      });
    } catch (err) {
      if (err instanceof DestructiveDbOpInProgressError) {
        return res.status(409).json({ error: err.code, message: err.message });
      }
      logger.error('Force reconcile error:', err);
      return res.status(500).json({ error: 'Force reconcile failed' });
    }
  });
}
