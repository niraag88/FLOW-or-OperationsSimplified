ALTER TABLE "company_settings" ADD COLUMN "retention_exports_days" integer DEFAULT 60;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "retention_audit_logs_days" integer DEFAULT 730;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "retention_cold_storage_days" integer DEFAULT 30;