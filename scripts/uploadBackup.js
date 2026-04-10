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
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = now.toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
    const filename = `db-${dateStr}-${timeStr}.sql.gz`;
    const tempPath = `/tmp/${filename}`;
    const storageKey = `backups/db/${filename}`;

    console.log(`Starting database backup: ${filename}`);

    // Run pg_dump and pipe to gzip.
    // --exclude-schema=ops: the ops schema holds restore_runs which must survive
    // restores; including it in the dump would cause restores to overwrite it,
    // defeating the purpose of placing it in a separate schema.
    const pgDump = spawn('pg_dump', [
      process.env.DATABASE_URL,
      '--no-owner',
      '--no-privileges',
      '--exclude-schema=ops',
    ], {
      stdio: ['ignore', 'pipe', 'inherit']
    });

    const gzip = createGzip();

    // Create write stream to temp file
    const fs = await import('fs');
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

    // Clean up temp file
    await fs.promises.unlink(tempPath);
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