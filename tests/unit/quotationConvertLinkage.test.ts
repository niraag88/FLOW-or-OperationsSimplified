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

/**
 * End-to-end regression for the actual UI conversion path:
 *   1. create a quote via POST /api/quotations
 *   2. create an invoice via POST /api/invoices with the same payload
 *      shape that `normalizeDocumentToInvoice` (Invoices.tsx) produces
 *      when the source document is a quotation — i.e. with
 *      `reference = quoteNumber`
 *   3. PATCH /api/quotations/:id/convert {invoiceId}
 *   4. assert the quote is now 'converted' and that the invoice still
 *      satisfies the linkage invariant
 *
 * Skipped when API_BASE_URL is not reachable (e.g. CI without a server).
 */
test('UI conversion flow flips quote to converted and preserves linkage', async (t) => {
  const base = process.env.API_BASE_URL || 'http://localhost:5000';
  const adminPw = process.env.ADMIN_PASSWORD || 'admin123';

  const cookies: string[] = [];
  const collect = (res: Response) => {
    const sc = res.headers.get('set-cookie');
    if (sc) cookies.push(...sc.split(/,(?=[^;]+=)/).map((s) => s.split(';')[0].trim()));
  };
  const cookieHeader = () => cookies.join('; ');

  // Login first (login route is csrf-exempt; csrf-token route requires auth).
  let loginRes: Response;
  try {
    loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: adminPw }),
    });
  } catch {
    return t.skip(`server not reachable at ${base}`);
  }
  if (!loginRes.ok) return t.skip(`login failed (${loginRes.status}) — server not configured for this test`);
  collect(loginRes);

  const csrfRes = await fetch(`${base}/api/auth/csrf-token`, { headers: { Cookie: cookieHeader() } });
  collect(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const apiHeaders = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    Cookie: cookieHeader(),
  };

  // Need an existing customer + product. Pick the first of each.
  const [{ rows: cRows }, { rows: pRows }] = await Promise.all([
    pool.query<{ id: number }>('SELECT id FROM customers ORDER BY id LIMIT 1'),
    pool.query<{ id: number }>('SELECT id FROM products ORDER BY id LIMIT 1'),
  ]);
  if (cRows.length === 0 || pRows.length === 0) {
    return t.skip('no customer/product in DB to drive the flow');
  }
  const customerId = cRows[0].id;
  const productId = pRows[0].id;

  // 1) Create quote
  const qRes = await fetch(`${base}/api/quotations`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      customerId,
      quoteDate: '2026-05-06',
      validUntil: '2026-06-06',
      status: 'draft',
      items: [{ productId, quantity: 1, unitPrice: '50', vatRate: '0.05', lineTotal: '50' }],
    }),
  });
  assert.equal(qRes.ok, true, `quote create failed: ${qRes.status}`);
  const quote = (await qRes.json()) as { id: number; quoteNumber: string };

  // 2) Create invoice the way the UI normalizer does it for a quotation source
  const iRes = await fetch(`${base}/api/invoices`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      customer_id: customerId,
      invoice_date: '2026-05-06',
      reference: quote.quoteNumber, // ← critical: matches what normalizer now sets
      status: 'draft',
      items: [{ product_id: productId, quantity: 1, unit_price: 50 }],
    }),
  });
  assert.equal(iRes.ok, true, `invoice create failed: ${iRes.status}`);
  const invoice = (await iRes.json()) as { id: number; invoiceNumber: string };

  // 3) Convert
  const convRes = await fetch(`${base}/api/quotations/${quote.id}/convert`, {
    method: 'PATCH',
    headers: apiHeaders,
    body: JSON.stringify({ invoiceId: invoice.id }),
  });
  assert.equal(convRes.ok, true, `convert failed: ${convRes.status} ${await convRes.text()}`);

  // 4) Assert resulting state
  const { rows: finalRows } = await pool.query<{ status: string }>(
    'SELECT status FROM quotations WHERE id = $1',
    [quote.id]
  );
  assert.equal(finalRows[0]?.status, 'converted');

  const { rows: linkRows } = await pool.query<{ id: number }>(
    `SELECT id FROM invoices
      WHERE customer_id = $1 AND TRIM(COALESCE(reference,'')) = $2`,
    [customerId, quote.quoteNumber]
  );
  assert.ok(linkRows.length >= 1, 'expected at least one linked invoice after convert');

  // Cleanup test rows so the invariant test stays clean
  await pool.query('DELETE FROM invoice_line_items WHERE invoice_id = $1', [invoice.id]);
  await pool.query('DELETE FROM invoices WHERE id = $1', [invoice.id]);
  await pool.query('DELETE FROM quotation_items WHERE quote_id = $1', [quote.id]);
  await pool.query('DELETE FROM quotations WHERE id = $1', [quote.id]);
});

test.after(async () => {
  await pool.end();
});
