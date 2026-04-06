ALTER TABLE "delivery_orders" ADD COLUMN "company_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "company_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "company_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "company_snapshot" jsonb;