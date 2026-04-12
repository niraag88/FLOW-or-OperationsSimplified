-- Add per-GRN payment tracking columns (no default so existing rows start as NULL)
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_status" text;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_made_date" date;
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "payment_remarks" text;

-- Backfill: GRNs whose PO is already paid inherit PO-level paid status
UPDATE "goods_receipts" g
SET payment_status = 'paid'
FROM "purchase_orders" po
WHERE g.po_id = po.id
  AND po.payment_status = 'paid'
  AND g.payment_status IS NULL;

-- Set DB-level default so all NEW GRNs created after this migration start as 'outstanding'
ALTER TABLE "goods_receipts" ALTER COLUMN "payment_status" SET DEFAULT 'outstanding';
