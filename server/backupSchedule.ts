/**
 * Backup schedule helpers (Task #325).
 *
 * Owns reading/writing the seven companySettings columns that drive the
 * scheduled-backup feature, plus the next-due-time computation used by
 * both the PUT endpoint and the in-app scheduler.
 *
 * Times are interpreted in Asia/Dubai (UTC+4, no DST). The frontend
 * sends a HH:MM string which is the wall-clock time at which the next
 * backup should fire in Dubai.
 */

import { z } from "zod";
import { db } from "./db";
import { companySettings, backupRuns } from "@shared/schema";
import { desc, eq } from "drizzle-orm";

export type BackupFrequency = "daily" | "every_2_days" | "weekly";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const BackupScheduleInputSchema = z
  .object({
    enabled: z.boolean(),
    frequency: z.enum(["daily", "every_2_days", "weekly"]).nullable().optional(),
    timeOfDay: z
      .string()
      .regex(TIME_REGEX, "Time must be in HH:MM format")
      .nullable()
      .optional(),
    retentionCount: z.number().int().min(1).max(14),
    alertThresholdDays: z.number().int().min(1).max(14),
  })
  .superRefine((val, ctx) => {
    if (val.enabled) {
      if (!val.frequency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["frequency"],
          message: "Pick a frequency before enabling scheduled backups.",
        });
      }
      if (!val.timeOfDay) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["timeOfDay"],
          message: "Pick a time of day before enabling scheduled backups.",
        });
      }
    }
  });

export type BackupScheduleInput = z.infer<typeof BackupScheduleInputSchema>;

const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4, no DST

/**
 * Convert a Date to Dubai-time fields (year/month/day) and a "Dubai
 * midnight" UTC instant. Used by computeNextDueAt to pin HH:MM to the
 * correct Dubai date even when the server's UTC clock is on the
 * previous/next calendar day.
 */
function dubaiNow(now: Date) {
  const dubaiMs = now.getTime() + DUBAI_OFFSET_MS;
  const d = new Date(dubaiMs);
  // d's UTC fields now show Dubai wall-clock values
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
  };
}

/**
 * Compute the next-due UTC instant given a frequency, a Dubai HH:MM
 * time, and a starting reference instant.
 *
 * Behaviour:
 *  - For *daily*: the next occurrence at HH:MM Dubai time. If today's
 *    HH:MM has already passed, schedules for tomorrow.
 *  - For *every_2_days*: same as daily for first occurrence, then
 *    advance by 2-day steps.
 *  - For *weekly*: same as daily for first occurrence, then advance by
 *    7-day steps.
 *
 * `from` is the reference instant. Pass `new Date()` for "now"; pass
 * the just-completed run's start time for advancing after a successful
 * backup so cadence stays consistent.
 *
 * `mode = 'first'` returns the first occurrence at-or-after `from`.
 * `mode = 'next'` advances by exactly one period from `from`.
 */
export function computeNextDueAt(
  frequency: BackupFrequency,
  timeOfDay: string,
  from: Date,
  mode: "first" | "next" = "first"
): Date {
  const m = TIME_REGEX.exec(timeOfDay);
  if (!m) throw new Error(`Invalid timeOfDay: ${timeOfDay}`);
  const targetH = parseInt(timeOfDay.slice(0, 2), 10);
  const targetMin = parseInt(timeOfDay.slice(3, 5), 10);

  const dubai = dubaiNow(from);
  // Today's target instant in UTC milliseconds.
  // Dubai HH:MM corresponds to UTC = HH:MM - 4h.
  const todayDubaiMidnightUtcMs = Date.UTC(dubai.year, dubai.month, dubai.day) - DUBAI_OFFSET_MS;
  let target = todayDubaiMidnightUtcMs + (targetH * 60 + targetMin) * 60 * 1000;

  const periodDays = frequency === "daily" ? 1 : frequency === "every_2_days" ? 2 : 7;

  if (mode === "next") {
    target += periodDays * 24 * 60 * 60 * 1000;
  } else {
    // First occurrence: today's HH:MM if still upcoming, otherwise
    // tomorrow's HH:MM — independent of frequency. Frequency stepping
    // only kicks in after a successful run via mode="next".
    const oneDayMs = 24 * 60 * 60 * 1000;
    while (target <= from.getTime()) {
      target += oneDayMs;
    }
  }
  return new Date(target);
}

export interface BackupScheduleView {
  enabled: boolean;
  frequency: BackupFrequency | null;
  timeOfDay: string | null;
  retentionCount: number;
  alertThresholdDays: number;
  nextDueAt: string | null;
  lastRunAt: string | null;
  lastSuccessfulBackupAt: string | null;
  lastRunSuccess: boolean | null;
}

