#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';

/**
 * Validates that a readable stream starts with gzip magic bytes (0x1f 0x8b).
 *
 * Uses paused-mode reading (stream.read / 'readable' events) rather than
 * attaching a 'data' listener, which would switch the stream to flowing mode
 * and risk discarding bytes before the gunzip pipe is established.
 *
 * After validation, the 2 header bytes are unshifted back to the front of the
 * stream's internal buffer so the full byte sequence is preserved for the
 * downstream gunzip → psql pipe.
 *
 * This preflight runs BEFORE any destructive DROP, so a corrupt or wrong file
 * is rejected cleanly without touching the live database.
 *
 * @param {import('stream').Readable} stream
 * @returns {Promise<void>} Resolves if valid gzip, rejects with descriptive error if not.
 */
async function validateGzipHeader(stream) {
  // Ensure we are in paused mode. No data is discarded while paused.
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

      // read(2) pulls exactly 2 bytes from the internal buffer.
      // Returns null if fewer than 2 bytes are buffered and more data may come.
      // Returns whatever is buffered if the stream has ended (may be < 2 bytes).
      const head = stream.read(2);
      if (head === null) return; // Not enough data yet — wait for next 'readable'

      settled = true;
      cleanup();

      if (head.length < 2 || head[0] !== 0x1f || head[1] !== 0x8b) {
        const b0 = head[0] !== undefined ? `0x${head[0].toString(16).padStart(2, '0')}` : '(empty)';
        const b1 = head[1] !== undefined ? `0x${head[1].toString(16).padStart(2, '0')}` : '(empty)';
        reject(new Error(
          `Invalid file: not a valid gzip archive. ` +
          `Expected magic bytes 0x1f 0x8b, got ${b0} ${b1}. ` +
          'The database has not been modified.'
        ));
        return;
      }

      // Put the 2 bytes back at the front of the buffer so the full byte
      // sequence is available to the downstream gunzip → psql pipe.
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
      reject(new Error(
        'Empty file: stream ended before gzip header could be read. ' +
        'The database has not been modified.'
      ));
    };

    stream.on('readable', tryRead);
    stream.on('error', onError);
    stream.on('end', onEnd);

    // Attempt an immediate read in case data is already in the internal buffer.
    tryRead();
  });
}

/**
 * Restores the PostgreSQL database from a readable stream of a .sql.gz file.
 *
 * Strategy:
 *   0. Preflight: Validate gzip magic bytes (paused-mode read) before any destructive work.
 *      A corrupt or wrong file is rejected here — the database is not touched.
 *   1. Drop the public schema (all app tables) and recreate it — clears existing data.
 *   2. Pipe: sqlGzStream → gunzip → psql, loading all SQL statements from the dump.
 *
 * The `drizzle` schema (migration tracking) lives in a separate schema and is NOT affected.
 *
 * @param {import('stream').Readable} sqlGzStream - Readable stream of a gzip-compressed SQL dump
 * @returns {Promise<{ success: boolean, error?: string, durationMs: number }>}
 */
async function restoreBackup(sqlGzStream) {
  const startedAt = Date.now();

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');

    // Step 0: Preflight — validate gzip header before doing any destructive work.
    // Uses paused-mode reading; no bytes are discarded. The stream is left with
    // all original bytes intact and the 2-byte header unshifted back to the front.
    console.log('[restore] Validating gzip header...');
    await validateGzipHeader(sqlGzStream);
    console.log('[restore] Gzip header valid — proceeding with restore.');

    // Step 1: Drop and recreate the public schema to clear all existing data.
    // The drizzle schema (migrations tracking) is separate and unaffected.
    // ON_ERROR_STOP=1 ensures any SQL error immediately aborts with non-zero exit.
    console.log('[restore] Dropping public schema...');
    await runPsql(dbUrl, ['-v', 'ON_ERROR_STOP=1', '--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    console.log('[restore] Public schema cleared.');

    // Step 2: Decompress and pipe SQL into psql.
    // pipe() automatically resumes the stream from paused mode, draining all
    // buffered bytes (including the unshifted 2-byte header) in order.
    // ON_ERROR_STOP=1: any SQL error causes psql to exit non-zero → restore returns failure.
    console.log('[restore] Starting database restore from dump...');
    const psql = spawn('psql', [dbUrl, '--no-password', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const gunzip = createGunzip();

    // Pipe: sqlGzStream → gunzip → psql.stdin
    // pipe() resumes the stream; all bytes (including unshifted header) flow through.
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

    const exitCode = await new Promise((resolve) => {
      psql.on('close', resolve);
    });

    const durationMs = Date.now() - startedAt;

    if (exitCode !== 0) {
      const errSummary = stderr.slice(-2000); // last 2000 chars to avoid overflow
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
 * Run a psql command with given args. Rejects on non-zero exit code.
 * @param {string} dbUrl
 * @param {string[]} args - additional args after dbUrl (should include -v ON_ERROR_STOP=1)
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
