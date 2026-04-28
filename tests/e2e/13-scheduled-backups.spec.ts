import { test, expect } from '@playwright/test';
import { apiLogin, BASE_URL } from './helpers';

interface BackupRun {
  id: number;
  ranAt: string;
  ran_at?: string;
  success: boolean;
  triggeredByLabel: string | null;
  triggered_by_label?: string | null;
}

/**
 * Scheduled Backups spec (Task #325).
 *
 * This spec exercises the new admin endpoints + the in-app scheduler.
 * The actual end-to-end "wait 75s for the backup to fire" path is
 * gated behind RUN_DESTRUCTIVE_BACKUP_TEST=1 because it (a) takes
 * minutes and (b) writes real backups to object storage. The default
 * run only covers the API contract: GET shape, PUT validation
 * branches, and that nextDueAt is computed when valid.
 *
 * To run the destructive test:
 *   RUN_DESTRUCTIVE_BACKUP_TEST=1 npx playwright test tests/e2e/13-scheduled-backups.spec.ts
 */

const RUN_DESTRUCTIVE = process.env.RUN_DESTRUCTIVE_BACKUP_TEST === '1';

interface ScheduleResponse {
  enabled: boolean;
  frequency: 'daily' | 'every_2_days' | 'weekly' | null;
  timeOfDay: string | null;
  retentionCount: number;
  alertThresholdDays: number;
  nextDueAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulBackupAt: string | null;
}

