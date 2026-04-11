ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "reference_number" text;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "reference_date" date;
