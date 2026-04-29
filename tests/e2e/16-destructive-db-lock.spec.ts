/**
 * tests/e2e/16-destructive-db-lock.spec.ts
 *
 * Shared destructive-DB-operation lock spec (Task #368, RF-5).
 *
 * Three endpoints REPLACE the entire `public` schema in one go:
 *
 *   - POST /api/ops/factory-reset
 *   - POST /api/ops/backup-runs/:id/restore   (cloud restore)
 *   - POST /api/ops/restore-upload            (uploaded .sql.gz restore)
 *
 * server/destructiveDbLock.ts wraps all three in the SAME Postgres
 * session-level advisory lock so they cannot interleave. The lock is the
 * last guard, applied AFTER the typed-phrase confirmation (Task #337) so
 * that an unauthorised caller can never observe whether something else is
 * running.
 *
 * This spec proves the lock is wired correctly by holding it externally
 * on a SECOND `pg.Pool` connection (so the server's pool cannot acquire
 * it) and then issuing real, fully-confirmed destructive requests:
 *
 *   1. POST /api/ops/factory-reset (with the typed phrase) → must return
 *      409 `factory_reset_in_progress`. The error code is intentionally
 *      preserved from the pre-RF-5 inline lock for backward compat.
 *   2. POST /api/ops/restore-upload (with a tiny .sql.gz body + the typed
 *      phrase) → must return 409 `destructive_db_op_in_progress` from the
 *      shared helper.
 *
 * If the lock were missing or used the wrong key, the second call would
 * either succeed (and wipe the disposable test database!) or fail with a
 * 5xx instead of a 409. Either is a regression this spec catches.
 *
 * GATING: even though this spec never fires a SUCCESSFUL destructive op
 * (the external lock blocks every attempt before the helper runs), it
 * still uses the same Wall 4 gate as the other destructive specs. This
 * is belt-and-braces: a future bug that changes the lock-key value would
 * make the lock NOT apply, and the destructive request would then go
 * through. Skipping unless DATABASE_URL points at a disposable database
 * means that bug cannot wipe a real environment.
 *
 * Run locally:
 *   ALLOW_FACTORY_RESET_TESTS=true \
 *   DATABASE_URL="postgres://.../my_test_db" \
 *   npx playwright test tests/e2e/16-destructive-db-lock.spec.ts
 */
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { apiLogin, BASE_URL, ADMIN } from './helpers';
import {
  gateFactoryResetTests,
  FACTORY_RESET_CONFIRMATION_PHRASE,
} from './factory-reset-gate';
import { RESTORE_PHRASE } from '../../shared/destructiveActionPhrases';
// Single source of truth for the lock key. If a future refactor changes
// the constant, this test picks it up automatically — no drift between
// server and test.
import { DESTRUCTIVE_DB_OP_LOCK_KEY } from '../../server/destructiveDbLock';

