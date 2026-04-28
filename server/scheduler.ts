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
 *      /api/ops/run-backups), then advances nextDueAt by one period.
 *   5. Releases the advisory lock.
 *
 * If the process crashes mid-run the advisory lock is released by the
 * connection drop, so the next tick can re-acquire and retry.
 *
 * Test runs can skip startup by setting DISABLE_BACKUP_SCHEDULER=1.
 */

import { pool } from "./db";
import { runBackup } from "./runBackup";
import { recordScheduledRunCompletion } from "./backupSchedule";

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
      [SCHEDULER_ADVISORY_LOCK_KEY.toString()]
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
    try {
      const result = await runBackup({ id: null, username: "scheduler" });
      if (result.success) {
        await recordScheduledRunCompletion(runStartedAt);
      } else {
        console.error(
          "Scheduled backup failed:",
          result.errorMessage || result.dbBackup.error || result.manifestBackup.error
        );
        // Push nextDueAt forward 5 min so we don't hammer it every tick
        // while a transient issue persists.
        await client.query(
          `UPDATE company_settings
              SET backup_schedule_next_due_at = $1
            WHERE id = $2`,
          [new Date(now.getTime() + 5 * 60 * 1000), row.id]
        );
      }
    } catch (err) {
      console.error("Scheduled backup threw unexpectedly:", err);
      await client.query(
        `UPDATE company_settings
            SET backup_schedule_next_due_at = $1
          WHERE id = $2`,
        [new Date(now.getTime() + 5 * 60 * 1000), row.id]
      );
    }
    return "ran";
  } finally {
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [SCHEDULER_ADVISORY_LOCK_KEY.toString()]);
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
