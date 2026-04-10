#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';

/**
 * Collects all chunks from a readable stream into a single Buffer.
 * @param {import('stream').Readable} stream
 * @returns {Promise<Buffer>}
 */
function bufferStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Validates a Buffer is a complete, decompressible gzip archive.
 * Checks magic bytes, then does a dry-run gunzip to /dev/null so truncated
 * or corrupt archives are caught BEFORE the destructive DROP SCHEMA.
 * @param {Buffer} buf
 * @returns {Promise<void>}
 */
function validateGzip(buf) {
  if (buf.length < 2) {
    return Promise.reject(new Error('Empty file: not a valid gzip archive. The database has not been modified.'));
  }
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) {
    const b0 = `0x${buf[0].toString(16).padStart(2, '0')}`;
    const b1 = `0x${buf[1].toString(16).padStart(2, '0')}`;
    return Promise.reject(new Error(
      `Invalid file: not a valid gzip archive. Expected magic bytes 0x1f 0x8b, got ${b0} ${b1}. The database has not been modified.`
    ));
  }

  return new Promise((resolve, reject) => {
    const gunzip = createGunzip();
    let settled = false;
    gunzip.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Corrupt gzip archive: ${err.message}. The database has not been modified.`));
    });
    gunzip.on('finish', () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    Readable.from(buf).pipe(gunzip);
    gunzip.resume(); // drain output to /dev/null; errors still propagate
  });
}

/**
 * Restores the PostgreSQL database from a readable stream of a .sql.gz file.
 *
 * Preflight: buffers the stream, validates magic bytes, and performs a full
 * dry-run gunzip decompression before issuing DROP SCHEMA. A corrupt,
 * truncated, or non-gzip file is rejected without touching the live database.
 *
 * @param {import('stream').Readable} sqlGzStream
 * @returns {Promise<{ success: boolean, error?: string, durationMs: number }>}
 */
async function restoreBackup(sqlGzStream) {
  const startedAt = Date.now();

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');

    // Buffer the entire compressed file so we can validate before DROP.
    console.log('[restore] Buffering upload...');
    const buf = await bufferStream(sqlGzStream);
    console.log(`[restore] Buffered ${buf.length} bytes. Validating gzip integrity...`);

    // Full gzip validation: magic bytes + complete dry-run decompression.
    // No DROP issued until this passes.
    await validateGzip(buf);
    console.log('[restore] Gzip validation passed — proceeding with restore.');

    // Drop and recreate public schema (drizzle schema is separate and unaffected).
    console.log('[restore] Dropping public schema...');
    await runPsql(dbUrl, ['-v', 'ON_ERROR_STOP=1', '--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    console.log('[restore] Public schema cleared.');

    // Stream the validated buffer through gunzip into psql.
    console.log('[restore] Starting database restore from dump...');
    const psql = spawn('psql', [dbUrl, '--no-password', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const gunzip = createGunzip();
    Readable.from(buf).pipe(gunzip).pipe(psql.stdin);

    let stderr = '';
    let stdout = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    gunzip.on('error', (err) => {
      console.error('[restore] Gunzip error:', err.message);
      psql.stdin.destroy(err);
    });

    const exitCode = await new Promise((resolve) => { psql.on('close', resolve); });
    const durationMs = Date.now() - startedAt;

    if (exitCode !== 0) {
      const errSummary = stderr.slice(-2000);
      console.error(`[restore] psql exited with code ${exitCode}. stderr: ${errSummary}`);
      throw new Error(`psql failed (exit ${exitCode}): ${errSummary}`);
    }

    console.log(`[restore] Database restore completed successfully in ${durationMs}ms`);
    if (stdout) console.log('[restore] psql output:', stdout.slice(-500));

    return { success: true, durationMs };

  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error('[restore] Database restore failed:', error.message);
    return { success: false, error: error.message, durationMs };
  }
}

/**
 * Run a psql command with given args. Rejects on non-zero exit.
 * @param {string} dbUrl
 * @param {string[]} args
 */
function runPsql(dbUrl, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('psql', [dbUrl, '--no-password', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`psql command failed (exit ${code}): ${stderr}`));
      else resolve();
    });
  });
}

// Run directly for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createReadStream } = await import('fs');
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/restoreBackup.js <path-to-dump.sql.gz>');
    process.exit(1);
  }
  const stream = createReadStream(filePath);
  const result = await restoreBackup(stream);
  console.log('Restore result:', result);
  process.exit(result.success ? 0 : 1);
}

export { restoreBackup };
