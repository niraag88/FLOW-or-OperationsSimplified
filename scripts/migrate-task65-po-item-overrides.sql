-- Task #65: Add description_override and size_override columns to purchase_order_items
-- Idempotent: safe to run multiple times (IF NOT EXISTS guard).
-- These columns were added via direct SQL (db:push was stuck on interactive prompt).

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS description_override TEXT;

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS size_override TEXT;

-- Verify the migration
SELECT
  COUNT(*) AS total_items,
  COUNT(description_override) AS items_with_description_override,
  COUNT(size_override) AS items_with_size_override
FROM purchase_order_items;
