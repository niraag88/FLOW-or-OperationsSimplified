#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';

/**
 * Validates the first 2 bytes of a stream are gzip magic bytes (0x1f 0x8b).
 * Uses paused-mode reading so no data is discarded. After validation, the
 * 2 bytes are unshifted back so the full stream is intact for downstream piping.
 * Runs BEFORE any destructive DROP SCHEMA — a bad file is rejected cleanly.
 * @param {import('stream').Readable} stream
 * @returns {Promise<void>}
 */
function validateGzipHeader(stream) {
  stream.pause();

  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      stream.removeListener('readable', tryRead);
      stream.removeListener('error', onError);
      stream.removeListener('end', onEnd);
    };

    const tryRead = () => {
      if (settled) return;
      const head = stream.read(2);
      if (head === null) return;
      settled = true;
      cleanup();

      if (head.length < 2 || head[0] !== 0x1f || head[1] !== 0x8b) {
        const b0 = head[0] !== undefined ? `0x${head[0].toString(16).padStart(2, '0')}` : '(empty)';
        const b1 = head[1] !== undefined ? `0x${head[1].toString(16).padStart(2, '0')}` : '(empty)';
        reject(new Error(
          `Invalid file: not a valid gzip archive. Expected magic bytes 0x1f 0x8b, got ${b0} ${b1}. The database has not been modified.`
        ));
        return;
      }

      stream.unshift(head);
      resolve();
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Empty file: stream ended before gzip header could be read. The database has not been modified.'));
    };

    stream.on('readable', tryRead);
    stream.on('error', onError);
    stream.on('end', onEnd);
    tryRead();
  });
}

/**
 * Restores the PostgreSQL database from a readable stream of a .sql.gz file.
 *
 * Preflight: validates gzip magic bytes in paused-mode before DROP SCHEMA,
 * so a wrong or empty file is rejected without touching the database.
 * Corruption/truncation during actual decompression fails the restore after DROP,
 * with the error surfaced to the caller via the returned result object.
 *
 * The `drizzle` schema (migration tracking) is in a separate schema and is
 * NOT affected by DROP SCHEMA public CASCADE.
 *
 * @param {import('stream').Readable} sqlGzStream
 * @returns {Promise<{ success: boolean, error?: string, durationMs: number }>}
 */
async function restoreBackup(sqlGzStream) {
  const startedAt = Date.now();

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');

    console.log('[restore] Validating gzip header...');
    await validateGzipHeader(sqlGzStream);
    console.log('[restore] Gzip header valid — proceeding with restore.');

    console.log('[restore] Dropping public schema...');
    await runPsql(dbUrl, ['-v', 'ON_ERROR_STOP=1', '--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    console.log('[restore] Public schema cleared.');

    console.log('[restore] Starting database restore from dump...');
    const psql = spawn('psql', [dbUrl, '--no-password', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const gunzip = createGunzip();
    sqlGzStream.pipe(gunzip).pipe(psql.stdin);

    let stderr = '';
    let stdout = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    gunzip.on('error', (err) => {
      console.error('[restore] Gunzip error:', err.message);
      psql.stdin.destroy(err);
    });

    sqlGzStream.on('error', (err) => {
      console.error('[restore] Stream error:', err.message);
      gunzip.destroy(err);
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
