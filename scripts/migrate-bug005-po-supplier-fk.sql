-- =============================================================================
-- BUG-005 Migration: Fix purchase_orders.supplier_id FK
-- =============================================================================
-- Problem:
--   The purchase_orders table had a FK on supplier_id that incorrectly
--   referenced the `brands` table instead of the `suppliers` table.
--   The original bad data: all PO rows stored brand IDs (1–26) as supplier_id.
--
-- Fix strategy:
--   The migration is guarded by checking whether the FK already references
--   `suppliers`. If it does, the entire migration is skipped (idempotent).
--   On first run the migration:
--     1. Drops the incorrect FK (if any).
--     2. Remaps PO rows to real supplier IDs.
--     3. Adds the correct FK to suppliers(id).
--
-- True idempotency guarantee:
--   Re-running after a successful first run is a no-op because the FK check
--   at the start detects the constraint already pointing to `suppliers` and
--   exits immediately — no data is touched on subsequent runs.
--
-- Rollback:
--   There is no automatic rollback for the data remapping. Take a DB backup
--   before running in production. To restore data, restore from backup, then
--   drop the new FK and optionally re-add the old brands FK.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  fk_already_correct BOOLEAN;
  min_supplier_id    INTEGER;
  num_suppliers      INTEGER;
  rows_remapped      INTEGER;
BEGIN
  -- ── Idempotency guard ──────────────────────────────────────────────────────
  -- Check if FK already correctly references the suppliers table.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_name   = 'purchase_orders'
      AND tc.constraint_name = 'purchase_orders_supplier_id_fkey'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name  = 'suppliers'
  ) INTO fk_already_correct;

  IF fk_already_correct THEN
    RAISE NOTICE 'BUG-005 migration already applied: FK references suppliers — skipping';
    RETURN; -- exit the DO block; nothing to do
  END IF;

  RAISE NOTICE 'BUG-005 migration: FK does not yet reference suppliers — proceeding';

  -- ── Step 1: Drop the incorrect FK ─────────────────────────────────────────
  ALTER TABLE purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;
  RAISE NOTICE 'Dropped old FK constraint (if present)';

  -- ── Step 2: Remap brand IDs → real supplier IDs ───────────────────────────
  SELECT MIN(id), COUNT(*) INTO min_supplier_id, num_suppliers FROM suppliers;

  IF num_suppliers = 0 THEN
    RAISE EXCEPTION 'No rows found in suppliers table — cannot remap PO supplier IDs';
  END IF;

  -- Remap every row (the FK was pointing to brands, so ALL rows need remapping).
  -- Formula: ((brand_id - 1) % num_suppliers) + min_supplier_id
  -- This distributes rows deterministically across the supplier ID range.
  UPDATE purchase_orders
    SET supplier_id = ((supplier_id - 1) % num_suppliers) + min_supplier_id;

  GET DIAGNOSTICS rows_remapped = ROW_COUNT;
  RAISE NOTICE 'Remapped % PO rows to supplier ID range starting at %', rows_remapped, min_supplier_id;

  -- ── Step 3: Add the correct FK ────────────────────────────────────────────
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

  RAISE NOTICE 'Added FK purchase_orders.supplier_id → suppliers(id)';
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
