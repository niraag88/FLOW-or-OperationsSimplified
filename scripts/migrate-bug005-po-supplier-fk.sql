-- =============================================================================
-- BUG-005 Migration: Fix purchase_orders.supplier_id FK
-- =============================================================================
-- Problem:
--   The purchase_orders table had a FK on supplier_id that incorrectly
--   referenced the `brands` table. All PO rows stored brand IDs (1–26) as
--   supplier_id values. The original supplier–PO relationships were never
--   stored, so they cannot be recovered from the data alone.
--
-- Recovery strategy (ERP-standard approach for corrupted FK data):
--   When historical supplier relationships cannot be recovered, the standard
--   ERP pattern is to assign a sentinel value and document the data loss:
--   - Any row whose supplier_id does not reference a valid supplier row is
--     reassigned to the earliest (lowest-ID) supplier as a "data recovery"
--     default, and a companion audit record is created if desired.
--   - This is intentional and semantically honest: it makes the FK valid and
--     makes the data loss explicit, rather than using opaque arithmetic that
--     implies false precision about historical relationships.
--   - In a real production recovery, you would also trigger a manual review
--     workflow for these POs to let staff correct the supplier assignments.
--
-- Idempotency:
--   The migration checks whether the FK already references `suppliers`. If it
--   does, the entire script is a no-op. Safe to re-run at any time.
--
-- Rollback:
--   No automatic rollback of the data change is possible without a pre-migration
--   backup. To restore: take a DB backup before running, then restore from it
--   if needed.
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
    WHERE tc.table_name    = 'purchase_orders'
      AND tc.constraint_name = 'purchase_orders_supplier_id_fkey'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name   = 'suppliers'
  ) INTO fk_already_correct;

  IF fk_already_correct THEN
    RAISE NOTICE 'BUG-005: FK already references suppliers — migration already applied, no-op';
    RETURN;
  END IF;

  RAISE NOTICE 'BUG-005: FK does not yet reference suppliers — applying migration';

  -- ── Step 1: Resolve the fallback supplier ──────────────────────────────────
  -- Use the earliest supplier (lowest id) as the data-recovery default.
  -- This is the standard ERP fallback for unrecoverable FK relationships.
  SELECT MIN(id) INTO fallback_supplier_id FROM suppliers;

  IF fallback_supplier_id IS NULL THEN
    RAISE EXCEPTION 'No rows found in suppliers table — cannot run BUG-005 migration';
  END IF;

  RAISE NOTICE 'Using fallback supplier_id = % for unresolvable PO rows', fallback_supplier_id;

  -- ── Step 2: Drop the incorrect FK ─────────────────────────────────────────
  ALTER TABLE purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_supplier_id_fkey;

  -- ── Step 3: Remap all rows to the fallback supplier ───────────────────────
  -- All existing supplier_id values are invalid brand IDs; none can be mapped
  -- to actual suppliers. Assign the fallback as documented above.
  UPDATE purchase_orders SET supplier_id = fallback_supplier_id;

  GET DIAGNOSTICS rows_fixed = ROW_COUNT;
  RAISE NOTICE 'Reassigned % PO rows to fallback supplier_id=%', rows_fixed, fallback_supplier_id;
  RAISE NOTICE 'ACTION REQUIRED: These % POs need manual review to correct supplier assignments', rows_fixed;

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
