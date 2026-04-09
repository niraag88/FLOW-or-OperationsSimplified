CREATE TABLE "backup_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ran_at" timestamp DEFAULT now() NOT NULL,
	"triggered_by" varchar,
	"db_success" boolean NOT NULL,
	"db_filename" text,
	"db_storage_key" text,
	"manifest_success" boolean NOT NULL,
	"manifest_filename" text,
	"manifest_storage_key" text,
	"manifest_total_objects" integer,
	"manifest_total_size_bytes" bigint,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "backup_runs" ADD CONSTRAINT "backup_runs_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;