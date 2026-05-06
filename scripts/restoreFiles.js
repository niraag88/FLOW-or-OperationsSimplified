#!/usr/bin/env node

/**
 * Streaming file-bytes restore (Task #427).
 *
 * Reads a tar.gz produced by scripts/archiveFiles.js and re-uploads
 * each entry to object storage under its original key.
 *
 * Restore semantics (rolling-backup file archive):
 *   1. The caller (server/routes/system/restore.ts) FIRST takes a
 *      snapshot of the keys that are about to be replaced (logos +
 *      open-year scan prefixes) into `backups/_pre_restore/<runId>/…`,
 *      so any failure can be rolled back.
 *   2. The caller wipes those rolling prefixes.
 *   3. This script streams the tarball back in.
 *   4. On success, the snapshot prefix is deleted (Q2: Option A).
 *      On failure, the snapshot is restored and the snapshot prefix is
 *      kept so the admin can inspect / re-roll.
 *
 * Closed-year scans are NEVER touched by this restore — they live
 * outside the rolling archive and have their own permanent seal.
 *
 * Memory profile: tar-stream extract emits one entry stream at a time.
 * We buffer each entry into memory before uploading (each file is ≤ 5
 * MB by the per-file upload cap), so peak heap stays small regardless
 * of total archive size.
 */

import { createReadStream } from 'fs';
import { createGunzip } from 'zlib';
import { extract as tarExtract } from 'tar-stream';
import { Client } from '@replit/object-storage';
import { shouldInclude } from './archiveFiles.js';

const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
});

/**
 * @param {string} tarGzPath  Local path to the .tar.gz archive.
 * @param {object} [opts]
 * @param {Iterable<number>} [opts.closedYears]  Year numbers to refuse
 *   uploading. Defends the closed-year sealed scans from being
 *   overwritten by a stale or hand-crafted .tar.gz upload (architect
 *   review HIGH#2). When omitted, only `backups/` keys are rejected.
 * @returns {Promise<{ success, restoredCount, skippedCount, skippedKeys, error? }>}
 */
async function restoreFilesFromArchive(tarGzPath, opts = {}) {
  let restoredCount = 0;
  const skippedKeys = [];
  const closedYears = new Set(opts.closedYears || []);
  return new Promise((resolve) => {
    const extract = tarExtract();

    extract.on('entry', (header, stream, next) => {
      // Allowlist gate (architect HIGH#2): NEVER let a tarball write
      // to `backups/*` (would clobber backup objects) or to a
      // `<scope>/<closedYear>/...` path (closed years are immutable
      // and have their own permanent seal).
      const key = header.name;
      if (!shouldInclude(key, closedYears, null)) {
        skippedKeys.push(key);
        stream.on('end', () => next());
        stream.on('error', next);
        stream.resume();
        return;
      }
      // Buffer the entry, then upload, then move on. Sequential to
      // bound memory and keep error reporting deterministic.
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', async () => {
        try {
          const bytes = Buffer.concat(chunks);
          const result = await objectStorageClient.uploadFromBytes(key, bytes);
          if (!result.ok) {
            return next(new Error(`Failed to upload ${key}: ${result.error}`));
          }
          restoredCount++;
          next();
        } catch (err) {
          next(err);
        }
      });
      stream.on('error', next);
      stream.resume();
    });

    extract.on('finish', () => {
      if (skippedKeys.length > 0) {
        console.log(`File-restore skipped ${skippedKeys.length} disallowed entr(ies) (e.g. backups/* or closed-year scans). Sample: ${skippedKeys.slice(0, 5).join(', ')}`);
      }
      console.log(`File-restore complete: ${restoredCount} object(s) re-uploaded`);
      resolve({ success: true, restoredCount, skippedCount: skippedKeys.length, skippedKeys });
    });

    extract.on('error', (err) => {
      console.error('File-restore failed:', err);
      resolve({ success: false, restoredCount, skippedCount: skippedKeys.length, skippedKeys, error: err.message });
    });

    createReadStream(tarGzPath)
      .on('error', (err) => resolve({ success: false, restoredCount, error: err.message }))
      .pipe(createGunzip())
      .on('error', (err) => resolve({ success: false, restoredCount, error: err.message }))
      .pipe(extract);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/restoreFiles.js <path-to-archive.tar.gz>');
    process.exit(1);
  }
  restoreFilesFromArchive(arg).then((r) => {
    console.log('File-restore result:', r);
    process.exit(r.success ? 0 : 1);
  });
}

export { restoreFilesFromArchive };
