-- Create the ops schema for operational audit tables that survive DB restores.
-- DROP SCHEMA public CASCADE (used during database restore) does NOT affect this schema.
CREATE SCHEMA IF NOT EXISTS "ops";

-- Create ops.restore_runs in the ops schema so restore audit records are never lost.
-- This table is NOT affected by database restores (which only drop/recreate public schema).
CREATE TABLE IF NOT EXISTS "ops"."restore_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "restored_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "triggered_by" varchar,
  "triggered_by_name" text,
  "source_backup_run_id" integer,
  "source_filename" text,
  "success" boolean,
  "error_message" text,
  "duration_ms" integer
);

-- Drop the old public.restore_runs table (replaced by ops.restore_runs).
-- Any existing restore history rows are intentionally lost (table was just created in 0012).
DROP TABLE IF EXISTS "public"."restore_runs";
