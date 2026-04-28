-- Task #325: Scheduled automatic backups
-- Adds the seven backup-schedule columns to company_settings,
-- the triggered_by_label column to backup_runs, and CHECK constraints
-- limiting retention/alert to 1..14.
-- Written idempotent so it can run cleanly on databases that may have
-- received some of these changes via earlier db:push iterations.

ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_frequency" text;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_time_of_day" text;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_retention_count" integer DEFAULT 7 NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_alert_threshold_days" integer DEFAULT 2 NOT NULL;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_next_due_at" timestamp;
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "backup_schedule_last_run_at" timestamp;

ALTER TABLE "backup_runs" ADD COLUMN IF NOT EXISTS "triggered_by_label" text;

ALTER TABLE "company_settings" DROP CONSTRAINT IF EXISTS "company_settings_backup_retention_range_chk";
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_backup_retention_range_chk"
  CHECK ("backup_schedule_retention_count" BETWEEN 1 AND 14);

ALTER TABLE "company_settings" DROP CONSTRAINT IF EXISTS "company_settings_backup_alert_range_chk";
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_backup_alert_range_chk"
  CHECK ("backup_schedule_alert_threshold_days" BETWEEN 1 AND 14);
