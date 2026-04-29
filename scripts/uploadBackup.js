#!/usr/bin/env node

import { spawn } from 'child_process';
import { once } from 'events';
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip } from 'zlib';
import { Client } from '@replit/object-storage';

// Initialize object storage client
const objectStorageClient = new Client({
  bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID
});

async function uploadBackup() {
  // Function-scoped so catch/finally can see it. Stays null until pg_dump
  // has been spawned and we are about to open the write stream — so the
  // finally block can distinguish "no file ever created" (null) from "file
  // may exist on disk" (string).
  let tempPath = null;

  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
    const filename = `db-${dateStr}-${timeStr}.sql.gz`;
    const storageKey = `backups/db/${filename}`;

    console.log(`Starting database backup: ${filename}`);

    // Run pg_dump and pipe to gzip.
    // --exclude-schema=ops: the ops schema holds restore_runs which must survive
    // restores; including it in the dump would cause restores to overwrite it,
    // defeating the purpose of placing it in a separate schema.
    // --exclude-schema=drizzle: migration tracking lives outside the business
    // dataset and must remain untouched across restore. Without this flag the
    // dump includes `CREATE SCHEMA drizzle;` plus `__drizzle_migrations` which
    // collide with the live schema during a transactional restore. (For older
    // backups already in storage that still contain drizzle, the restore script
    // strips drizzle-targeting statements on the fly — see scripts/restoreBackup.js.)
    const pgDump = spawn('pg_dump', [
      process.env.DATABASE_URL,
      '--no-owner',
      '--no-privileges',
      '--exclude-schema=ops',
      '--exclude-schema=drizzle',
    ], {
      stdio: ['ignore', 'pipe', 'inherit']
    });

    const gzip = createGzip();

    // Assign tempPath immediately before opening the write stream — from
    // this line on, the finally block must clean the file up if anything
    // throws.
    const fs = await import('fs');
    tempPath = `/tmp/${filename}`;
    const writeStream = fs.createWriteStream(tempPath);

    // Register the close listener BEFORE the pipeline starts so we cannot
    // miss the 'close' event if pg_dump exits before the gzip/file stream
    // finishes flushing. once() returns a single-resolution promise and
    // automatically removes the listener after firing.
    const pgDumpClosed = once(pgDump, 'close');

    // Pipeline: pg_dump stdout -> gzip -> temp file.
    // pipeline() resolves when stdout closes, but that is not the same as
    // pg_dump exiting successfully. We check the exit code below.
    await pipeline(pgDump.stdout, gzip, writeStream);

    // Await the close event (already guaranteed to fire — listener was
    // registered before the pipeline). Destructure [code, signal] from once().
    const [pgDumpExitCode, pgDumpSignal] = await pgDumpClosed;
    if (pgDumpExitCode !== 0) {
      throw new Error(
        `pg_dump exited with code ${pgDumpExitCode}` +
        (pgDumpSignal ? ` (signal: ${pgDumpSignal})` : '') +
        ' — dump may be partial or corrupt'
      );
    }

    console.log(`Database dump created: ${tempPath}`);

    // Get file size before upload
    const stat = await fs.promises.stat(tempPath);
    const fileSize = stat.size;

    // Upload to object storage
    const uploadResult = await objectStorageClient.uploadFromFilename(storageKey, tempPath);

    if (!uploadResult.ok) {
      throw new Error(`Failed to upload backup: ${uploadResult.error}`);
    }

    console.log(`Backup uploaded to: ${storageKey} (${fileSize} bytes)`);
    console.log('Database backup completed successfully');

    return {
      success: true,
      filename,
      storageKey,
      fileSize,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Database backup failed:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  } finally {
    // Best-effort temp cleanup on both success and failure. ENOENT is
    // silent; other unlink errors are logged but never mutate the
    // function's return value, so the original backup error remains
    // visible to the caller.
    if (tempPath) {
      try {
        const fs = await import('fs');
        await fs.promises.unlink(tempPath);
      } catch (cleanupErr) {
        if (cleanupErr && cleanupErr.code !== 'ENOENT') {
          console.error(
            `Failed to clean up temp backup file ${tempPath}:`,
            cleanupErr
          );
        }
      }
    }
  }
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  uploadBackup()
    .then(result => {
      console.log('Database backup result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Database backup script error:', error);
      process.exit(1);
    });
}

export { uploadBackup };