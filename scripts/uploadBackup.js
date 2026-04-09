#!/usr/bin/env node

import { spawn } from 'child_process';
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

    // Run pg_dump and pipe to gzip
    const pgDump = spawn('pg_dump', [process.env.DATABASE_URL, '--no-owner', '--no-privileges'], {
      stdio: ['ignore', 'pipe', 'inherit']
    });

    const gzip = createGzip();

    // Create write stream to temp file
    const fs = await import('fs');
    const writeStream = fs.createWriteStream(tempPath);

    // Pipeline: pg_dump -> gzip -> file
    await pipeline(pgDump.stdout, gzip, writeStream);

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