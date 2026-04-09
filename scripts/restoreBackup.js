#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';

/**
 * Restores the PostgreSQL database from a readable stream of a .sql.gz file.
 *
 * Strategy:
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

    // Step 1: Drop and recreate the public schema to clear all existing data.
    // The drizzle schema (migrations tracking) is separate and unaffected.
    console.log('[restore] Dropping public schema...');
    await runPsql(dbUrl, ['--command', 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;']);
    console.log('[restore] Public schema cleared.');

    // Step 2: Decompress and pipe SQL into psql
    console.log('[restore] Starting database restore from dump...');
    const psql = spawn('psql', [dbUrl, '--no-password'], {
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
 * @param {string[]} args - additional args after dbUrl
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
