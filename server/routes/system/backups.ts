import type { Express } from "express";
import { backupRuns, yearArchives } from "@shared/schema";
import { db } from "../../db";
import { eq, desc } from "drizzle-orm";
import {
  requireAuth,
  writeAuditLog,
  objectStorageClient,
  type AuthenticatedRequest,
} from "../../middleware";
import { runBackup } from "../../runBackup";
import { withBackupLock } from "../../backupLock";
import { getBackupSchedule, updateBackupSchedule, BackupScheduleInputSchema } from "../../backupSchedule";
import { logger } from "../../logger";

export function registerBackupRoutes(app: Express) {
  app.get('/api/ops/backup-status', requireAuth(['Admin']), async (req, res) => {
    try {
      // Task #427 audit follow-up: report on the real artefact set.
      // The legacy `backups/objects/` manifest prefix is no longer
      // produced; we now list `backups/files/` (the rolling .tar.gz)
      // and `backups/years/` (permanent year seals) and additionally
      // surface the catalog row count from ops.year_archives so the
      // admin sees both bucket and DB views of the year-archive set.
      const dbBackupsResult = await objectStorageClient.list({ prefix: 'backups/db/' });
      const filesBackupsResult = await objectStorageClient.list({ prefix: 'backups/files/' });
      const yearsBackupsResult = await objectStorageClient.list({ prefix: 'backups/years/' });

      const pickLatest = (r: any) => {
        if (!r.ok || r.value.length === 0) return null;
        const sorted = r.value.sort((a: any, b: any) =>
          new Date(b.timeCreated || b.updated).getTime() - new Date(a.timeCreated || a.updated).getTime()
        );
        const obj = sorted[0];
        return { filename: obj.name, size: obj.size || 0, timestamp: obj.timeCreated || obj.updated };
      };

      let yearArchiveCatalogCount = 0;
      try {
        const rows = await db.select().from(yearArchives).where(eq(yearArchives.success, true));
        yearArchiveCatalogCount = rows.length;
      } catch (catalogErr) {
        logger.error('backup-status: failed to read ops.year_archives:', catalogErr);
      }

      res.json({
        latestDbBackup: pickLatest(dbBackupsResult),
        latestFilesBackup: pickLatest(filesBackupsResult),
        latestYearArchive: pickLatest(yearsBackupsResult),
        yearArchiveCatalogCount,
        // Kept for backward compat — old clients that read this field
        // will see null and treat it as "no manifest", which is true.
        latestManifestBackup: null,
      });
    } catch (error) {
      logger.error('Error getting backup status:', error);
      res.status(500).json({ error: 'Failed to get backup status' });
    }
  });

  app.post('/api/ops/run-backups', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      // Share the same advisory lock as the scheduled-backup tick so a
      // manual backup and a scheduled backup can never overlap, and two
      // simultaneous manual POSTs cannot collide on filenames or pruning.
      // Try-lock semantics: never wait — return 409 immediately if the
      // lock is held. (Task #345.)
      const outcome = await withBackupLock(async () => runBackup({
        id: req.user!.id,
        username: req.user?.username || String(req.user!.id),
      }));
      if (!outcome.acquired) {
        res.status(409).json({
          error: 'backup_already_running',
          message: 'Another backup is already in progress. Please wait for it to finish before starting a new one.',
        });
        return;
      }
      const result = outcome.result;
      if (result.success) {
        res.status(200).json(result);
      } else {
        logger.error('Backup failed:', { db: result.dbBackup, manifest: result.manifestBackup, err: result.errorMessage });
        res.status(500).json(result);
      }
    } catch (error) {
      logger.error('Error running backups:', error);
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({ success: false, error: errMsg, timestamp: new Date().toISOString() });
    }
  });

  app.get('/api/ops/backup-schedule', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const schedule = await getBackupSchedule();
      res.json(schedule);
    } catch (error) {
      logger.error('Error fetching backup schedule:', error);
      res.status(500).json({ error: 'Failed to fetch backup schedule' });
    }
  });

  app.put('/api/ops/backup-schedule', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = BackupScheduleInputSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstIssue = parsed.error.issues[0];
        return res.status(400).json({
          error: firstIssue?.message || 'Invalid backup schedule input',
          field: firstIssue?.path.join('.') || null,
          issues: parsed.error.issues,
        });
      }
      const updated = await updateBackupSchedule(parsed.data, req.user!.id);
      writeAuditLog({
        actor: req.user!.id,
        actorName: req.user?.username || String(req.user!.id),
        targetId: 'company',
        targetType: 'backup_schedule',
        action: 'UPDATE',
        details: `Backup schedule ${parsed.data.enabled ? `enabled (${parsed.data.frequency} at ${parsed.data.timeOfDay} Asia/Dubai, retain ${parsed.data.retentionCount}, alert ${parsed.data.alertThresholdDays}d)` : 'disabled'}`,
      });
      res.json(updated);
    } catch (error) {
      logger.error('Error updating backup schedule:', error);
      res.status(500).json({ error: 'Failed to update backup schedule' });
    }
  });

  app.get('/api/ops/backup-runs', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const runs = await db.select().from(backupRuns).orderBy(desc(backupRuns.ranAt)).limit(20);
      res.json({ runs });
    } catch (error) {
      logger.error('Error fetching backup runs:', error);
      res.status(500).json({ error: 'Failed to fetch backup runs' });
    }
  });

  /**
   * GET /api/ops/latest-backup — informational backup-freshness lookup.
   *
   * Used by the factory-reset confirmation dialog (Task #336) to surface a
   * yellow warning panel when the last successful backup is missing or older
   * than `freshnessWindowHours`.
   *
   * INFORMATIONAL ONLY. Nothing about this endpoint or its consumers gates
   * the destructive POST /api/ops/factory-reset call. The four-wall defence
   * (Task #331) remains the only enforcement boundary; this endpoint exists
   * solely to give the admin context before they choose to proceed.
   *
   * Response shape (always 200 for an authenticated Admin):
   *   {
   *     lastSuccessfulBackupAt: string | null,  // ISO timestamp of most recent fully-successful backup, or null
   *     freshnessWindowHours:   number,         // currently 24
   *     isFresh:                boolean,        // true iff lastSuccessfulBackupAt exists AND is younger than the window
   *   }
   */
  const BACKUP_FRESHNESS_WINDOW_HOURS = 24;
  app.get('/api/ops/latest-backup', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const [latest] = await db
        .select({ ranAt: backupRuns.ranAt })
        .from(backupRuns)
        .where(eq(backupRuns.success, true))
        .orderBy(desc(backupRuns.ranAt))
        .limit(1);

      const lastSuccessfulBackupAt = latest?.ranAt ?? null;
      let isFresh = false;
      if (lastSuccessfulBackupAt) {
        const ageMs = Date.now() - new Date(lastSuccessfulBackupAt).getTime();
        isFresh = ageMs >= 0 && ageMs < BACKUP_FRESHNESS_WINDOW_HOURS * 60 * 60 * 1000;
      }

      res.json({
        lastSuccessfulBackupAt: lastSuccessfulBackupAt
          ? new Date(lastSuccessfulBackupAt).toISOString()
          : null,
        freshnessWindowHours: BACKUP_FRESHNESS_WINDOW_HOURS,
        isFresh,
      });
    } catch (error) {
      logger.error('Error fetching latest-backup freshness:', error);
      res.status(500).json({ error: 'Failed to fetch latest-backup freshness' });
    }
  });

  // Task #427 — download the file-bytes archive (tar.gz of every scan +
  // logo) attached to a backup run. Mirrors /download (the SQL dump).
  app.get('/api/ops/backup-runs/:id/download-files', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const runId = parseInt(req.params.id, 10);
      if (isNaN(runId)) return res.status(400).json({ error: 'Invalid backup run ID' });

      const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1);
      if (!run) return res.status(404).json({ error: 'Backup run not found' });
      if (!run.filesStorageKey) return res.status(404).json({ error: 'No file archive associated with this run' });
      if (!run.filesSuccess) return res.status(400).json({ error: 'The file archive for this backup did not succeed — no file to download' });

      const filename = run.filesStorageKey.split('/').pop() || 'files.tar.gz';

      const existsResult = await objectStorageClient.exists(run.filesStorageKey);
      if (!existsResult.ok || !existsResult.value) {
        return res.status(404).json({ error: 'Archive file no longer exists in storage — it may have been deleted or expired' });
      }

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      const stream = objectStorageClient.downloadAsStream(run.filesStorageKey);
      stream.on('error', (err: Error) => {
        logger.error('Error streaming files archive from storage:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to stream files archive from storage' });
      });
      stream.pipe(res);
    } catch (error) {
      logger.error('Error downloading files archive:', error);
      res.status(500).json({ error: 'Failed to download files archive' });
    }
  });

  // Task #427 — list every sealed year archive (one row per closed
  // year). Lives in ops.year_archives so the catalog survives restores.
  app.get('/api/ops/year-archives', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const rows = await db.select().from(yearArchives).orderBy(desc(yearArchives.year));
      res.json({ archives: rows });
    } catch (error) {
      logger.error('Error fetching year archives:', error);
      res.status(500).json({ error: 'Failed to fetch year archives' });
    }
  });

  // Task #427 — download a single sealed year archive.
  app.get('/api/ops/year-archives/:year/download', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const year = parseInt(req.params.year, 10);
      if (isNaN(year)) return res.status(400).json({ error: 'Invalid year' });

      const [row] = await db.select().from(yearArchives).where(eq(yearArchives.year, year)).limit(1);
      if (!row) return res.status(404).json({ error: 'No sealed archive for this year' });
      if (!row.success || !row.storageKey) return res.status(400).json({ error: 'This year was not sealed successfully — no archive to download' });

      const filename = row.filename || row.storageKey.split('/').pop() || `year-${year}.tar.gz`;

      const existsResult = await objectStorageClient.exists(row.storageKey);
      if (!existsResult.ok || !existsResult.value) {
        return res.status(404).json({ error: 'Sealed archive no longer exists in storage' });
      }

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      const stream = objectStorageClient.downloadAsStream(row.storageKey);
      stream.on('error', (err: Error) => {
        logger.error('Error streaming sealed year archive:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to stream year archive' });
      });
      stream.pipe(res);
    } catch (error) {
      logger.error('Error downloading year archive:', error);
      res.status(500).json({ error: 'Failed to download year archive' });
    }
  });

  app.get('/api/ops/backup-runs/:id/download', requireAuth(['Admin']), async (req: AuthenticatedRequest, res) => {
    try {
      const runId = parseInt(req.params.id, 10);
      if (isNaN(runId)) return res.status(400).json({ error: 'Invalid backup run ID' });

      const [run] = await db.select().from(backupRuns).where(eq(backupRuns.id, runId)).limit(1);
      if (!run) return res.status(404).json({ error: 'Backup run not found' });
      if (!run.dbStorageKey) return res.status(404).json({ error: 'No database backup file associated with this run' });
      if (!run.dbSuccess) return res.status(400).json({ error: 'This backup run did not succeed — no file to download' });

      const filename = run.dbStorageKey.split('/').pop() || 'backup.sql.gz';

      const existsResult = await objectStorageClient.exists(run.dbStorageKey);
      if (!existsResult.ok || !existsResult.value) {
        return res.status(404).json({ error: 'Backup file no longer exists in storage — it may have been deleted or expired' });
      }

      res.set({
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      });

      const stream = objectStorageClient.downloadAsStream(run.dbStorageKey);
      stream.on('error', (err: Error) => {
        logger.error('Error streaming backup file from storage:', err);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to stream backup file from storage' });
      });
      stream.pipe(res);
    } catch (error) {
      logger.error('Error downloading backup:', error);
      res.status(500).json({ error: 'Failed to download backup' });
    }
  });
}
