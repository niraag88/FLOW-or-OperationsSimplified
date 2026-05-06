#!/usr/bin/env node
/**
 * Task #444 — Round-trip restore validator.
 *
 * Drives the live server through:
 *   1. Snapshot key table counts (financial_years, ops.year_archives,
 *      users, customers, invoices).
 *   2. POST /api/ops/run-backups (manual backup, awaits result).
 *   3. POST /api/ops/backup-runs/:id/restore against the run we just
 *      created (typed RESTORE_PHRASE confirmation).
 *   4. Re-snapshot the same counts and diff.
 *
 * Run against a dev environment only — the restore step wipes & reloads
 * the public schema. The expected outcome is "no diff": after restoring
 * the backup we just took, every captured count must equal its pre value.
 *
 * Usage:
 *   node scripts/roundTripRestoreTest.js [baseUrl]
 *   ADMIN_USERNAME / ADMIN_PASSWORD must be set in env.
 */
import pg from 'pg';

const BASE = (process.argv[2] || 'http://localhost:5000').replace(/\/$/, '');
const USER = process.env.ADMIN_USERNAME || 'admin';
const PASS = process.env.ADMIN_PASSWORD;
if (!PASS) { console.error('ADMIN_PASSWORD env var required'); process.exit(2); }

const COUNT_QUERIES = {
  financial_years: 'SELECT COUNT(*)::int AS n FROM financial_years',
  year_archives:   'SELECT COUNT(*)::int AS n FROM ops.year_archives',
  users:           'SELECT COUNT(*)::int AS n FROM users',
  customers:       'SELECT COUNT(*)::int AS n FROM customers',
  invoices:        'SELECT COUNT(*)::int AS n FROM invoices',
};

async function snapshot() {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const out = {};
  for (const [k, q] of Object.entries(COUNT_QUERIES)) {
    try { out[k] = (await c.query(q)).rows[0].n; }
    catch (e) { out[k] = `ERR:${e.code || e.message}`; }
  }
  await c.end();
  return out;
}

class Session {
  constructor() { this.cookies = new Map(); this.csrf = null; }
  saveCookies(setCookieHeaders) {
    if (!setCookieHeaders) return;
    const arr = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
    for (const sc of arr) {
      const [pair] = sc.split(';');
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  async req(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    if (this.csrf && method !== 'GET') headers['X-CSRF-Token'] = this.csrf;
    const res = await fetch(BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual',
    });
    this.saveCookies(res.headers.getSetCookie?.() || res.headers.raw?.()['set-cookie']);
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch {}
    return { status: res.status, json, text };
  }
  async login() {
    const r = await this.req('POST', '/api/auth/login', { username: USER, password: PASS });
    if (r.status !== 200) throw new Error(`login failed ${r.status} ${r.text}`);
    const t = await this.req('GET', '/api/auth/csrf-token');
    if (t.status !== 200) throw new Error(`csrf-token failed ${t.status} ${t.text}`);
    this.csrf = t.json.csrfToken;
  }
}

function diff(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (a[k] !== b[k]) out[k] = { before: a[k], after: b[k] };
  }
  return out;
}

(async () => {
  console.log(`[round-trip] target=${BASE} user=${USER}`);
  const before = await snapshot();
  console.log('[round-trip] before:', before);

  const s = new Session();
  await s.login();
  console.log('[round-trip] logged in');

  const run = await s.req('POST', '/api/ops/run-backups');
  if (run.status !== 200 || !run.json?.success) {
    console.error('[round-trip] backup failed:', run.status, run.text);
    process.exit(1);
  }
  // Task #444: route now returns backupRunId so we restore EXACTLY the
  // run we just created — no risk of racing another concurrent backup.
  const runId = run.json?.backupRunId;
  if (!runId) {
    console.error('[round-trip] backup response missing backupRunId — server out of date?');
    process.exit(1);
  }
  console.log(`[round-trip] backup run #${runId} succeeded (db=${run.json?.dbBackup?.fileSize}B files=${run.json?.filesBackup?.fileSize}B)`);

  const restore = await s.req('POST', `/api/ops/backup-runs/${runId}/restore`, {
    confirmation: 'EMERGENCY RESTORE',
    acceptDataLoss: false,
  });
  if (restore.status !== 200) {
    console.error('[round-trip] restore failed:', restore.status, restore.text);
    process.exit(1);
  }
  console.log('[round-trip] restore returned 200; reconcile:', restore.json?.reconcileStatus || 'n/a');

  // Wait briefly for the destructive lock to release & sessions table to settle.
  await new Promise(r => setTimeout(r, 2000));
  const after = await snapshot();
  console.log('[round-trip] after:', after);

  const d = diff(before, after);
  // The backup run we just took is itself part of the snapshot, so
  // backup_runs counts can legitimately differ — but the tables we
  // check don't include backup_runs, so any diff is a real failure.
  if (Object.keys(d).length === 0) {
    console.log('[round-trip] PASS — every checked count is identical pre/post');
    process.exit(0);
  } else {
    console.error('[round-trip] FAIL — diffs:', d);
    process.exit(1);
  }
})().catch(e => { console.error('[round-trip] exception:', e); process.exit(1); });
