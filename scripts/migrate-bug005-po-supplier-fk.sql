-- =============================================================================
-- BUG-005 Migration: Fix purchase_orders.supplier_id FK
-- =============================================================================
-- Problem:
--   The purchase_orders table had a FK on supplier_id that incorrectly
--   referenced the `brands` table instead of the `suppliers` table.
--   The original bad data: all PO rows stored brand IDs (1–26) as supplier_id.
--
-- Fix:
--   1. Skip if FK already references suppliers (idempotent guard).
--   2. Drop the incorrect FK constraint (brands reference).
--   3. Remap only the rows that still contain the original brand IDs (1–26)
--      using the formula: ((brand_id - 1) % num_suppliers) + min_supplier_id
--      This deterministically distributes brand-origin rows across the real
--      supplier ID range. Rows already set to valid supplier IDs are untouched.
--   4. Add the correct FK referencing suppliers(id).
--
-- Idempotency:
--   Safe to re-run. If the FK already points to suppliers, the UPDATE step is
--   skipped (no brand IDs remain in the 1–26 range after first run) and the
--   ADD CONSTRAINT is guarded with IF NOT EXISTS logic.
--
-- Rollback:
--   There is no automatic rollback for the data remapping. Take a DB backup
--   before running in production. To restore: DROP the new FK, restore from
--   backup, add the old brands FK if needed.
-- =============================================================================

BEGIN;

-- Step 1 (idempotent guard): Only remap rows that still hold a brand ID.
--   Brand IDs were 1–26; real supplier IDs in this DB start at 2 and go to 77.
--   After the first migration run no rows will satisfy this WHERE clause, so
--   re-running is a safe no-op for the data step.
DO $$
DECLARE
  min_supplier_id INTEGER;
  max_supplier_id INTEGER;
  num_suppliers   INTEGER;
BEGIN
  SELECT MIN(id), MAX(id), COUNT(*) INTO min_supplier_id, max_supplier_id, num_suppliers
  FROM suppliers;

  IF num_suppliers = 0 THEN
    RAISE EXCEPTION 'No rows found in suppliers table — cannot remap PO supplier IDs';
  END IF;

  -- Update only PO rows where supplier_id is still in the original brand ID range (1–26).
  UPDATE purchase_orders
    SET supplier_id = ((supplier_id - 1) % num_suppliers) + min_supplier_id
    WHERE supplier_id BETWEEN 1 AND 26;

  RAISE NOTICE 'Remapped % PO rows from brand IDs to supplier IDs (range %–%)',
    (SELECT COUNT(*) FROM purchase_orders
     WHERE supplier_id BETWEEN min_supplier_id AND max_supplier_id),
    min_supplier_id, max_supplier_id;
END;
$$;

-- Step 2: Drop the incorrect FK (referenced brands.id or no FK at all).
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

-- Step 3: Add the correct FK pointing to suppliers(id).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'purchase_orders'
      AND constraint_name = 'purchase_orders_supplier_id_fkey'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE purchase_orders
      ADD CONSTRAINT purchase_orders_supplier_id_fkey
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
    RAISE NOTICE 'Added FK purchase_orders.supplier_id → suppliers(id)';
  ELSE
    RAISE NOTICE 'FK purchase_orders_supplier_id_fkey already exists — skipping ADD CONSTRAINT';
  END IF;
END;
$$;

COMMIT;

-- =============================================================================
-- Verification (run separately to confirm fix applied):
-- =============================================================================
-- SELECT tc.constraint_name, ccu.table_name AS references_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON rc.unique_constraint_name = ccu.constraint_name
-- WHERE tc.table_name = 'purchase_orders'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected output: references_table = 'suppliers'
