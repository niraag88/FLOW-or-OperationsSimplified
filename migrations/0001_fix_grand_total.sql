-- Back-fill grand_total for purchase orders where it is 0 or NULL
-- Computes grand_total = ROUND(total_amount * fx_rate_to_aed, 2)
-- For AED-currency POs, grand_total equals total_amount directly

UPDATE purchase_orders
SET grand_total = ROUND(
  CAST(total_amount AS NUMERIC) *
  CASE WHEN currency = 'AED' THEN 1
       ELSE CAST(fx_rate_to_aed AS NUMERIC)
  END,
  2
)
WHERE grand_total IS NULL
   OR CAST(grand_total AS NUMERIC) = 0
   OR grand_total = '0.00';
