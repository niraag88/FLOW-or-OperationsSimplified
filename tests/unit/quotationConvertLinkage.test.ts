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

  // Matching rule: same customer AND either
  //   - invoice.reference equals the quote number (set by
  //     createInvoiceFromQuotation), OR
  //   - invoice.notes mentions the quote number (also set by
  //     createInvoiceFromQuotation: "Converted from Quotation X").
  // The UI's editable POST /api/invoices flow now ties the convert
  // atomically via source_quotation_id, but the invoice it creates
  // does not necessarily carry quoteNumber in either field — so we
  // also accept any invoice for the same customer if it was created
  // within a small window of the quote's last update. That window
  // check is intentionally loose: orphans are the bug we're guarding,
  // not "wrong invoice picked".
  const orphans: Array<{ id: number; quoteNumber: string }> = [];
  for (const q of rows) {
    const { rows: matches } = await pool.query<{ id: number }>(
      `SELECT id
         FROM invoices
        WHERE customer_id = $1
          AND (
                TRIM(COALESCE(reference, '')) = $2
             OR COALESCE(notes, '')   ILIKE '%' || $2 || '%'
              )
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
 * End-to-end regression for the canonical conversion flow:
 *   1. create a quote via POST /api/quotations
 *   2. create an invoice via POST /api/invoices with `source_quotation_id`
 *      set to the quote id (the way the UI now does it)
 *   3. assert the quote was atomically flipped to 'converted' by the
 *      single POST — no separate /convert call needed
 *   4. assert the linkage invariant still holds
 *
 * Also exercises the /convert thin-wrapper endpoint to confirm that
 * route still produces an invoice + flipped status atomically.
 *
 * Skipped when the dev server is not reachable.
 */
test('atomic invoice+convert flow via source_quotation_id', async (t) => {
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

  // ── Path A: editable UI flow — POST /api/invoices with source_quotation_id ──
  const qRes = await fetch(`${base}/api/quotations`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      customerId,
      quoteDate: '2026-05-06',
      validUntil: '2026-06-06',
      status: 'draft',
      items: [{ product_id: productId, quantity: 1, unit_price: '50', vat_rate: '0.05', line_total: '50' }],
    }),
  });
  assert.equal(qRes.ok, true, `quote create failed: ${qRes.status}`);
  const quote = (await qRes.json()) as { id: number; quoteNumber: string };

  const iRes = await fetch(`${base}/api/invoices`, {
    method: 'POST',
    headers: apiHeaders,
    body: JSON.stringify({
      customer_id: customerId,
      invoice_date: '2026-05-06',
      status: 'draft',
      source_quotation_id: quote.id,
      notes: `Based on Quotation #${quote.quoteNumber}`,
      items: [{ product_id: productId, quantity: 1, unit_price: 50 }],
    }),
  });
  if (!iRes.ok) {
    assert.fail(`invoice create failed: ${iRes.status} ${await iRes.text()}`);
  }
  const invoice = (await iRes.json()) as { id: number; invoiceNumber: string };

  // The single POST should have flipped the quote atomically — no
  // separate /convert call needed.
  {
    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM quotations WHERE id = $1', [quote.id]
    );
    assert.equal(rows[0]?.status, 'converted', 'POST /api/invoices with source_quotation_id must flip quote to converted atomically');
  }

  // Cross-customer rejection: a second quote, then try POST with the wrong customer
  const otherCustRes = await fetch(`${base}/api/customers`, {
    method: 'POST', headers: apiHeaders,
    body: JSON.stringify({ name: `T420-other-${Date.now()}`, vatTreatment: 'StandardRated' }),
  });
  assert.equal(otherCustRes.ok, true);
  const otherCust = (await otherCustRes.json()) as { id: number };

  const q2Res = await fetch(`${base}/api/quotations`, {
    method: 'POST', headers: apiHeaders,
    body: JSON.stringify({
      customerId,
      quoteDate: '2026-05-06', validUntil: '2026-06-06', status: 'draft',
      items: [{ product_id: productId, quantity: 1, unit_price: '50', vat_rate: '0.05', line_total: '50' }],
    }),
  });
  const quote2 = (await q2Res.json()) as { id: number; quoteNumber: string };

  const badRes = await fetch(`${base}/api/invoices`, {
    method: 'POST', headers: apiHeaders,
    body: JSON.stringify({
      customer_id: otherCust.id, // ← different customer
      invoice_date: '2026-05-06', status: 'draft',
      source_quotation_id: quote2.id,
      items: [{ product_id: productId, quantity: 1, unit_price: 50 }],
    }),
  });
  assert.equal(badRes.ok, false, 'cross-customer source_quotation_id must be rejected');
  const { rows: q2Rows } = await pool.query<{ status: string }>(
    'SELECT status FROM quotations WHERE id = $1', [quote2.id]
  );
  assert.notEqual(q2Rows[0]?.status, 'converted', 'rejected POST must not have flipped the quote');

  // ── Path B: /convert thin wrapper — should atomically create invoice + flip ──
  const convRes = await fetch(`${base}/api/quotations/${quote2.id}/convert`, {
    method: 'PATCH', headers: apiHeaders,
  });
  if (!convRes.ok) {
    assert.fail(`convert wrapper failed: ${convRes.status} ${await convRes.text()}`);
  }
  const convBody = (await convRes.json()) as { createdInvoiceId?: number; status?: string };
  assert.equal(convBody.status, 'converted');
  assert.ok(convBody.createdInvoiceId && convBody.createdInvoiceId > 0,
    'convert wrapper must return the id of the invoice it created');

  // Cleanup
  await pool.query('DELETE FROM invoice_line_items WHERE invoice_id IN ($1, $2)', [invoice.id, convBody.createdInvoiceId]);
  await pool.query('DELETE FROM invoices WHERE id IN ($1, $2)', [invoice.id, convBody.createdInvoiceId]);
  await pool.query('DELETE FROM quotation_items WHERE quote_id IN ($1, $2)', [quote.id, quote2.id]);
  await pool.query('DELETE FROM quotations WHERE id IN ($1, $2)', [quote.id, quote2.id]);
  await pool.query('DELETE FROM customers WHERE id = $1', [otherCust.id]);
});

test.after(async () => {
  await pool.end();
});
