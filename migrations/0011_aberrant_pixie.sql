ALTER TABLE "backup_runs" ADD COLUMN "finished_at" timestamp;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "success" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "backup_runs" ADD COLUMN "db_file_size" bigint;