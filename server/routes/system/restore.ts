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
import { RESTORE_PHRASE } from "../../../shared/destructiveActionPhrases";
import {
  withDestructiveDbLock,
  DestructiveDbOpInProgressError,
} from "../../destructiveDbLock";

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
   *   3. AFTER the restore, update the pre-created row with the final result.
   *      Also best-effort write to public.audit_log (which is recreated from
   *      the backup; if the backup is very old and lacks audit_log, this fails
   *      silently — the ops record is already the definitive audit trail).
   */
  async function runRestore(opts: {
    /** A readable .sql.gz stream OR a path to an existing .sql.gz file on disk. */
    sqlGzInput: import('stream').Readable | string;
    triggeredBy: string;
    sourceBackupRunId?: number;
    sourceFilename?: string;
    res: import('express').Response;
    actorName: string;
  }) {
    const { sqlGzInput, triggeredBy, sourceBackupRunId, sourceFilename, res, actorName } = opts;
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
      console.error('Could not pre-create ops.restore_runs record:', preErr);
    }

    // Step 2: Run the restore.
    let result: { success: boolean; error?: string; durationMs: number };
    try {
      // @ts-ignore
      const { restoreBackup } = await import('../../../scripts/restoreBackup.js');
      result = await restoreBackup(sqlGzInput);
    } catch (importOrRunError: any) {
      console.error('Error during restore execution:', importOrRunError);
      result = { success: false, error: importOrRunError.message || 'Restore failed unexpectedly', durationMs: 0 };
    }

    const finishedAt = new Date();

    // Step 3: Update the pre-created ops record with the final outcome.
    // The ops schema was untouched by the restore, so this always works.
    if (preCreatedId !== null) {
      try {
        await db.update(restoreRuns)
          .set({
            finishedAt,
            success: result.success,
            errorMessage: result.error ?? null,
            durationMs: result.durationMs ?? null,
          })
          .where(eq(restoreRuns.id, preCreatedId));
      } catch (updateErr) {
        console.error('Could not update ops.restore_runs record after restore:', updateErr);
      }
    } else {
      // Pre-create failed — insert a new complete record now.
      try {
        await db.insert(restoreRuns).values({
          triggeredBy,
          triggeredByName: actorName,
          sourceBackupRunId: sourceBackupRunId ?? null,
          sourceFilename: sourceFilename ?? null,
          finishedAt,
          success: result.success,
          errorMessage: result.error ?? null,
          durationMs: result.durationMs ?? null,
        });
      } catch (retryErr) {
        console.error('Could not insert ops.restore_runs record after restore:', retryErr);
      }
    }

    // Step 4 (best-effort): Write to public.audit_log in the now-restored DB.
    try {
      writeAuditLog({
        actor: triggeredBy,
        actorName,
        targetId: 'restore',
        targetType: 'restore_run',
        action: 'CREATE',
        details: `Database restore from ${label} ${result.success ? 'succeeded' : `failed: ${result.error}`} (durationMs: ${result.durationMs})`,
      });
    } catch (_) {}

    if (result.success) {
      return res.json({ success: true, durationMs: result.durationMs });
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

    const stream = objectStorageClient.downloadAsStream(run.dbStorageKey);
    return runRestore({
      sqlGzInput: stream,
      triggeredBy: req.user!.id,
      actorName: req.user?.username || req.user!.id,
      sourceBackupRunId: runId,
      sourceFilename: run.dbStorageKey.split('/').pop() || run.dbStorageKey,
      res,
    });
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

    bb.on('field', (fieldname: string, value: string) => {
      if (fieldname === 'confirmation') confirmationField = value;
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
            console.error('Failed to delete temp restore file:', err.message);
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
        console.error('Error staging upload to temp file:', err.message);
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
          res,
        });
      } finally {
        cleanupTemp();
      }
    });

    bb.on('error', (err: Error) => {
      console.error('Busboy parse error:', err);
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
        })
        .from(restoreRuns)
        .leftJoin(backupRuns, eq(restoreRuns.sourceBackupRunId, backupRuns.id))
        .orderBy(desc(restoreRuns.restoredAt))
        .limit(10);
      res.json({ runs: rows });
    } catch (error) {
      console.error('Error fetching restore runs:', error);
      res.status(500).json({ error: 'Failed to fetch restore history' });
    }
  });
}
