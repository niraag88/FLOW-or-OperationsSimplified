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
  // tempPath is assigned only AFTER pg_dump has been spawned and the write
  // stream has been opened, so the finally block at the bottom of the
  // function can distinguish "no file ever created" (tempPath === null,
  // nothing to clean up) from "file created and may need cleanup" (tempPath
  // is a string). Declared with let at function scope so catch/finally can
  // see it.
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

    // Create write stream to temp file. pg_dump has been spawned; once we
    // open the write stream we own the temp file and the finally block must
    // be able to clean it up if anything below throws.
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
    // Best-effort cleanup of the temp dump file. Runs on BOTH success and
    // failure so a failed upload (or any post-spawn error) cannot leave a
    // /tmp/db-*.sql.gz behind to fill the disk on retries.
    //  - If tempPath is null, pg_dump never reached the point where the
    //    write stream was opened — nothing to remove.
    //  - ENOENT means the file was never written or already removed; treat
    //    as success and stay silent.
    //  - Any other unlink error is logged but does NOT mutate the
    //    function's return value: the original backup error (if any) must
    //    remain the visible failure to the caller.
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