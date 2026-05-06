/**
 * Year sealing (Task #427).
 *
 * When an accounting year is closed (PUT /api/books/:id { status:
 * 'Closed' }), we automatically build a one-time permanent file archive
 * of every scan that belongs to that year and upload it to
 * `backups/years/year-<year>.tar.gz`. The catalog row lives in
 * ops.year_archives so it survives database restores in lockstep with
 * the archive object itself.
 *
 * Re-closing a previously-reopened year overwrites the existing
 * archive (storage key is fixed per year) and updates the row, so any
 * post-reopen edits are captured in the seal — see Task #427 Q4.
 *
 * Closed-year scans are intentionally NOT removed from the bucket:
 *   - Users can still browse them inside the running app.
 *   - Reopening a year just lets you edit again; no file movement.
 *   - The seal is the disaster-recovery copy, not a "move to cold
 *     storage" operation.
 *
 * Failure handling: if archiving fails (network blip, etc) the row is
 * still upserted with success=false + errorMessage so the UI can
 * surface the warning and the admin can retry. The year-close itself
 * is NOT rolled back — the financial-year status is the source of
 * truth for the business workflow; the seal is a best-effort backup
 * artefact.
 */

import { db } from "./db";
import { yearArchives } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";
import { withBackupLock } from "./backupLock";

export type SealActor = { id: string | null; username: string };

export interface SealYearResult {
  success: boolean;
  year: number;
  storageKey?: string;
  filename?: string;
  fileSize?: number;
  objectCount?: number;
  error?: string;
}

export async function sealYearArchive(year: number, actor: SealActor): Promise<SealYearResult> {
  let archiveResult: any = null;
  // Architect HIGH#1 mitigation: take the shared backup advisory lock
  // around the archive build so a rolling backup and a year-seal can't
  // race on the bucket at the same time. If the lock is held by an
  // in-flight backup we wait briefly via a short retry rather than
  // failing the route — Open→Closed is a low-frequency admin action.
  let lockOutcome: { acquired: boolean } = { acquired: false };
  for (let attempt = 0; attempt < 30 && !lockOutcome.acquired; attempt++) {
    lockOutcome = await withBackupLock(async () => {
      try {
        // @ts-ignore - JS file
        const { archiveFiles } = await import("../scripts/archiveFiles.js");
        archiveResult = await archiveFiles({ onlyYear: year });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`sealYearArchive(${year}): archive script threw:`, err);
        archiveResult = { success: false, error: msg };
      }
    });
    if (!lockOutcome.acquired) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!lockOutcome.acquired) {
    archiveResult = { success: false, error: "Could not acquire backup lock after 30s — a rolling backup is still in progress. Try again shortly." };
  }

  const success = archiveResult?.success === true;

  // Upsert ops.year_archives. Re-closing overwrites the prior row so
  // the catalog matches the (now overwritten) storage object.
  try {
    await db
      .insert(yearArchives)
      .values({
        year,
        sealedBy: actor.id,
        sealedByName: actor.username,
        storageKey: archiveResult?.storageKey ?? null,
        filename: archiveResult?.filename ?? null,
        fileSize: archiveResult?.fileSize ?? null,
        objectCount: archiveResult?.objectCount ?? null,
        success,
        errorMessage: success ? null : (archiveResult?.error ?? "Unknown archive error"),
      })
      .onConflictDoUpdate({
        target: yearArchives.year,
        set: {
          sealedAt: sql`now()`,
          sealedBy: actor.id,
          sealedByName: actor.username,
          storageKey: archiveResult?.storageKey ?? null,
          filename: archiveResult?.filename ?? null,
          fileSize: archiveResult?.fileSize ?? null,
          objectCount: archiveResult?.objectCount ?? null,
          success,
          errorMessage: success ? null : (archiveResult?.error ?? "Unknown archive error"),
        },
      });
  } catch (insertErr) {
    logger.error(`sealYearArchive(${year}): failed to upsert year_archives row:`, insertErr);
  }

  return {
    success,
    year,
    storageKey: archiveResult?.storageKey,
    filename: archiveResult?.filename,
    fileSize: archiveResult?.fileSize,
    objectCount: archiveResult?.objectCount,
    error: success ? undefined : archiveResult?.error,
  };
}

/**
 * Helper for runBackup: read the SUCCESSFULLY-SEALED year set from
 * `ops.year_archives` (architect HIGH#3 fix). The previous version
 * read from `financial_years.status='Closed'`, which left a window
 * between "year is set Closed" and "seal succeeded" where the rolling
 * backup would EXCLUDE that year's scans even though no permanent
 * seal existed yet — making those scans recoverable from neither the
 * rolling backup nor the year-archive.
 *
 * By switching to `ops.year_archives.success=true`, a year is excluded
 * from the rolling backup ONLY once its permanent archive is on disk,
 * so there is always at least one recoverable copy of every scan.
 * Years marked Closed have their own permanent seal so the rolling
 * backup excludes them.
 */
export async function getClosedYears(): Promise<number[]> {
  try {
    const rows = await db.execute<{ year: number }>(
      sql`SELECT year FROM ops.year_archives WHERE success = true`
    );
    return (rows.rows as Array<{ year: number }>).map((r) => Number(r.year));
  } catch (err) {
    logger.error("getClosedYears failed — defaulting to empty list (rolling backup will include all years):", err);
    return [];
  }
}
