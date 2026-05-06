#!/usr/bin/env node
/**
 * Task #444 — Tarball content validator.
 *
 * Picks the most recent successful backup_runs row and the most recent
 * year_archive (if any), downloads each tar.gz from object storage,
 * stream-extracts the entries and verifies:
 *   - every entry path passes the production `shouldInclude` allowlist
 *     for the rolling archive (no `backups/*` paths, no closed-year
 *     scans);
 *   - for the rolling archive: entry count == backup_runs.files_object_count
 *   - for the year archive: entry count == ops.year_archives.object_count
 *     AND every entry is under `<scope>/<year>/...` for the seal year.
 *
 * Read-only; no mutations. Memory-bounded (drains each entry stream
 * without buffering bytes — only counts and paths).
 *
 * Usage: node scripts/validateArchiveContents.js
 */
import { Client } from '@replit/object-storage';
import { createGunzip } from 'zlib';
import { extract as tarExtract } from 'tar-stream';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { shouldInclude } from './archiveFiles.js';

const objectStorageClient = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });

async function getClosedYears() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const r = await c.query(`SELECT year FROM financial_years WHERE status = 'Closed'`);
  await c.end();
  return new Set(r.rows.map(x => x.year));
}

async function downloadToTmp(storageKey) {
  const dl = await objectStorageClient.downloadAsBytes(storageKey);
  if (!dl.ok) throw new Error(`download ${storageKey}: ${dl.error}`);
  const raw = Array.isArray(dl.value) ? dl.value[0] : dl.value;
  const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const p = path.join(tmpdir(), `validate-${crypto.randomUUID()}.tar.gz`);
  await writeFile(p, bytes);
  return { path: p, size: bytes.length };
}

function listEntries(tarGzPath) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const x = tarExtract();
    x.on('entry', (header, stream, next) => {
      entries.push(header.name);
      stream.on('end', next).on('error', next).resume();
    });
    x.on('finish', () => resolve(entries));
    x.on('error', reject);
    import('fs').then(({ createReadStream }) => {
      createReadStream(tarGzPath).pipe(createGunzip()).pipe(x);
    });
  });
}

(async () => {
  const closedYears = await getClosedYears();
  console.log('[validate] closed years:', [...closedYears]);

  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const rolling = (await c.query(
    `SELECT id, files_storage_key AS key, files_object_count AS objs
     FROM backup_runs
     WHERE success = true AND files_storage_key IS NOT NULL
     ORDER BY ran_at DESC LIMIT 1`
  )).rows[0];
  const sealed = (await c.query(
    `SELECT year, storage_key AS key, object_count AS objs
     FROM ops.year_archives ORDER BY year DESC LIMIT 1`
  )).rows[0];
  await c.end();

  let pass = true;

  // -- rolling archive --------------------------------------------------
  if (!rolling) {
    console.log('[validate] no rolling archive available — skipping rolling check');
  } else {
    console.log(`[validate] rolling: backup_run #${rolling.id} key=${rolling.key} expected=${rolling.objs}`);
    let tmp;
    try {
      tmp = await downloadToTmp(rolling.key);
      const entries = await listEntries(tmp.path);
      const disallowed = entries.filter(k => !shouldInclude(k, closedYears, null));
      const ok = entries.length === rolling.objs && disallowed.length === 0;
      console.log(`[validate]   entries=${entries.length} disallowed=${disallowed.length} → ${ok ? 'PASS' : 'FAIL'}`);
      if (disallowed.length) console.log('[validate]   disallowed sample:', disallowed.slice(0, 5));
      if (!ok) pass = false;
    } finally {
      if (tmp) await unlink(tmp.path).catch(() => {});
    }
  }

  // -- sealed year archive ---------------------------------------------
  if (!sealed) {
    console.log('[validate] no sealed-year archive available — skipping seal check');
  } else {
    console.log(`[validate] sealed: year=${sealed.year} key=${sealed.key} expected=${sealed.objs}`);
    let tmp;
    try {
      tmp = await downloadToTmp(sealed.key);
      const entries = await listEntries(tmp.path);
      const wrongYear = entries.filter(k => {
        const m = k.match(/^([^/]+)\/(\d{4})\//);
        return !m || parseInt(m[2], 10) !== sealed.year;
      });
      const ok = entries.length === sealed.objs && wrongYear.length === 0;
      console.log(`[validate]   entries=${entries.length} wrong-year=${wrongYear.length} → ${ok ? 'PASS' : 'FAIL'}`);
      if (wrongYear.length) console.log('[validate]   wrong-year sample:', wrongYear.slice(0, 5));
      if (!ok) pass = false;
    } finally {
      if (tmp) await unlink(tmp.path).catch(() => {});
    }
  }

  console.log(pass ? '[validate] OVERALL: PASS' : '[validate] OVERALL: FAIL');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('[validate] exception:', e); process.exit(1); });
