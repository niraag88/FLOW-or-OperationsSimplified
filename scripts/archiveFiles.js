#!/usr/bin/env node

/**
 * Streaming file-bytes backup (Task #427).
 *
 * Walks every object in the bucket, downloads each one's bytes, packs
 * them into a single tar.gz archive, and uploads the archive to object
 * storage. Replaces writeManifest.js (which only wrote a list of
 * filenames, not the bytes themselves).
 *
 * Two modes:
 *   - Rolling backup mode (default): include logos + files in any
 *     /YEAR/ folder where YEAR is NOT in the closedYears list.
 *     Closed-year files are already permanently sealed by their own
 *     year-archives (see sealYearArchive.ts) so the rolling backup
 *     stays small year-over-year — closed years don't bloat every
 *     scheduled run. (Task #427 plan, Q3.)
 *   - onlyYear mode: include only files in /onlyYear/ folders across
 *     scan prefixes (invoices, delivery, purchase-orders,
 *     goods-receipts). No logos. Used by sealYearArchive.
 *
 * Always excludes the `backups/` prefix to prevent recursive growth
 * (each new backup including all prior backups).
 *
 * Memory profile: at most ONE object in memory at a time (the per-file
 * 5 MB upload cap defined in server/middleware.ts bounds this), so the
 * total archive can grow to many GB without exhausting the worker.
 */

import { spawn } from 'child_process';
import { createReadStream, createWriteStream, promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { pack as tarPack } from 'tar-stream';
import { Client } from '@replit/object-storage';
import crypto from 'crypto';

const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID,
});

const SCAN_PREFIXES = ['invoices', 'delivery', 'purchase-orders', 'goods-receipts'];
const BACKUPS_PREFIX = 'backups/';

/**
 * Normalise one page of objectStorageClient.list() output. Mirrors the
 * defensive shape-handling in scripts/writeManifest.js so a future SDK
 * pagination change keeps working.
 */
function normaliseListPage(value) {
  if (Array.isArray(value)) return { items: value, nextContinuationToken: null };
  if (value && typeof value === 'object' && Array.isArray(value.objects)) {
    return { items: value.objects, nextContinuationToken: value.nextContinuationToken ?? null };
  }
  let sample;
  if (value === null || value === undefined) sample = String(value);
  else if (typeof value === 'object') sample = `keys=[${Object.keys(value).slice(0, 10).join(', ')}]`;
  else sample = `${typeof value}: ${String(value).slice(0, 100)}`;
  throw new Error(
    `objectStorageClient.list() returned an unrecognised shape — expected array OR { objects, nextContinuationToken }. Got: ${sample}`
  );
}

/**
 * Decide whether a given storage key should be included in this archive.
 *
 * @param {string} key                e.g. "invoices/2025/abc.pdf" or "brand-logos/x.png"
 * @param {Set<number>} closedYears   years that have their own permanent seal
 * @param {number|null} onlyYear      when set, ONLY include /onlyYear/ scans
 * @returns {boolean}
 */
