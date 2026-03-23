-- Task #46: Add currency and fxRateToAed columns to purchase_orders table
-- Run this once if the columns do not already exist.
-- These columns were added via direct SQL (db:push was stuck on interactive prompt).

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GBP';

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS fx_rate_to_aed DECIMAL(10,4) NOT NULL DEFAULT 4.8500;

-- Verify the migration
SELECT
  COUNT(*) AS total_pos,
  COUNT(currency) AS pos_with_currency,
  COUNT(fx_rate_to_aed) AS pos_with_fx_rate,
  MIN(currency) AS currency_value,
  MIN(fx_rate_to_aed) AS fx_min,
  MAX(fx_rate_to_aed) AS fx_max
FROM purchase_orders;
