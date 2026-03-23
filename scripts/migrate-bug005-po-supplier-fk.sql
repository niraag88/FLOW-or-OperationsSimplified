-- =============================================================================
-- BUG-005 Migration: Fix purchase_orders.supplier_id FK
-- =============================================================================
-- Problem:
--   The purchase_orders table had a FK on supplier_id that incorrectly
--   referenced the `brands` table. All PO rows stored brand IDs (1–26) as
--   supplier_id values. The original supplier–PO relationships were never
--   stored, so they cannot be recovered from the data alone.
--
-- Recovery strategy (minimal-impact):
--   1. Drop the old FK constraint (brands → suppliers).
--   2. For rows whose current supplier_id does NOT exist in the suppliers
--      table (i.e. invalid rows), reassign to the fallback (MIN suppliers.id).
--      Rows that already hold a valid suppliers.id are LEFT UNTOUCHED.
--   3. Add the new FK constraint pointing to the suppliers table.
--
--   This is a non-destructive approach: valid supplier IDs are preserved
--   as-is; only genuinely invalid IDs are remapped to the fallback.
--   In practice all PO rows have brand IDs (1–26) which are outside the
--   suppliers ID range, so all will be remapped — but the script is safe
--   to run on any data state.
--
-- Idempotency:
--   If the FK already references `suppliers`, the entire script is a no-op.
--   Safe to re-run at any time.
--
-- Rollback:
--   Take a DB backup before running. No automatic rollback is provided.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  fk_already_correct BOOLEAN;
  fallback_supplier_id INTEGER;
  rows_fixed           INTEGER;
BEGIN
  -- ── Idempotency guard ──────────────────────────────────────────────────────
  -- If FK already references suppliers, skip everything.
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc
      ON rc.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name
    WHERE tc.table_name      = 'purchase_orders'
      AND tc.constraint_name = 'purchase_orders_supplier_id_fkey'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name     = 'suppliers'
  ) INTO fk_already_correct;

  IF fk_already_correct THEN
    RAISE NOTICE 'BUG-005: FK already references suppliers — migration already applied, no-op';
    RETURN;
  END IF;

  RAISE NOTICE 'BUG-005: FK does not yet reference suppliers — applying migration';

  -- ── Step 1: Resolve the fallback supplier ──────────────────────────────────
  SELECT MIN(id) INTO fallback_supplier_id FROM suppliers;

  IF fallback_supplier_id IS NULL THEN
    RAISE EXCEPTION 'No rows found in suppliers table — cannot run BUG-005 migration';
  END IF;

  RAISE NOTICE 'Using fallback supplier_id = % for rows with invalid supplier IDs', fallback_supplier_id;

  -- ── Step 2: Drop the incorrect FK ─────────────────────────────────────────
  ALTER TABLE purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

  -- ── Step 3: Remap only INVALID rows ───────────────────────────────────────
  -- Only update rows whose current supplier_id does not exist in suppliers.
  -- Rows with a valid suppliers.id are preserved as-is.
  UPDATE purchase_orders po
  SET supplier_id = fallback_supplier_id
  WHERE NOT EXISTS (
    SELECT 1 FROM suppliers s WHERE s.id = po.supplier_id
  );

  GET DIAGNOSTICS rows_fixed = ROW_COUNT;
  RAISE NOTICE 'Reassigned % PO rows with invalid supplier_id to fallback supplier_id=%', rows_fixed, fallback_supplier_id;

  IF rows_fixed > 0 THEN
    RAISE NOTICE 'ACTION REQUIRED: % POs need manual review to correct supplier assignments', rows_fixed;
  ELSE
    RAISE NOTICE 'No rows required remapping — all PO supplier_id values were already valid';
  END IF;

  -- ── Step 4: Add the correct FK ────────────────────────────────────────────
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_supplier_id_fkey
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id);

  RAISE NOTICE 'Added FK purchase_orders.supplier_id → suppliers(id)';
END;
$$;

COMMIT;

-- =============================================================================
-- Verification query (run separately to confirm the migration applied):
-- =============================================================================
-- SELECT tc.constraint_name, ccu.table_name AS references_table
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON tc.constraint_name = rc.constraint_name
-- JOIN information_schema.constraint_column_usage ccu
--   ON rc.unique_constraint_name = ccu.constraint_name
-- WHERE tc.table_name = 'purchase_orders'
--   AND tc.constraint_type = 'FOREIGN KEY';
-- Expected: references_table = 'suppliers'
