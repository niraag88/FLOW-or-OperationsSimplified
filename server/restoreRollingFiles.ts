/**
 * Rolling-files restore (Task #427).
 *
 * Replaces the "rolling" portion of the bucket (logos + open-year
 * scans) from a tar.gz archive while leaving closed-year sealed scans
 * untouched.
 *
 * Algorithm (snapshot-and-rollback):
 *   1. List every key currently in the bucket that BELONGS to the
 *      rolling set (i.e. NOT under `backups/` and NOT in a closed-year
 *      scan path). These are the keys the restore is about to replace.
 *   2. Snapshot each of those keys to `backups/_pre_restore/<runId>/`
 *      by copying the bytes (stream → buffer → upload).
 *   3. Delete the originals.
 *   4. Stream the tarball back via scripts/restoreFiles.js.
 *   5. On success → delete the snapshot prefix (Task #427 Q2 Option A:
 *      snapshot kept ONLY on failure, so success leaves the bucket
 *      clean).
 *      On failure → re-upload every snapshot key to its original
 *      location and KEEP the snapshot prefix so the admin can audit.
 *
 * Closed-year scans are always preserved — they live outside the
 * rolling set and have their own permanent year-archive seal.
 *
 * Memory profile: at most one object's bytes in memory at a time
 * (per-file 5 MB upload cap bounds this).
 */

import { logger } from "./logger";
import { objectStorageClient } from "./middleware";
import { getClosedYears } from "./sealYearArchive";
// @ts-ignore — JS module
import { shouldInclude } from "../scripts/archiveFiles.js";

export interface RestoreFilesOutcome {
  success: boolean;
  restoredCount: number;
  rolledBack: boolean;
  snapshotPrefix: string;
  snapshotKept: boolean;
  error?: string;
}

function normaliseListPage(value: any) {
  if (Array.isArray(value)) return { items: value, nextContinuationToken: null };
  if (value && typeof value === "object" && Array.isArray(value.objects)) {
    return { items: value.objects, nextContinuationToken: value.nextContinuationToken ?? null };
  }
  throw new Error("Unrecognised list page shape from objectStorageClient");
}

async function listAllKeys(): Promise<string[]> {
  const all: string[] = [];
  let token: string | null = null;
  do {
    const result: any = await objectStorageClient.list((token ? { continuationToken: token } : {}) as any);
    if (!result.ok) throw new Error(`Failed to list bucket: ${result.error}`);
    const { items, nextContinuationToken } = normaliseListPage(result.value);
    for (const o of items) all.push(o.name);
    token = nextContinuationToken;
  } while (token);
  return all;
}

/**
 * Replace the rolling-file set in object storage from a local tar.gz.
 *
 * @param tarGzPath  Local filesystem path to the .tar.gz archive.
 * @param runId      Used to namespace the snapshot prefix.
 */
