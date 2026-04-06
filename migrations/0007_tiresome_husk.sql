ALTER TABLE "brands" ADD COLUMN "data_source" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "data_source" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "data_source" text DEFAULT 'user';--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "data_source" text DEFAULT 'user';