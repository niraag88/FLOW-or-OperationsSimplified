ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_status" text DEFAULT 'outstanding';
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_made_date" date;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_remarks" text;