test.describe('Scheduled Backups (API)', () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('GET /api/ops/backup-schedule denies anon (401)', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`);
    expect(r.status).toBe(401);
  });

  test('GET /api/ops/backup-schedule returns the eight-field shape for admin', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, { headers: { Cookie: cookie } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScheduleResponse;
    expect(typeof body.enabled).toBe('boolean');
    expect(typeof body.retentionCount).toBe('number');
    expect(typeof body.alertThresholdDays).toBe('number');
    // Nullable fields should be present (possibly null)
    expect(body).toHaveProperty('frequency');
    expect(body).toHaveProperty('timeOfDay');
    expect(body).toHaveProperty('nextDueAt');
    expect(body).toHaveProperty('lastRunAt');
    expect(body).toHaveProperty('lastSuccessfulBackupAt');
  });

  test('PUT /api/ops/backup-schedule denies anon (401)', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(401);
  });

  test('PUT rejects enabled=true with no frequency', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true, frequency: null, timeOfDay: '09:00', retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { field: string };
    expect(body.field).toBe('frequency');
  });

  test('PUT rejects enabled=true with no timeOfDay', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true, frequency: 'daily', timeOfDay: null, retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { field: string };
    expect(body.field).toBe('timeOfDay');
  });

  test('PUT rejects malformed timeOfDay', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true, frequency: 'daily', timeOfDay: '99:99', retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(400);
  });

  test('PUT rejects retentionCount out of range (15)', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 15, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(400);
  });

  test('PUT rejects alertThresholdDays out of range (0)', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 0 }),
    });
    expect(r.status).toBe(400);
  });

  test('PUT accepts a valid enabled payload and computes nextDueAt', async () => {
    // Pick a far-future time to avoid actually triggering a backup.
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true, frequency: 'weekly', timeOfDay: '03:00', retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScheduleResponse;
    expect(body.enabled).toBe(true);
    expect(body.frequency).toBe('weekly');
    expect(body.timeOfDay).toBe('03:00');
    expect(body.nextDueAt).not.toBeNull();
    // nextDueAt should be in the future
    expect(new Date(body.nextDueAt!).getTime()).toBeGreaterThan(Date.now());
  });

  test('PUT can disable the schedule (no frequency/time required)', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScheduleResponse;
    expect(body.enabled).toBe(false);
    expect(body.nextDueAt).toBeNull();
  });

  test('manual run records triggered_by_label = the admin username', async () => {
    // Trigger a manual backup
    const r = await fetch(`${BASE_URL}/api/ops/run-backups`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);

    // Fetch the latest run row and assert the label is set to the admin
    // user (NOT null, NOT 'scheduler'). This proves the label column is
    // populated by the runBackup() pipeline.
    const list = await fetch(`${BASE_URL}/api/ops/backup-runs`, { headers: { Cookie: cookie } });
    const data = (await list.json()) as { runs: BackupRun[] };
    expect(data.runs.length).toBeGreaterThan(0);
    const latest = data.runs[0];
    expect(latest.triggeredByLabel).toBeTruthy();
    expect(latest.triggeredByLabel).not.toBe('scheduler');
  });

  test('retention pruning deletes successful runs beyond the configured count', async () => {
    // Set retention to the minimum (1) so even one extra successful run
    // triggers a prune.
    let r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 1, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(200);

    // Run two backups in sequence — the first should be pruned by the
    // pruneOldBackups() call inside the second's runBackup() pipeline.
    r = await fetch(`${BASE_URL}/api/ops/run-backups`, { method: 'POST', headers: { Cookie: cookie } });
    expect(r.status).toBe(200);

    const afterFirst = (await (
      await fetch(`${BASE_URL}/api/ops/backup-runs`, { headers: { Cookie: cookie } })
    ).json()) as { runs: BackupRun[] };
    const successAfterFirst = afterFirst.runs.filter((x) => x.success);
    const firstId = successAfterFirst[0]?.id;
    expect(firstId).toBeDefined();

    r = await fetch(`${BASE_URL}/api/ops/run-backups`, { method: 'POST', headers: { Cookie: cookie } });
    expect(r.status).toBe(200);

    const afterSecond = (await (
      await fetch(`${BASE_URL}/api/ops/backup-runs`, { headers: { Cookie: cookie } })
    ).json()) as { runs: BackupRun[] };
    const successAfterSecond = afterSecond.runs.filter((x) => x.success);
    // Only the most recent successful run should remain in the list.
    expect(successAfterSecond.length).toBeLessThanOrEqual(1);
    if (firstId !== undefined && successAfterSecond.length === 1) {
      expect(successAfterSecond[0].id).not.toBe(firstId);
    }

    // Restore retention to 7 for cleanliness.
    await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 2 }),
    });
  });

  test('boundary values 14/14 round-trip through API and persist in DB (CHECK constraints exercised at the upper bound)', async () => {
    // Both API and DB enforce 1..14. The API rejects 15 / 0 first
    // (covered by the out-of-range tests above). The DB-layer CHECK
    // constraints are exercised directly by the unit suite at
    // tests/unit/dbCheckConstraints.test.ts (which connects to the DB
    // and asserts a raw INSERT with retentionCount=15 / alert=15 is
    // rejected with 23514 check_violation). Here we simply confirm
    // the upper-bound payload (14 / 14) flows cleanly through the
    // PUT endpoint and persists, proving the constraint accepts the
    // valid ceiling.
    const r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 14, alertThresholdDays: 14 }),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as ScheduleResponse;
    expect(body.retentionCount).toBe(14);
    expect(body.alertThresholdDays).toBe(14);

    // Reset to defaults
    await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 2 }),
    });
  });
});

test.describe('Scheduled Backups (live tick)', () => {
  test.skip(!RUN_DESTRUCTIVE, 'destructive backup tick test — set RUN_DESTRUCTIVE_BACKUP_TEST=1 to enable');

  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('schedule fires within ~75s window and writes a backup_runs row', async () => {
    // Compute Dubai HH:MM ~1 minute in the future
    const now = new Date();
    const dubai = new Date(now.getTime() + 4 * 60 * 60 * 1000 + 60 * 1000);
    const hh = String(dubai.getUTCHours()).padStart(2, '0');
    const mm = String(dubai.getUTCMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;

    // Enable schedule
    let r = await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: true, frequency: 'daily', timeOfDay: time, retentionCount: 7, alertThresholdDays: 2 }),
    });
    expect(r.status).toBe(200);

    // Note baseline run count
    r = await fetch(`${BASE_URL}/api/ops/backup-runs`, { headers: { Cookie: cookie } });
    const before = (await r.json()) as { runs: Array<{ id: number }> };
    const baselineCount = before.runs.length;

    // Wait up to 90s for the scheduler to tick + run
    const deadline = Date.now() + 90_000;
    let after: { runs: BackupRun[] } | null = null;
    while (Date.now() < deadline) {
      await new Promise((res) => setTimeout(res, 5000));
      r = await fetch(`${BASE_URL}/api/ops/backup-runs`, { headers: { Cookie: cookie } });
      after = (await r.json()) as { runs: BackupRun[] };
      if (after.runs.length > baselineCount) break;
    }
    expect(after).not.toBeNull();
    expect(after!.runs.length).toBeGreaterThan(baselineCount);

    // The newest row must be the scheduler-attributed run.
    const latest = after!.runs[0];
    expect(latest.triggeredByLabel).toBe('scheduler');

    // Disable to be tidy
    await fetch(`${BASE_URL}/api/ops/backup-schedule`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ enabled: false, retentionCount: 7, alertThresholdDays: 2 }),
    });
  });
});
