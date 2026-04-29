/**
 * In-app scheduled-backup runner (Task #325, Task #345).
 *
 * ACCEPTED DESIGN DEVIATION: the original task wording suggested a
 * `SELECT ... FOR UPDATE NOWAIT` row lock on company_settings. We
 * deliberately use a session-level advisory lock instead because the
 * row lock would only protect the *read* of the schedule row at the
 * top of each tick, not the long-running backup that follows; two
 * concurrent backups would still be possible if a previous backup ran
 * past the next minute tick. The advisory lock is held for the entire
 * backup duration and auto-released on connection drop, so a crashed
 * worker cannot leave the schedule wedged. This decision is also
 * recorded in replit.md.
 *
 * As of Task #345 the lock is shared with the manual route
 * (POST /api/ops/run-backups) via withBackupLock() in
 * server/backupLock.ts, so a manual backup and a scheduled tick can
 * never overlap.
 *
 * Ticks once per minute. On each tick:
 *   1. Tries to acquire the shared backup advisory lock that will be
 *      held for the entire duration of the backup. This is the only
 *      mechanism preventing two concurrent runs (covers a backup that
 *      takes longer than the tick interval, OR a manual backup that
 *      lands while a scheduled tick is in flight).
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
import { withBackupLock } from "./backupLock";
import { logger } from "./logger";

const TICK_INTERVAL_MS = 60_000;

let intervalHandle: NodeJS.Timeout | null = null;

export async function backupSchedulerTick(now: Date = new Date()): Promise<"ran" | "skipped" | "locked"> {
  const outcome = await withBackupLock<"ran" | "skipped">(async () => {
    const res = await pool.query(
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
        logger.error(
          "Scheduled backup failed:",
          result.errorMessage || result.dbBackup.error || result.manifestBackup.error
        );
      }
    } catch (err) {
      logger.error("Scheduled backup threw unexpectedly:", err);
    }

    // Always record that an attempt was made (success or failure) so the
    // status panel reflects the most recent activity.
    try {
      await recordScheduledRunAttempt(runStartedAt);
    } catch (err) {
      logger.error("recordScheduledRunAttempt failed:", err);
    }

    // Only advance nextDueAt on success — failures retry next tick.
    if (succeeded) {
      try {
        await recordScheduledRunSuccess(runStartedAt);
      } catch (err) {
        logger.error("recordScheduledRunSuccess failed:", err);
      }
    }
    return "ran";
  });

  if (!outcome.acquired) {
    return "locked";
  }
  return outcome.result;
}

export function startBackupScheduler() {
  if (intervalHandle) return;
  if (process.env.DISABLE_BACKUP_SCHEDULER === "1") {
    logger.info("Backup scheduler disabled via DISABLE_BACKUP_SCHEDULER=1");
    return;
  }
  intervalHandle = setInterval(() => {
    backupSchedulerTick().catch((err) => {
      logger.error("backupSchedulerTick threw:", err);
    });
  }, TICK_INTERVAL_MS);
  // Don't keep the event loop alive solely for the scheduler
  if (intervalHandle && typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }
  logger.info(`Backup scheduler started (tick every ${TICK_INTERVAL_MS / 1000}s)`);

  // Startup catch-up tick (Task #350): if the app was asleep / restarted
  // while a scheduled backup was overdue, the next interval tick is up
  // to TICK_INTERVAL_MS away. Fire one tick asynchronously now so an
  // overdue schedule runs within seconds of startup. The tick itself
  // already respects nextDueAt — a non-overdue schedule returns "skipped"
  // — and is gated by the same withBackupLock() advisory lock used by
  // the interval and manual paths, so a startup tick can never overlap
  // with a manual click that lands during boot. Errors are swallowed +
  // logged identically to the interval branch so they never crash boot.
  void backupSchedulerTick()
    .then((outcome) => {
      logger.info(`Backup scheduler startup catch-up tick: ${outcome}`);
    })
    .catch((err) => {
      logger.error("backupSchedulerTick (startup catch-up) threw:", err);
    });
}

export function stopBackupScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