export async function getBackupSchedule(): Promise<BackupScheduleView> {
  const [settings] = await db.select().from(companySettings).limit(1);
  const [latestSuccess] = await db
    .select({ ranAt: backupRuns.ranAt })
    .from(backupRuns)
    .where(eq(backupRuns.success, true))
    .orderBy(desc(backupRuns.ranAt))
    .limit(1);
  const [latestRun] = await db
    .select({ success: backupRuns.success })
    .from(backupRuns)
    .orderBy(desc(backupRuns.ranAt))
    .limit(1);

  return {
    enabled: settings?.backupScheduleEnabled ?? false,
    frequency: (settings?.backupScheduleFrequency as BackupFrequency | null) ?? null,
    timeOfDay: settings?.backupScheduleTimeOfDay ?? null,
    retentionCount: settings?.backupScheduleRetentionCount ?? 7,
    alertThresholdDays: settings?.backupScheduleAlertThresholdDays ?? 2,
    nextDueAt: settings?.backupScheduleNextDueAt
      ? new Date(settings.backupScheduleNextDueAt).toISOString()
      : null,
    lastRunAt: settings?.backupScheduleLastRunAt
      ? new Date(settings.backupScheduleLastRunAt).toISOString()
      : null,
    lastSuccessfulBackupAt: latestSuccess?.ranAt
      ? new Date(latestSuccess.ranAt).toISOString()
      : null,
    lastRunSuccess: latestRun ? latestRun.success : null,
  };
}

export async function updateBackupSchedule(
  input: BackupScheduleInput,
  updatedBy: string
): Promise<BackupScheduleView> {
  // Recompute nextDueAt when enabled and we have both frequency + timeOfDay
  let nextDueAt: Date | null = null;
  if (input.enabled && input.frequency && input.timeOfDay) {
    nextDueAt = computeNextDueAt(input.frequency, input.timeOfDay, new Date(), "first");
  }

  const [existing] = await db.select({ id: companySettings.id }).from(companySettings).limit(1);
  if (existing) {
    await db
      .update(companySettings)
      .set({
        backupScheduleEnabled: input.enabled,
        backupScheduleFrequency: input.frequency ?? null,
        backupScheduleTimeOfDay: input.timeOfDay ?? null,
        backupScheduleRetentionCount: input.retentionCount,
        backupScheduleAlertThresholdDays: input.alertThresholdDays,
        backupScheduleNextDueAt: nextDueAt,
        updatedBy,
      })
      .where(eq(companySettings.id, existing.id));
  } else {
    await db.insert(companySettings).values({
      companyName: "",
      backupScheduleEnabled: input.enabled,
      backupScheduleFrequency: input.frequency ?? null,
      backupScheduleTimeOfDay: input.timeOfDay ?? null,
      backupScheduleRetentionCount: input.retentionCount,
      backupScheduleAlertThresholdDays: input.alertThresholdDays,
      backupScheduleNextDueAt: nextDueAt,
      updatedBy,
    });
  }
  return getBackupSchedule();
}

/**
 * Record that a scheduled run was *attempted* (success OR failure).
 * Always updates lastRunAt so the status panel and the stale-banner
 * see the most recent attempt timestamp regardless of outcome.
 * Does NOT touch nextDueAt — see recordScheduledRunSuccess for that.
 */
export async function recordScheduledRunAttempt(runStartedAt: Date): Promise<void> {
  const [settings] = await db.select({ id: companySettings.id }).from(companySettings).limit(1);
  if (!settings) return;
  await db
    .update(companySettings)
    .set({ backupScheduleLastRunAt: runStartedAt })
    .where(eq(companySettings.id, settings.id));
}

/**
 * After a scheduled run *succeeds*, advance nextDueAt by one period.
 * Called by server/scheduler.ts only on the success branch — failed
 * runs deliberately leave nextDueAt alone so the next minute tick
 * retries the same window.
 */
export async function recordScheduledRunSuccess(runStartedAt: Date): Promise<void> {
  const [settings] = await db.select().from(companySettings).limit(1);
  if (!settings || !settings.backupScheduleEnabled) return;
  const freq = settings.backupScheduleFrequency as BackupFrequency | null;
  const time = settings.backupScheduleTimeOfDay;
  let nextDueAt: Date | null = null;
  if (freq && time) {
    // Advance by exactly one period from the just-finished run's
    // scheduled time so cadence stays consistent even if the run
    // ran a few seconds late.
    nextDueAt = computeNextDueAt(freq, time, runStartedAt, "next");
  }
  await db
    .update(companySettings)
    .set({ backupScheduleNextDueAt: nextDueAt })
    .where(eq(companySettings.id, settings.id));
}
