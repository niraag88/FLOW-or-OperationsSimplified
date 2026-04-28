/**
 * DB-layer guarantees for the scheduled-backup configuration (Task #325).
 *
 * The API and the DB both enforce 1..14 for retentionCount and
 * alertThresholdDays. The API path is covered by the e2e suite
 * (PUT branches at 0 and 15). This unit suite drives the CHECK
 * constraints from raw SQL so a future refactor that bypasses the API
 * (a script, a console, a Drizzle .update() call elsewhere in the app)
 * still cannot leave the row in an out-of-range state.
 *
 * Run with:  npx tsx --test tests/unit/dbCheckConstraints.test.ts
 *
 * Requires DATABASE_URL to be set.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function probeConstraintsExist(): Promise<boolean> {
  const r = await pool.query<{ name: string }>(
    `SELECT conname AS name
       FROM pg_constraint
      WHERE conname IN (
        'company_settings_backup_retention_range_chk',
        'company_settings_backup_alert_range_chk'
      )`
  );
  return r.rows.length === 2;
}

test('both CHECK constraints exist on company_settings', async () => {
  assert.equal(await probeConstraintsExist(), true);
});

async function tryUpdate(retention: number, alert: number): Promise<{ ok: boolean; sqlState?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(
        `UPDATE company_settings
            SET backup_schedule_retention_count = $1,
                backup_schedule_alert_threshold_days = $2
          WHERE id = (SELECT id FROM company_settings ORDER BY id ASC LIMIT 1)`,
        [retention, alert]
      );
      await client.query('ROLLBACK');
      return { ok: true };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return { ok: false, sqlState: err?.code };
    }
  } finally {
    client.release();
  }
}

test('DB rejects retentionCount=15 with check_violation (23514)', async () => {
  const r = await tryUpdate(15, 2);
  assert.equal(r.ok, false);
  assert.equal(r.sqlState, '23514');
});

test('DB rejects retentionCount=0 with check_violation (23514)', async () => {
  const r = await tryUpdate(0, 2);
  assert.equal(r.ok, false);
  assert.equal(r.sqlState, '23514');
});

test('DB rejects alertThresholdDays=15 with check_violation (23514)', async () => {
  const r = await tryUpdate(7, 15);
  assert.equal(r.ok, false);
  assert.equal(r.sqlState, '23514');
});

test('DB rejects alertThresholdDays=0 with check_violation (23514)', async () => {
  const r = await tryUpdate(7, 0);
  assert.equal(r.ok, false);
  assert.equal(r.sqlState, '23514');
});

test('DB accepts the upper-bound 14/14', async () => {
  const r = await tryUpdate(14, 14);
  assert.equal(r.ok, true);
});

test('DB accepts the lower-bound 1/1', async () => {
  const r = await tryUpdate(1, 1);
  assert.equal(r.ok, true);
});

test.after(async () => {
  await pool.end();
});
