-- Task #151 — Product size column data backfill
--
-- CONTEXT:
--   The `products` table has two text columns:
--     • `description` — general product description (free text, separate from size)
--     • `size`        — product size (e.g. 100ml, 1kg, Pce)
--
--   Prior to this task, AddProduct.jsx and EditProduct.jsx were
--   saving the user's "Size" form field to the `description` column
--   instead of `size`. Additionally, `insertProductSchema` did not
--   include `size` in its `.pick()`, so Zod validation stripped it
--   on every API write. This left `products.size` always NULL for
--   every product in the database.
--
-- FIX APPLIED (code changes in same commit):
--   1. `insertProductSchema` now includes `size`.
--   2. AddProduct.jsx / EditProduct.jsx now write to `size`.
--   3. POForm.jsx, ProductsTab.jsx updated to read from `size`.
--   4. Bulk import route now stores `size` (not `description`).
--
-- DATA BACKFILL (idempotent — safe to run multiple times):
--
-- Step 1: copy size values from description → size for existing products
--   that haven't been migrated yet (size IS NULL but description has data).
UPDATE products
SET size = description
WHERE size IS NULL
  AND description IS NOT NULL
  AND description <> '';

-- Step 2: clear description where it was only ever used as a size alias.
--   After Step 1, all migrated rows will have description = size.
--   We clear description on those rows so the two columns are now distinct.
--   Rows where description differs from size (i.e. a real description was
--   stored alongside a pre-existing size value) are left untouched.
UPDATE products
SET description = NULL
WHERE description IS NOT NULL
  AND description = size;

-- ALREADY APPLIED to this environment's database during Task #151.
-- Run again only if re-seeding or restoring from a pre-task backup.
