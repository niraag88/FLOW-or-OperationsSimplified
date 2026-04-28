/**
 * In-app scheduled-backup runner (Task #325).
 *
 * Ticks once per minute. On each tick:
 *   1. Tries to acquire a Postgres session-level advisory lock that
 *      will be held for the entire duration of the backup. This is the
 *      only mechanism preventing two concurrent runs (covers a backup
 *      that takes longer than the tick interval).
 *   2. Reads companySettings.
 *   3. If enabled === false or nextDueAt > NOW(): releases the lock and
 *      no-ops.
 *   4. Otherwise calls runBackup() (same code path as POST
 *      /api/ops/run-backups). The run is attributed to a synthetic
 *      "scheduler" actor so backup_runs.triggered_by_label can be
 *      filtered later.
 *      - lastRunAt is updated on every attempt (success OR failure).
 *      - nextDueAt is advanced ONLY on success. Failed attempts leave
 *        nextDueAt at the same overdue value so the next minute tick
 *        will retry the same window.
 *   5. Releases the advisory lock.
 *
 * If the process crashes mid-run the advisory lock is released by the
 * connection drop, so the next tick can re-acquire and retry.
 *
 * Test runs can skip startup by setting DISABLE_BACKUP_SCHEDULER=1.
 */

import { pool } from "./db";
import { runBackup } from "./runBackup";
import { recordScheduledRunAttempt, recordScheduledRunSuccess } from "./backupSchedule";

const TICK_INTERVAL_MS = 60_000;
// Arbitrary 64-bit key chosen for this lock. Picked to avoid colliding
// with any other advisory locks the app might use later. Stored as a
// string so pg can pass it through as bigint without ES2020 BigInt
// literal support.
const SCHEDULER_ADVISORY_LOCK_KEY = "7325142586001";

let intervalHandle: NodeJS.Timeout | null = null;

export async function backupSchedulerTick(now: Date = new Date()): Promise<"ran" | "skipped" | "locked"> {
  // Hold a single dedicated client for the lock + the run.
  // pg_try_advisory_lock is a *session* lock — releasing requires the
  // same connection, and connection death auto-releases.
  const client = await pool.connect();
  let lockAcquired = false;
  try {
    const lockRes = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [SCHEDULER_ADVISORY_LOCK_KEY]
    );
    lockAcquired = lockRes.rows[0]?.locked === true;
    if (!lockAcquired) {
      return "locked";
    }

    const res = await client.query(
      `SELECT id, backup_schedule_enabled, backup_schedule_next_due_at
         FROM company_settings
         ORDER BY id ASC
         LIMIT 1`
    );
    if (res.rowCount === 0) {
      return "skipped";
    }
    const row = res.rows[0] as {
      id: number;
      backup_schedule_enabled: boolean;
      backup_schedule_next_due_at: string | null;
    };
    if (!row.backup_schedule_enabled) {
      return "skipped";
    }
    if (!row.backup_schedule_next_due_at) {
      return "skipped";
    }
    const nextDue = new Date(row.backup_schedule_next_due_at);
    if (nextDue.getTime() > now.getTime()) {
      return "skipped";
    }

    // Run the backup while still holding the advisory lock.
    const runStartedAt = new Date();
    let succeeded = false;
    try {
      const result = await runBackup({ id: null, username: "scheduler" });
      succeeded = result.success === true;
      if (!succeeded) {
        console.error(
          "Scheduled backup failed:",
          result.errorMessage || result.dbBackup.error || result.manifestBackup.error
        );
      }
    } catch (err) {
      console.error("Scheduled backup threw unexpectedly:", err);
    }

    // Always record that an attempt was made (success or failure) so the
    // status panel reflects the most recent activity.
    try {
      await recordScheduledRunAttempt(runStartedAt);
    } catch (err) {
      console.error("recordScheduledRunAttempt failed:", err);
    }

    // Only advance nextDueAt on success — failures retry next tick.
    if (succeeded) {
      try {
        await recordScheduledRunSuccess(runStartedAt);
      } catch (err) {
        console.error("recordScheduledRunSuccess failed:", err);
      }
    }
    return "ran";
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_ADVISORY_LOCK_KEY]);
      } catch (err) {
        // Connection-level release happens automatically anyway.
        console.error("pg_advisory_unlock failed:", err);
      }
    }
    client.release();
  }
}

export function startBackupScheduler() {
  if (intervalHandle) return;
  if (process.env.DISABLE_BACKUP_SCHEDULER === "1") {
    console.log("Backup scheduler disabled via DISABLE_BACKUP_SCHEDULER=1");
    return;
  }
  intervalHandle = setInterval(() => {
    backupSchedulerTick().catch((err) => {
      console.error("backupSchedulerTick threw:", err);
    });
  }, TICK_INTERVAL_MS);
  // Don't keep the event loop alive solely for the scheduler
  if (intervalHandle && typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }
  console.log(`Backup scheduler started (tick every ${TICK_INTERVAL_MS / 1000}s)`);
}

export function stopBackupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
