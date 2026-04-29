/**
 * Shared backup runner.
 *
 * Originally lived inside POST /api/ops/run-backups; extracted so the
 * scheduled-backup tick (server/scheduler.ts) and the manual route can
 * call the same code path. See task #325.
 *
 * Records into backup_runs (success of db dump + manifest) and writes
 * an audit log entry. After a successful run, prunes successful
 * backup_runs rows beyond the configured retention count, deleting
 * both the storage object and the DB row.
 */

import { db } from "./db";
import { backupRuns, companySettings } from "@shared/schema";
import { desc, eq } from "drizzle-orm";
import { writeAuditLog, deleteStorageObjectSafely } from "./middleware";
import { logger } from "./logger";

export type BackupActor = {
  id: string | null;
  username: string;
};

export interface BackupRunResult {
  success: boolean;
  timestamp: string;
  dbBackup: {
    success: boolean;
    filename?: string;
    storageKey?: string;
    fileSize?: number;
    error?: string;
  };
  manifestBackup: {
    success: boolean;
    filename?: string;
    storageKey?: string;
    totalObjects?: number;
    totalSize?: number;
    error?: string;
  };
  prunedCount: number;
  errorMessage?: string;
}

/**
 * Run a single full backup (db dump + object manifest), record the result
 * to backup_runs, write audit log, and prune old successful backups
 * beyond the configured retention count.
 *
 * Never throws — failures are captured into the returned result.
 */
export async function runBackup(actor: BackupActor): Promise<BackupRunResult> {
  const startedAt = new Date();
  let dbResult: any = null;
  let manifestResult: any = null;
  let topError: string | undefined;

  try {
    // @ts-ignore - JS file
    const { uploadBackup } = await import("../scripts/uploadBackup.js");
    // @ts-ignore - JS file
    const { writeManifest } = await import("../scripts/writeManifest.js");

    [dbResult, manifestResult] = await Promise.all([uploadBackup(), writeManifest()]);
  } catch (err) {
    topError = err instanceof Error ? err.message : String(err);
    logger.error("runBackup: backup pipeline threw:", err);
  }

  const success = !!(dbResult?.success && manifestResult?.success);

  // Record run row (best-effort)
  try {
    await db.insert(backupRuns).values({
      ranAt: startedAt,
      finishedAt: new Date(),
      triggeredBy: actor.id,
      triggeredByLabel: actor.username,
      success,
      dbSuccess: dbResult?.success ?? false,
      dbFilename: dbResult?.filename || null,
      dbStorageKey: dbResult?.storageKey || null,
      dbFileSize: dbResult?.fileSize || null,
      manifestSuccess: manifestResult?.success ?? false,
      manifestFilename: manifestResult?.filename || null,
      manifestStorageKey: manifestResult?.storageKey || null,
      manifestTotalObjects: manifestResult?.totalObjects || null,
      manifestTotalSizeBytes: manifestResult?.totalSize || null,
      errorMessage:
        topError ||
        (!success
          ? [dbResult?.error, manifestResult?.error].filter(Boolean).join("; ")
          : null),
    });
  } catch (insertErr) {
    logger.error("runBackup: failed to insert backup_runs row:", insertErr);
  }

  try {
    writeAuditLog({
      actor: actor.id ?? "system",
      actorName: actor.username,
      targetId: "backup",
      targetType: "backup_run",
      action: "CREATE",
      details: `${actor.username === "scheduler" ? "Scheduled" : "Manual"} backup ${success ? "succeeded" : "failed"}`,
    });
  } catch (auditErr) {
    logger.error("runBackup: failed to write audit log:", auditErr);
  }

  let prunedCount = 0;
  if (success) {
    try {
      prunedCount = await pruneOldBackups();
    } catch (pruneErr) {
      logger.error("runBackup: prune threw:", pruneErr);
    }
  }

  return {
    success,
    timestamp: new Date().toISOString(),
    dbBackup: {
      success: dbResult?.success ?? false,
      filename: dbResult?.filename,
      storageKey: dbResult?.storageKey,
      fileSize: dbResult?.fileSize,
      error: dbResult?.error,
    },
    manifestBackup: {
      success: manifestResult?.success ?? false,
      filename: manifestResult?.filename,
      storageKey: manifestResult?.storageKey,
      totalObjects: manifestResult?.totalObjects,
      totalSize: manifestResult?.totalSize,
      error: manifestResult?.error,
    },
    prunedCount,
    errorMessage: topError,
  };
}

