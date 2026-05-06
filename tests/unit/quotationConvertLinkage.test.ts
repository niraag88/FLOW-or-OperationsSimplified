/**
 * Task #420 — invariant test for the quotation convert endpoint.
 *
 * Any quotation that ever reaches status 'converted' MUST have at
 * least one corresponding invoice that:
 *   - belongs to the same customer, AND
 *   - references the quote by its quoteNumber.
 *
 * This guards bug B5 from regressing: previously the convert endpoint
 * happily flipped status without any matching invoice and even wrote
 * an audit log claiming "(invoice created)". The endpoint now
 * requires `invoiceId`, verifies existence + customer + reference
 * linkage, and writes an honest audit message. This test asserts
 * the resulting database invariant from a black-box perspective.
 *
 * Run with:  npx tsx --test tests/unit/quotationConvertLinkage.test.ts
 *
 * Requires DATABASE_URL to be set.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test('every converted quotation has a matching linked invoice', async () => {
  const { rows } = await pool.query<{
    id: number;
    quote_number: string;
    customer_id: number | null;
  }>(
    `SELECT id, quote_number, customer_id
       FROM quotations
      WHERE status = 'converted'`
  );

  const orphans: Array<{ id: number; quoteNumber: string }> = [];
  for (const q of rows) {
    const { rows: matches } = await pool.query<{ id: number }>(
      `SELECT id
         FROM invoices
        WHERE customer_id = $1
          AND TRIM(COALESCE(reference, '')) = $2
        LIMIT 1`,
      [q.customer_id, q.quote_number]
    );
    if (matches.length === 0) {
      orphans.push({ id: q.id, quoteNumber: q.quote_number });
    }
  }

  assert.deepEqual(
    orphans,
    [],
    `Found ${orphans.length} converted quotation(s) with no linked invoice — `
      + `the convert endpoint must never produce orphaned 'converted' rows. `
      + `Orphans: ${JSON.stringify(orphans)}`
  );
});

test.after(async () => {
  await pool.end();
});