export async function restoreRollingFiles(
  tarGzPath: string,
  runId: string | number,
): Promise<RestoreFilesOutcome> {
  const snapshotPrefix = `backups/_pre_restore/${runId}/`;
  const snapshotMap: Array<{ originalKey: string; snapshotKey: string }> = [];

  try {
    const closedYears = new Set(await getClosedYears());
    const allKeys = await listAllKeys();
    const rollingKeys = allKeys.filter((k) => shouldInclude(k, closedYears, null));

    logger.info(
      `[restoreRollingFiles] runId=${runId}: snapshotting ${rollingKeys.length} rolling keys to ${snapshotPrefix}`,
    );

    // 1. Snapshot
    for (const key of rollingKeys) {
      const dl = await objectStorageClient.downloadAsBytes(key);
      if (!dl.ok) throw new Error(`Snapshot failed for ${key}: ${dl.error}`);
      const raw: any = Array.isArray(dl.value) ? dl.value[0] : dl.value;
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const snapshotKey = `${snapshotPrefix}${key}`;
      const up = await objectStorageClient.uploadFromBytes(snapshotKey, bytes);
      if (!up.ok) throw new Error(`Snapshot upload failed for ${key} → ${snapshotKey}: ${up.error}`);
      snapshotMap.push({ originalKey: key, snapshotKey });
    }

    // 2. Wipe the originals
    for (const { originalKey } of snapshotMap) {
      const del = await objectStorageClient.delete(originalKey);
      if (!del.ok) {
        logger.error(`[restoreRollingFiles] failed to delete ${originalKey} pre-restore: ${del.error}`);
        // Continue — duplicate uploads from the tarball will overwrite.
      }
    }

    // 3. Stream the tarball back in. Pass the closed-year set so the
    //    extractor refuses to overwrite sealed-year scans even if
    //    someone hand-crafted the tarball (defence-in-depth alongside
    //    archiveFiles' own exclusion at backup time).
    // @ts-ignore - JS module
    const { restoreFilesFromArchive } = await import("../scripts/restoreFiles.js");
    const restoreResult = await restoreFilesFromArchive(tarGzPath, { closedYears: Array.from(closedYears) });
    if (!restoreResult.success) {
      throw new Error(`Tarball restore failed: ${restoreResult.error}`);
    }
    if (restoreResult.skippedCount && restoreResult.skippedCount > 0) {
      logger.warn(`[restoreRollingFiles] runId=${runId}: ${restoreResult.skippedCount} archive entr(ies) skipped by allowlist`);
    }

    // 4. Success path — delete snapshot prefix.
    for (const { snapshotKey } of snapshotMap) {
      const del = await objectStorageClient.delete(snapshotKey);
      if (!del.ok) {
        logger.error(`[restoreRollingFiles] failed to clean up snapshot ${snapshotKey}: ${del.error}`);
      }
    }

    return {
      success: true,
      restoredCount: restoreResult.restoredCount,
      rolledBack: false,
      snapshotPrefix,
      snapshotKept: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[restoreRollingFiles] runId=${runId}: failure — rolling back. Reason:`, err);

    // Rollback: first wipe ANY rolling key that the tarball may have
    // partially written (architect MED#5 — without this, a failure
    // mid-tar would leave keys that weren't in the original snapshot
    // map but ARE part of the rolling-file set), then re-upload each
    // snapshot to its original location.
    let rolledBack = true;
    try {
      const closedYears2 = new Set(await getClosedYears());
      const allKeys2 = await listAllKeys();
      const rollingNow = allKeys2.filter((k) => shouldInclude(k, closedYears2, null));
      for (const k of rollingNow) {
        const del = await objectStorageClient.delete(k);
        if (!del.ok) {
          logger.error(`[restoreRollingFiles] rollback wipe failed for ${k}: ${del.error}`);
        }
      }
    } catch (wipeErr) {
      rolledBack = false;
      logger.error(`[restoreRollingFiles] rollback wipe pass threw — partial-restore keys may remain:`, wipeErr);
    }

    for (const { originalKey, snapshotKey } of snapshotMap) {
      try {
        const dl = await objectStorageClient.downloadAsBytes(snapshotKey);
        if (!dl.ok) {
          rolledBack = false;
          logger.error(`[restoreRollingFiles] rollback download failed for ${snapshotKey}: ${dl.error}`);
          continue;
        }
        const raw: any = Array.isArray(dl.value) ? dl.value[0] : dl.value;
        const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        const up = await objectStorageClient.uploadFromBytes(originalKey, bytes);
        if (!up.ok) {
          rolledBack = false;
          logger.error(`[restoreRollingFiles] rollback upload failed for ${originalKey}: ${up.error}`);
        }
      } catch (rbErr) {
        rolledBack = false;
        logger.error(`[restoreRollingFiles] rollback exception for ${originalKey}:`, rbErr);
      }
    }

    return {
      success: false,
      restoredCount: 0,
      rolledBack,
      snapshotPrefix,
      snapshotKept: true,
      error: msg,
    };
  }
}