/**
 * Prune successful backup_runs rows beyond the configured retention count.
 * Deletes the underlying storage objects (best-effort) and the DB rows.
 *
 * Reads retention from companySettings.backupScheduleRetentionCount; if no
 * row exists, defaults to keeping the most recent 7 successful backups.
 *
 * Returns the number of rows deleted from backup_runs.
 */
export async function pruneOldBackups(): Promise<number> {
  const [settings] = await db.select().from(companySettings).limit(1);
  const retention = Math.max(1, Math.min(14, settings?.backupScheduleRetentionCount ?? 7));

  const allSuccessful = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.success, true))
    .orderBy(desc(backupRuns.ranAt));

  // Keep the N most recent successes; everything beyond that is candidate
  // for pruning. Iterate the candidates oldest-first so the storage
  // delete attempts proceed from oldest to newest, matching the wording
  // of the retention policy.
  const toPrune = allSuccessful.slice(retention).reverse();
  if (toPrune.length === 0) return 0;

  let deleted = 0;
  for (const row of toPrune) {
    const { allGone } = await tryDeleteBackupRowObjects(row);
    if (!allGone) continue;

    try {
      await db.delete(backupRuns).where(eq(backupRuns.id, row.id));
      deleted++;
    } catch (rowErr) {
      logger.error(`pruneOldBackups: failed to delete backup_runs row ${row.id}:`, rowErr);
    }
  }
  return deleted;
}

/**
 * Per-row helper: attempt to delete every storage object referenced by a
 * backup_runs row and report whether the catalogue row is safe to drop.
 *
 * Both keys are deleted via the shared deleteStorageObjectSafely() helper
 * (server/middleware.ts), which:
 *   - passes `ignoreNotFound:true` to the SDK, so 404/NoSuchKey normalises
 *     to {ok:true} (= already gone, safe to drop the catalogue row);
 *   - normalises BOTH thrown errors AND the SDK's silent {ok:false, error}
 *     return shape into {ok:false, error} — the prior implementation only
 *     caught throws and silently treated {ok:false} as "deleted", which
 *     would orphan the file while removing the only UI pointer to it.
 *
 * Exported so a unit test can drive the {ok:false} branch via the
 * one-shot test seam in server/middleware.ts (setForceStorageDeleteFail)
 * without needing live backup_runs rows or live storage objects.
 */
export async function tryDeleteBackupRowObjects(
  row: { id: number; dbStorageKey: string | null; manifestStorageKey: string | null }
): Promise<{ allGone: boolean }> {
  let allGone = true;

  if (row.dbStorageKey) {
    const result = await deleteStorageObjectSafely(row.dbStorageKey);
    if (!result.ok) {
      allGone = false;
      logger.error(
        `pruneOldBackups: failed to delete storage object ${row.dbStorageKey}, retaining backup_runs row ${row.id} for retry: ${result.error}`
      );
    }
  }
  if (row.manifestStorageKey) {
    const result = await deleteStorageObjectSafely(row.manifestStorageKey);
    if (!result.ok) {
      allGone = false;
      logger.error(
        `pruneOldBackups: failed to delete manifest object ${row.manifestStorageKey}, retaining backup_runs row ${row.id} for retry: ${result.error}`
      );
    }
  }

  return { allGone };
}