function shouldInclude(key, closedYears, onlyYear) {
  if (key.startsWith(BACKUPS_PREFIX)) return false;

  // Detect "<scope>/<YYYY>/..." paths so we can apply year-filtering.
  // Anything else (logos, root files, unknown prefixes) is treated as
  // "year-less".
  const match = key.match(/^([^/]+)\/(\d{4})\//);

  if (onlyYear != null) {
    if (!match) return false;
    if (!SCAN_PREFIXES.includes(match[1])) return false;
    return parseInt(match[2], 10) === onlyYear;
  }

  // Rolling-backup mode.
  if (match && SCAN_PREFIXES.includes(match[1])) {
    const yr = parseInt(match[2], 10);
    if (closedYears.has(yr)) return false; // already sealed permanently
  }
  return true;
}

/**
 * Build a tar.gz of every selected file in the bucket and upload it.
 *
 * @param {object}   opts
 * @param {number[]} [opts.closedYears=[]]  years to skip in rolling mode
 * @param {number}   [opts.onlyYear]        seal-only-this-year mode
 * @param {string}   [opts.storageKeyOverride]  explicit destination key
 *                                              (used by sealYearArchive
 *                                              so re-closing a year
 *                                              overwrites the same key)
 * @returns {Promise<{success, filename, storageKey, fileSize, objectCount, error?}>}
 */
async function archiveFiles(opts = {}) {
  const { closedYears: closedYearsArr = [], onlyYear = null, storageKeyOverride = null } = opts;
  const closedYears = new Set(closedYearsArr);

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
  const filename = onlyYear != null
    ? `year-${onlyYear}-files-${dateStr}-${timeStr}.tar.gz`
    : `files-${dateStr}-${timeStr}.tar.gz`;
  const storageKey = storageKeyOverride
    || (onlyYear != null
      ? `backups/years/year-${onlyYear}.tar.gz`
      : `backups/files/${filename}`);

  // Stage to a temp file so the upload can stream from disk and we get
  // a known size for the result row.
  const tempPath = path.join(tmpdir(), `archive-${crypto.randomUUID()}.tar.gz`);
  let pack;
  let writeStream;
  let objectCount = 0;
  let pipelinePromise;

  try {
    console.log(`Starting file-archive backup: ${filename}${onlyYear != null ? ` (year ${onlyYear})` : ` (skipping closed years: ${[...closedYears].join(', ') || 'none'})`}`);

    // 1. List the entire bucket (paginated for safety).
    const allObjects = [];
    let continuationToken = null;
    do {
      const listOptions = continuationToken ? { continuationToken } : {};
      const listResult = await objectStorageClient.list(listOptions);
      if (!listResult.ok) throw new Error(`Failed to list objects: ${listResult.error}`);
      const { items, nextContinuationToken } = normaliseListPage(listResult.value);
      allObjects.push(...items);
      continuationToken = nextContinuationToken;
    } while (continuationToken);

    const selected = allObjects.filter(o => shouldInclude(o.name, closedYears, onlyYear));
    console.log(`File-archive: ${selected.length} of ${allObjects.length} bucket objects selected for inclusion`);

    // 2. Build the tar.gz on disk.
    pack = tarPack();
    writeStream = createWriteStream(tempPath);
    const gzip = createGzip();

    // pipeline() resolves only when the gzip+file streams have fully
    // flushed. We MUST start it before adding entries (so back-pressure
    // works) and await it AFTER pack.finalize() to know the file is
    // safely on disk before uploading.
    pipelinePromise = pipeline(pack, gzip, writeStream);

    for (const obj of selected) {
      const key = obj.name;
      const dlResult = await objectStorageClient.downloadAsBytes(key);
      if (!dlResult.ok) {
        throw new Error(`Failed to download ${key}: ${dlResult.error}`);
      }
      // The SDK returns Buffer or [Buffer] depending on version — normalise.
      const raw = Array.isArray(dlResult.value) ? dlResult.value[0] : dlResult.value;
      const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);

      await new Promise((resolve, reject) => {
        pack.entry({ name: key, size: bytes.length }, bytes, (err) => {
          if (err) reject(err);
          else resolve(null);
        });
      });
      objectCount++;
    }

    pack.finalize();
    await pipelinePromise;

    const stat = await fsPromises.stat(tempPath);
    const fileSize = stat.size;

    // 3. Upload the archive (overwrite-safe — for year archives we
    // intentionally reuse the same key so re-closing replaces the seal).
    const uploadResult = await objectStorageClient.uploadFromFilename(storageKey, tempPath);
    if (!uploadResult.ok) {
      throw new Error(`Failed to upload file archive: ${uploadResult.error}`);
    }

    console.log(`File-archive uploaded to ${storageKey} — ${objectCount} objects, ${fileSize} bytes`);

    return {
      success: true,
      filename,
      storageKey,
      fileSize,
      objectCount,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('File-archive backup failed:', error);
    return {
      success: false,
      filename,
      storageKey,
      objectCount,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    // Best-effort temp cleanup. ENOENT is silent.
    try {
      await fsPromises.unlink(tempPath);
    } catch (cleanupErr) {
      if (cleanupErr && cleanupErr.code !== 'ENOENT') {
        console.error(`Failed to clean up temp archive ${tempPath}:`, cleanupErr);
      }
    }
  }
}

// CLI entrypoint (manual sanity-checks during development).
if (import.meta.url === `file://${process.argv[1]}`) {
  archiveFiles({})
    .then(result => {
      console.log('File-archive result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('File-archive script error:', err);
      process.exit(1);
    });
}

export { archiveFiles, shouldInclude };
