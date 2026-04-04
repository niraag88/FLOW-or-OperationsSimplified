-- Task #151 — Product size column data backfill
--
-- CONTEXT:
--   The `products` table has two text columns:
--     • `description` — general product description
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
--
-- DATA BACKFILL:
--   This script moves size values from `description` into `size`
--   for all existing products where the migration has not yet been
--   applied. It is idempotent — safe to run multiple times.
--
-- ALREADY APPLIED to this environment's database during Task #151.
-- Run again only if re-seeding or restoring from a pre-task backup.

UPDATE products
SET size = description
WHERE size IS NULL
  AND description IS NOT NULL
  AND description <> '';
