#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';

/**
 * Validates that a readable stream starts with gzip magic bytes (0x1f 0x8b).
 * Reads the first chunk, checks the header, then pushes it back so the stream
 * is still fully readable by the caller.
 *
 * This preflight runs BEFORE any destructive DROP, so a corrupt or wrong file
 * is rejected cleanly without touching the live database.
 *
 * @param {import('stream').Readable} stream
 * @returns {Promise<void>} Resolves if valid gzip, rejects with a descriptive error if not.
 */
async function validateGzipHeader(stream) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const onData = (chunk) => {
      if (settled) return;
      settled = true;
      stream.removeListener('data', onData);
      stream.removeListener('error', onError);

      if (chunk.length < 2 || chunk[0] !== 0x1f || chunk[1] !== 0x8b) {
        const b0 = chunk[0] !== undefined ? `0x${chunk[0].toString(16).padStart(2, '0')}` : '(empty)';
        const b1 = chunk[1] !== undefined ? `0x${chunk[1].toString(16).padStart(2, '0')}` : '(empty)';
        reject(new Error(
          `Invalid file: not a valid gzip archive. Expected magic bytes 0x1f 0x8b, got ${b0} ${b1}. ` +
          'The database has not been modified.'
        ));
        return;
      }

      // Push the chunk back so the full stream is still readable downstream.
      stream.unshift(chunk);
      resolve();
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      stream.removeListener('data', onData);
      reject(err);
    };

    stream.once('data', onData);
    stream.once('error', onError);
  });
}

/**
 * Restores the PostgreSQL database from a readable stream of a .sql.gz file.
 *
 * Strategy:
 *   0. Preflight: Validate gzip magic bytes before any destructive work.
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
    // A corrupt, truncated, or wrong file will be rejected here; the DB is untouched.
    console.log('[restore] Validating gzip header...');
    await validateGzipHeader(sqlGzStream);
    console.log('[restore] Gzip header valid — proceeding with restore.');

    // Step 1: Drop and recreate the public schema to clear all existing data.
    // The drizzle schema (migrations tracking) is separate and unaffected.
    // ON_ERROR_STOP=1 ensures any SQL error immediately aborts with non-zero exit.
    console.log('[restore] Dropping public schema...');
    await runPsql(dbUrl, ['-v', 'ON_ERROR_STOP=1', '--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    console.log('[restore] Public schema cleared.');

    // Step 2: Decompress and pipe SQL into psql
    // ON_ERROR_STOP=1: any SQL error causes psql to exit non-zero → restore returns failure.
    console.log('[restore] Starting database restore from dump...');
    const psql = spawn('psql', [dbUrl, '--no-password', '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const gunzip = createGunzip();

    // Pipe: sqlGzStream → gunzip → psql.stdin
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
