#!/usr/bin/env node

import { spawn } from 'child_process';
import { createGunzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { promises as fsp } from 'fs';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

const MIN_DECOMPRESSED_BYTES = 256;
const HEADER_SCAN_BYTES = 4096;
const PG_DUMP_MARKERS = /-- PostgreSQL database dump|^SET |^CREATE TABLE|^COPY |^CREATE SCHEMA|^ALTER TABLE/m;

/**
 * Validates the first 2 bytes of a file are gzip magic (0x1f 0x8b).
 * @param {string} path
 * @returns {Promise<void>}
 */
async function assertGzipMagic(path) {
  let fd;
  try {
    fd = await fsp.open(path, 'r');
    const buf = Buffer.alloc(2);
    const { bytesRead } = await fd.read(buf, 0, 2, 0);
    if (bytesRead < 2 || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      const b0 = bytesRead > 0 ? `0x${buf[0].toString(16).padStart(2, '0')}` : '(empty)';
      const b1 = bytesRead > 1 ? `0x${buf[1].toString(16).padStart(2, '0')}` : '(empty)';
      throw new Error(
        `Invalid file: not a valid gzip archive. Expected magic bytes 0x1f 0x8b, got ${b0} ${b1}. The database has not been modified.`
      );
    }
  } finally {
    if (fd) await fd.close().catch(() => {});
  }
}

/**
 * Confirms the decompressed SQL file looks like a real PostgreSQL dump.
 * Catches "valid gzip containing garbage" and "tiny dump" cases.
 * @param {string} sqlPath
 */
async function assertLooksLikePgDump(sqlPath) {
  const stat = await fsp.stat(sqlPath);
  if (stat.size < MIN_DECOMPRESSED_BYTES) {
    throw new Error(
      `Decompressed SQL is too small (${stat.size} bytes). The file does not appear to be a valid PostgreSQL dump. The database has not been modified.`
    );
  }

  let fd;
  try {
    fd = await fsp.open(sqlPath, 'r');
    const buf = Buffer.alloc(HEADER_SCAN_BYTES);
    const { bytesRead } = await fd.read(buf, 0, HEADER_SCAN_BYTES, 0);
    const head = buf.slice(0, bytesRead).toString('utf8');
    if (!PG_DUMP_MARKERS.test(head)) {
      throw new Error(
        'Decompressed file does not contain expected PostgreSQL dump markers (e.g. "-- PostgreSQL database dump", SET, CREATE TABLE, or COPY). The database has not been modified.'
      );
    }
  } finally {
    if (fd) await fd.close().catch(() => {});
  }
}

/**
 * Restores the PostgreSQL database from a .sql.gz source.
 *
 * Safety contract:
 *   1. Stages the input (stream or file path) to a temp .sql.gz on disk.
 *   2. Validates gzip magic bytes from the staged file.
 *   3. Fully decompresses to a temp .sql file BEFORE any DB action.
 *      Truncated / corrupted gzip bodies are caught here.
 *   4. Confirms the decompressed file looks like a pg_dump output.
 *   5. Runs `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` plus the dump
 *      contents inside ONE psql `--single-transaction` invocation with
 *      `ON_ERROR_STOP=on`. Any failure rolls back; live data stays intact.
 *
 * The `ops` schema (restore history) is NEVER touched — it lives outside
 * the dump (pg_dump uses `--exclude-schema=ops`) so DROP/CREATE here cannot
 * affect it, and that is what allows restore_runs to survive every restore.
 *
 * Both `public` AND `drizzle` are dropped before the dump replays. The dump
 * fully recreates `drizzle.__drizzle_migrations` (schema, table, sequence,
 * data) so the post-restore migration tracking state matches the backup's
 * point-in-time — which is the only consistent answer. Without dropping
 * `drizzle`, old backups (which include `CREATE SCHEMA drizzle;` without
 * `IF NOT EXISTS`) would abort the transaction on first replay.
 *
 * @param {import('stream').Readable | string} input
 *   A readable stream of `.sql.gz` content, or a path to an existing
 *   `.sql.gz` file. When a path is supplied the caller owns its cleanup;
 *   only files this function creates are removed in `finally`.
 * @returns {Promise<{ success: boolean, error?: string, durationMs: number }>}
 */
async function restoreBackup(input) {
  const startedAt = Date.now();
  const id = randomBytes(8).toString('hex');
  const dir = tmpdir();

  let stagedGzPath = null;
  let stagedByUs = false;
  const decompressedPath = join(dir, `restore-decompressed-${id}.sql`);

  const cleanup = async () => {
    const toRemove = [decompressedPath];
    if (stagedByUs && stagedGzPath) toRemove.push(stagedGzPath);
    for (const p of toRemove) {
      try {
        await fsp.unlink(p);
      } catch (err) {
        if (err && err.code !== 'ENOENT') {
          console.warn('[restore] Failed to remove temp file:', p, err.message);
        }
      }
    }
  };

  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');

    // Step 1: stage the input to disk so we can re-read and inspect it.
    if (typeof input === 'string') {
      stagedGzPath = input;
      stagedByUs = false;
    } else {
      stagedGzPath = join(dir, `restore-staged-${id}.sql.gz`);
      stagedByUs = true;
      console.log('[restore] Staging input stream to', stagedGzPath);
      await pipeline(input, createWriteStream(stagedGzPath));
    }

    // Step 2: gzip magic byte check.
    console.log('[restore] Validating gzip header...');
    await assertGzipMagic(stagedGzPath);

    // Step 3: fully decompress to a temp .sql file.
    // If the gzip body is truncated or corrupted, this rejects here —
    // BEFORE any destructive DB action.
    console.log('[restore] Decompressing to', decompressedPath);
    try {
      await pipeline(
        createReadStream(stagedGzPath),
        createGunzip(),
        createWriteStream(decompressedPath),
      );
    } catch (gunzipErr) {
      throw new Error(
        `Failed to decompress backup (${gunzipErr.message}). The file appears truncated or corrupted. The database has not been modified.`
      );
    }

    // Step 4: sanity-check decompressed content.
    await assertLooksLikePgDump(decompressedPath);
    console.log('[restore] Decompressed SQL passed validation. Proceeding to transactional restore.');

    // Step 5: single-transaction DROP + CREATE + restore.
    // psql `--single-transaction` wraps everything sent on stdin in one BEGIN/COMMIT,
    // and `ON_ERROR_STOP=on` aborts the transaction on the first SQL error so the
    // ROLLBACK leaves live data unchanged.
    await runTransactionalRestore(dbUrl, decompressedPath);

    const durationMs = Date.now() - startedAt;
    console.log(`[restore] Database restore completed successfully in ${durationMs}ms`);
    return { success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.error('[restore] Database restore failed:', error.message);
    return { success: false, error: error.message, durationMs };
  } finally {
    await cleanup();
  }
}

/**
 * Runs psql with `--single-transaction` and feeds it `DROP SCHEMA public; CREATE SCHEMA public;`
 * followed by the decompressed dump file via stdin. Any SQL error rolls back the
 * entire transaction so the live `public` schema is unchanged on failure.
 *
 * @param {string} dbUrl
 * @param {string} sqlFilePath  Path to the validated, decompressed SQL dump.
 */
async function runTransactionalRestore(dbUrl, sqlFilePath) {
  return new Promise((resolve, reject) => {
    const psql = spawn(
      'psql',
      [
        dbUrl,
        '--no-password',
        '--single-transaction',
        '-v', 'ON_ERROR_STOP=1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let stderr = '';
    let stdout = '';
    psql.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    psql.stdout.on('data', (chunk) => { stdout += chunk.toString(); });

    let psqlExited = false;
    psql.on('error', (err) => {
      if (psqlExited) return;
      psqlExited = true;
      reject(new Error(`Failed to spawn psql: ${err.message}`));
    });

    psql.on('close', (code) => {
      if (psqlExited) return;
      psqlExited = true;
      if (code !== 0) {
        const errSummary = (stderr || stdout || '').slice(-2000);
        return reject(new Error(
          `psql restore failed (exit ${code}). Transaction was rolled back, live database is unchanged. ${errSummary}`
        ));
      }
      resolve();
    });

    // Quietly absorb stdin errors (e.g. EPIPE if psql exits early while we are
    // still writing). The real failure surfaces via the non-zero exit code and
    // captured stderr above, so we don't want a stray EPIPE to crash the
    // process or pollute logs.
    psql.stdin.on('error', (err) => {
      const code = (err && err.code) || '';
      if (code !== 'EPIPE' && code !== 'ERR_STREAM_DESTROYED') {
        console.warn('[restore] psql stdin error:', err.message);
      }
    });

    // Write DROP/CREATE preamble, then stream the decompressed dump.
    // Both `public` and `drizzle` are dropped here; the dump recreates both.
    // `ops` is excluded from the dump and lives in its own schema, so it is
    // never affected by these statements.
    psql.stdin.write(
      'DROP SCHEMA IF EXISTS public CASCADE;\n' +
      'DROP SCHEMA IF EXISTS drizzle CASCADE;\n' +
      'CREATE SCHEMA public;\n'
    );

    const sqlStream = createReadStream(sqlFilePath);
    sqlStream.on('error', (err) => {
      try { psql.stdin.destroy(err); } catch (_) {}
    });
    sqlStream.pipe(psql.stdin);
  });
}

// CLI mode for ad-hoc testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: node scripts/restoreBackup.js <path-to-dump.sql.gz>');
    process.exit(1);
  }
  const result = await restoreBackup(filePath);
  console.log('Restore result:', result);
  process.exit(result.success ? 0 : 1);
}

export { restoreBackup };
