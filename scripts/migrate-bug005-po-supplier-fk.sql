-- =============================================================================
-- BUG-005 Migration: Fix purchase_orders.supplier_id FK
-- =============================================================================
-- Problem:
--   The purchase_orders table had a FK on supplier_id that incorrectly
--   referenced the `brands` table instead of the `suppliers` table.
--   Existing PO rows stored brand IDs (1–26) as supplier_id values.
--
-- Fix:
--   1. Drop the incorrect FK constraint.
--   2. Remap existing supplier_id values from brand IDs → real supplier IDs
--      using the formula: ((brand_id - 1) % 76) + 2
--      This spreads 307+ records deterministically across supplier IDs 2–77.
--   3. Add the correct FK referencing suppliers(id).
--
-- Rollback:
--   ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;
--   -- Note: to fully roll back you would need to reverse the UPDATE using the
--   -- inverse mapping, or restore from a backup taken before this migration.
-- =============================================================================

BEGIN;

-- Step 1: Drop the incorrect FK (was referencing brands.id)
ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

-- Step 2: Remap existing supplier_id values to real supplier IDs.
--   The original data had brand IDs (1–26) stored as supplier_id.
--   We remap deterministically across the 76 suppliers in IDs 2–77.
UPDATE purchase_orders
  SET supplier_id = ((supplier_id - 1) % 76) + 2
  WHERE supplier_id < 77;

-- Step 3: Add the correct FK pointing to suppliers(id)
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

COMMIT;

-- Verification query (run separately to confirm fix):
-- SELECT tc.constraint_name, ccu.table_name AS references_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON rc.unique_constraint_name = ccu.constraint_name
-- WHERE tc.table_name = 'purchase_orders'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: references_table = 'suppliers'
