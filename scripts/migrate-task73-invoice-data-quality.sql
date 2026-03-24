-- Task #73: Fix invoice seed data quality
-- Run: psql "$DATABASE_URL" -f scripts/migrate-task73-invoice-data-quality.sql
--
-- Problem 1: 350 of 400 invoices had invalid statuses (sent/paid/overdue).
--   The app only supports: draft | submitted | delivered
--   Mapping: sent → submitted, overdue → submitted, paid → delivered
--
-- Problem 2: 352 invoices had empty reference fields.
--   Fix: derive a reference from customer name initials + invoice year + invoice number.
--
-- This script is idempotent — safe to re-run.

-- Step 1: Fix invalid statuses
UPDATE invoices SET status = 'submitted' WHERE status IN ('sent', 'overdue');
UPDATE invoices SET status = 'delivered' WHERE status = 'paid';

-- Step 2: Fill empty reference fields
UPDATE invoices
SET reference = CONCAT(
  UPPER(SUBSTRING(REGEXP_REPLACE(customer_name, '[^A-Za-z ]', '', 'g'), 1, 3)),
  '-',
  EXTRACT(YEAR FROM invoice_date::date)::text,
  '-',
  SUBSTRING(invoice_number FROM 5)
)
WHERE reference IS NULL OR reference = '';

-- Verify
SELECT
  COUNT(*) AS total,
  COUNT(CASE WHEN status NOT IN ('draft', 'submitted', 'delivered') THEN 1 END) AS invalid_status,
  COUNT(CASE WHEN reference IS NULL OR reference = '' THEN 1 END) AS empty_ref,
  COUNT(CASE WHEN status = 'draft'     THEN 1 END) AS draft_count,
  COUNT(CASE WHEN status = 'submitted' THEN 1 END) AS submitted_count,
  COUNT(CASE WHEN status = 'delivered' THEN 1 END) AS delivered_count
FROM invoices;
