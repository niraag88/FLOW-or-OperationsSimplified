#!/usr/bin/env node

/**
 * Object-storage manifest backup (Task #325, Task #346).
 *
 * Walks every object in the bucket, records counts/sizes plus a few
 * roll-ups (per-prefix / per-extension / per-month), and uploads the
 * manifest as JSON so a future restore can verify which objects existed
 * at backup time.
 *
 * Task #346 fix: the @replit/object-storage SDK returns the object
 * listing as a flat array (`result.value` is `Array<{ name, ... }>`),
 * which is also what server/routes/system.ts has always assumed (e.g.
 * /api/storage/list-prefix and /api/ops/backup-status). The previous
 * version of this script read `result.value.objects` and
 * `result.value.nextContinuationToken`, which do not exist on that
 * array shape — `result.value.objects` was always `undefined`, the
 * `|| []` fallback then produced zero results, and the script wrote
 * an "empty but successful" manifest even against a bucket holding
 * dozens of files. We now defensively support BOTH shapes so a future
 * SDK upgrade that switches to the paginated `{ objects,
 * nextContinuationToken }` envelope keeps working, AND throw with a
 * small sample of the response on anything else so we never silently
 * miscount objects again.
 */

import { Client } from '@replit/object-storage';

// Initialize object storage client
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

/**
 * Normalise one page of objectStorageClient.list() output.
 *
 * The current SDK version returns a flat array. A future version may
 * return `{ objects, nextContinuationToken }` for pagination. Anything
 * else means the SDK contract has changed in a way we have not been
 * told about and we MUST fail loudly rather than silently produce an
 * empty manifest.
 *
 * Returns `{ items, nextContinuationToken }`.
 */
function normaliseListPage(value) {
  if (Array.isArray(value)) {
    return { items: value, nextContinuationToken: null };
  }
  if (value && typeof value === 'object' && Array.isArray(value.objects)) {
    return {
      items: value.objects,
      nextContinuationToken: value.nextContinuationToken ?? null,
    };
  }
  // Build a small, safe sample of what came back so the operator can
  // diagnose the SDK change without leaking large response bodies.
  let sample;
  if (value === null || value === undefined) {
    sample = String(value);
  } else if (typeof value === 'object') {
    sample = `keys=[${Object.keys(value).slice(0, 10).join(', ')}]`;
  } else {
    sample = `${typeof value}: ${String(value).slice(0, 100)}`;
  }
  throw new Error(
    `objectStorageClient.list() returned an unrecognised shape — expected an array OR an object with an "objects" array. Got: ${sample}`
  );
}

async function writeManifest() {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
    const filename = `manifest-${dateStr}-${timeStr}.json`;
    const storageKey = `backups/objects/${filename}`;

    console.log(`Starting object manifest backup: ${filename}`);

    // Walk the bucket. We page until the SDK stops returning a
    // continuation token; for the current array-shape SDK that is a
    // single iteration.
    const allObjects = [];
    let continuationToken = null;
    let pageCount = 0;

    do {
      const listOptions = continuationToken ? { continuationToken } : {};
      const listResult = await objectStorageClient.list(listOptions);

      if (!listResult.ok) {
        throw new Error(`Failed to list objects: ${listResult.error}`);
      }

      const { items, nextContinuationToken } = normaliseListPage(listResult.value);
      allObjects.push(...items);
      continuationToken = nextContinuationToken;
      pageCount++;

      console.log(`Retrieved ${items.length} objects (page ${pageCount}, running total ${allObjects.length})`);
    } while (continuationToken);

    // Calculate total size (size is best-effort — SDK may omit it for
    // some buckets; that matches the existing server-side list pattern).
    let totalSize = 0;
    for (const obj of allObjects) {
      totalSize += obj.size || 0;
    }

    // Create manifest with computed totals
    const manifest = {
      generatedAt: new Date().toISOString(),
      totalObjects: allObjects.length,
      totalSize,
      totals: {
        byPrefix: computePrefixTotals(allObjects),
        byExtension: computeExtensionTotals(allObjects),
        byMonth: computeMonthlyTotals(allObjects)
      },
      objects: allObjects.map(obj => ({
        name: obj.name,
        size: obj.size || 0,
        timeCreated: obj.timeCreated,
        etag: obj.etag,
        contentType: obj.contentType
      }))
    };

    console.log(`Found ${manifest.totalObjects} objects, total size: ${manifest.totalSize} bytes`);
    console.log('Breakdown by prefix:', manifest.totals.byPrefix);

    // Upload manifest
    const manifestJson = JSON.stringify(manifest, null, 2);
    const uploadResult = await objectStorageClient.uploadFromText(storageKey, manifestJson);

    if (!uploadResult.ok) {
      throw new Error(`Failed to upload manifest: ${uploadResult.error}`);
    }

    console.log(`Manifest uploaded to: ${storageKey}`);
    console.log('Manifest backup completed successfully');

    return {
      success: true,
      filename,
      storageKey,
      totalObjects: manifest.totalObjects,
      totalSize: manifest.totalSize,
      totals: manifest.totals,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Manifest backup failed:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Compute totals by prefix (e.g., scans/, backups/, etc.)
function computePrefixTotals(objects) {
  const prefixTotals = {};

  for (const obj of objects) {
    const prefix = obj.name.split('/')[0] || 'root';
    if (!prefixTotals[prefix]) {
      prefixTotals[prefix] = { count: 0, size: 0 };
    }
    prefixTotals[prefix].count++;
    prefixTotals[prefix].size += obj.size || 0;
  }

  return prefixTotals;
}

// Compute totals by file extension
function computeExtensionTotals(objects) {
  const extTotals = {};

  for (const obj of objects) {
    const parts = obj.name.split('.');
    const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'no-extension';
    if (!extTotals[ext]) {
      extTotals[ext] = { count: 0, size: 0 };
    }
    extTotals[ext].count++;
    extTotals[ext].size += obj.size || 0;
  }

  return extTotals;
}

// Compute totals by creation month
function computeMonthlyTotals(objects) {
  const monthlyTotals = {};

  for (const obj of objects) {
    if (!obj.timeCreated) continue;

    const month = obj.timeCreated.substring(0, 7); // YYYY-MM
    if (!monthlyTotals[month]) {
      monthlyTotals[month] = { count: 0, size: 0 };
    }
    monthlyTotals[month].count++;
    monthlyTotals[month].size += obj.size || 0;
  }

  return monthlyTotals;
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  writeManifest()
    .then(result => {
      console.log('Manifest backup result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Manifest backup script error:', error);
      process.exit(1);
    });
}

export { writeManifest };