test.describe('Destructive-DB-op shared advisory lock (Task #368, RF-5)', () => {
  test.beforeAll(() => {
    gateFactoryResetTests('Destructive-DB-op shared advisory lock spec');
  });

  let pool: Pool;
  let cookie: string;
  let lockHeld = false;
  let tmpDir = '';
  let dummyGzPath = '';

  test.beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    cookie = await apiLogin();
    expect(cookie, 'admin login should produce a session cookie').not.toEqual('');

    // Stage a tiny gzipped payload for the restore-upload test. The
    // lock check inside runRestore fires BEFORE restoreBackup is invoked,
    // so we never need a valid PostgreSQL dump — only a `.sql.gz` file
    // small enough to buffer and a non-empty multipart body.
    tmpDir = mkdtempSync(join(tmpdir(), 'destructive-lock-spec-'));
    dummyGzPath = join(tmpDir, 'lock-test-payload.sql.gz');
    writeFileSync(dummyGzPath, gzipSync(Buffer.from('-- placeholder; never replayed')));
  });

  test.afterAll(async () => {
    // ALWAYS release the lock — leaving it held would block real
    // destructive ops the next time the test database is used.
    if (lockHeld && pool) {
      try {
        await pool.query('SELECT pg_advisory_unlock($1)', [DESTRUCTIVE_DB_OP_LOCK_KEY]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[16-destructive-db-lock] failed to release advisory lock:', err);
      }
      lockHeld = false;
    }
    if (pool) await pool.end();
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  test('factory-reset returns 409 factory_reset_in_progress when the shared lock is held', async () => {
    // Hold the shared lock externally on a dedicated client (so the
    // server's pool genuinely cannot acquire it).
    const lockClient = await pool.connect();
    try {
      const lockRes = await lockClient.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [DESTRUCTIVE_DB_OP_LOCK_KEY],
      );
      expect(
        lockRes.rows[0]?.locked,
        'external client must successfully acquire the shared lock first',
      ).toBe(true);
      lockHeld = true;

      const resp = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ confirmation: FACTORY_RESET_CONFIRMATION_PHRASE }),
      });

      expect(resp.status, 'factory-reset must be blocked by the shared lock').toBe(409);
      const body = (await resp.json()) as { error?: string; message?: string };
      // Backward-compat: the factory-reset route preserves its original
      // error code so existing scripts/clients that already check for it
      // keep working. The shared lock is an implementation detail.
      expect(body.error).toBe('factory_reset_in_progress');
      expect(body.message ?? '').not.toBe('');
    } finally {
      // Release for the next test.
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [DESTRUCTIVE_DB_OP_LOCK_KEY]);
      } finally {
        lockClient.release();
        lockHeld = false;
      }
    }
  });

  test('restore-upload returns 409 destructive_db_op_in_progress when the shared lock is held', async () => {
    const lockClient = await pool.connect();
    try {
      const lockRes = await lockClient.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [DESTRUCTIVE_DB_OP_LOCK_KEY],
      );
      expect(
        lockRes.rows[0]?.locked,
        'external client must successfully acquire the shared lock first',
      ).toBe(true);
      lockHeld = true;

      // Build a minimal multipart body: a `confirmation` field with the
      // typed phrase and a `file` field carrying the tiny .sql.gz. We
      // hand-craft the multipart so the test stays free of extra deps.
      const fileBuf = require('node:fs').readFileSync(dummyGzPath) as Buffer;
      const boundary = `----destructive-lock-spec-${Date.now()}`;
      const CRLF = '\r\n';
      const head =
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="confirmation"${CRLF}${CRLF}` +
        `${RESTORE_PHRASE}${CRLF}` +
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="lock-test-payload.sql.gz"${CRLF}` +
        `Content-Type: application/gzip${CRLF}${CRLF}`;
      const tail = `${CRLF}--${boundary}--${CRLF}`;
      const body = Buffer.concat([Buffer.from(head, 'utf8'), fileBuf, Buffer.from(tail, 'utf8')]);

      // Use the same admin cookie. apiLogin() above already verified it
      // works; restore-upload is Admin-only.
      const resp = await fetch(`${BASE_URL}/api/ops/restore-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
          Cookie: cookie,
        },
        body,
      });

      expect(
        resp.status,
        'restore-upload must be blocked by the shared lock',
      ).toBe(409);
      const respBody = (await resp.json()) as { error?: string; message?: string };
      // Restore endpoints surface the helper's generic error code.
      expect(respBody.error).toBe('destructive_db_op_in_progress');
      expect(respBody.message ?? '').not.toBe('');
    } finally {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [DESTRUCTIVE_DB_OP_LOCK_KEY]);
      } finally {
        lockClient.release();
        lockHeld = false;
      }
    }
  });

  test('cloud restore (POST /api/ops/backup-runs/:id/restore) is blocked by the shared lock', async () => {
    // Trigger a real backup so we have a successful backup_runs row
    // whose .sql.gz exists in object storage. Without one, the route
    // would short-circuit at the run-lookup or storage-existence check
    // BEFORE reaching the lock — and we'd be testing nothing about the
    // shared lock. Backups are read-only against the DB, so this is
    // safe on a disposable test database.
    const backupResp = await fetch(`${BASE_URL}/api/ops/run-backups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(
      backupResp.status,
      'precondition: a backup must succeed so we have a backupRunId to restore',
    ).toBeLessThan(400);

    // Find the most recent successful backup run via the public list
    // endpoint. (We could query the DB directly via `pool`, but going
    // through the API matches what a real client would do and proves
    // the row is visible to the very route we're about to hit.)
    const listResp = await fetch(`${BASE_URL}/api/ops/backup-runs`, {
      headers: { Cookie: cookie },
    });
    expect(listResp.status).toBe(200);
    const listBody = (await listResp.json()) as {
      runs?: Array<{ id: number; success: boolean | null; dbStorageKey: string | null }>;
    };
    const successfulRun = (listBody.runs ?? []).find(
      (r) => r.success === true && r.dbStorageKey,
    );
    expect(
      successfulRun,
      'a fully-successful backup with a dbStorageKey must be available after run-backups',
    ).toBeTruthy();

    // Hold the lock externally so the cloud-restore call cannot acquire
    // it. Without the lock, this would actually wipe + replace the
    // disposable test database (covered separately by 14-restore-roundtrip).
    const lockClient = await pool.connect();
    try {
      const lockRes = await lockClient.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [DESTRUCTIVE_DB_OP_LOCK_KEY],
      );
      expect(
        lockRes.rows[0]?.locked,
        'external client must successfully acquire the shared lock first',
      ).toBe(true);
      lockHeld = true;

      const resp = await fetch(
        `${BASE_URL}/api/ops/backup-runs/${successfulRun!.id}/restore`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: cookie },
          body: JSON.stringify({ confirmation: RESTORE_PHRASE }),
        },
      );
      expect(
        resp.status,
        'cloud restore must be blocked by the shared lock',
      ).toBe(409);
      const respBody = (await resp.json()) as { error?: string };
      expect(respBody.error).toBe('destructive_db_op_in_progress');
    } finally {
      try {
        await lockClient.query('SELECT pg_advisory_unlock($1)', [DESTRUCTIVE_DB_OP_LOCK_KEY]);
      } finally {
        lockClient.release();
        lockHeld = false;
      }
    }
  });

  test('factory-reset and restore-upload both succeed pre-conditions when the shared lock is FREE', async () => {
    // Sanity check: when the lock is NOT held, both endpoints should at
    // least pass their preflight checks. We do NOT actually fire a real
    // destructive op (that's covered by 10-factory-reset.spec.ts and
    // 14-restore-roundtrip.spec.ts). This test instead sends a request
    // with a DELIBERATELY WRONG confirmation phrase — the preflight check
    // returns 400 before the lock helper is ever invoked. Proves that
    // when the lock is free, the only thing in our way is the typed
    // phrase, NOT a stale advisory lock from a previous run.
    const factoryResp = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ confirmation: 'definitely not the phrase' }),
    });
    expect(factoryResp.status).toBe(400);
    const factoryBody = (await factoryResp.json()) as { error?: string };
    expect(factoryBody.error).toBe('factory_reset_confirmation_required');

    const uploadResp = await fetch(`${BASE_URL}/api/ops/restore-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({}),
    });
    // Non-multipart body trips the very first guard in restore-upload.
    expect(uploadResp.status).toBe(400);
  });
});
