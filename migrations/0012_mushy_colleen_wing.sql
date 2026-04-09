CREATE TABLE "restore_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"restored_at" timestamp DEFAULT now() NOT NULL,
	"triggered_by" varchar,
	"source_backup_run_id" integer,
	"source_filename" text,
	"success" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restore_runs" ADD CONSTRAINT "restore_runs_source_backup_run_id_backup_runs_id_fk" FOREIGN KEY ("source_backup_run_id") REFERENCES "public"."backup_runs"("id") ON DELETE no action ON UPDATE no action;