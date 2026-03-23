-- Task #56: Add payment_method column to invoices table
-- Run: psql "$DATABASE_URL" -f scripts/migrate-task56-invoice-payment-method.sql
-- Idempotent: safe to run multiple times.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method text;
