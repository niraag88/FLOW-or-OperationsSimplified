/**
 * Task #421 (B4) — header totals on the Quotations list.
 *
 * Regression guard for the bug where a newly-created quotation showed
 * AED 0.00 in the list because total_amount / vat_amount / grand_total
 * stayed at their column defaults. The runtime fix aggregates from the
 * line items on every POST and PUT; this test drives the API end-to-end
 * and asserts the persisted header matches the lines.
 *
 * Despite living under tests/unit/, this file talks to a live Postgres
 * (DATABASE_URL) and the running app (TEST_BASE_URL or
 * http://localhost:5000). It is skipped when those are unavailable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

const base = process.env.TEST_BASE_URL || 'http://localhost:5000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Skip the whole file when the live app/DB aren't reachable, so this
// integration suite doesn't break local/CI unit-test runs that don't
// boot the server.
async function liveServicesAvailable(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  try {
    const r = await fetch(`${base}/api/health`, { method: 'GET' }).catch(() => null);
    if (r && r.ok) return true;
    // Fallback: any HTTP response (even 404) means the server is up.
    const r2 = await fetch(base, { method: 'GET' }).catch(() => null);
    return !!r2;
  } catch { return false; }
}
const SHOULD_SKIP = !(await liveServicesAvailable());

async function loginHeaders(): Promise<Record<string, string>> {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  if (!login.ok) throw new Error(`login failed: ${login.status}`);
  const cookie = login.headers.getSetCookie().join('; ');
  const csrfRes = await fetch(`${base}/api/auth/csrf-token`, { headers: { cookie } });
  const { csrfToken } = await csrfRes.json() as { csrfToken: string };
  const cookie2 = [cookie, ...csrfRes.headers.getSetCookie()].join('; ');
  return { 'Content-Type': 'application/json', cookie: cookie2, 'x-csrf-token': csrfToken };
}

async function pickFixtures(headers: Record<string, string>): Promise<{ customerId: number; productId: number }> {
  const c = await fetch(`${base}/api/customers?pageSize=1`, { headers: { cookie: headers.cookie } });
  const cBody = await c.json() as any;
  const customerId = (cBody.data ?? cBody)[0]?.id;
  const p = await fetch(`${base}/api/products?pageSize=1`, { headers: { cookie: headers.cookie } });
  const pBody = await p.json() as any;
  const productId = (pBody.data ?? pBody)[0]?.id;
  if (!customerId || !productId) throw new Error('fixtures (customer/product) missing');
  return { customerId, productId };
}

test('POST /api/quotations persists header totals derived from line items', { skip: SHOULD_SKIP }, async () => {
  const H = await loginHeaders();
  const { customerId, productId } = await pickFixtures(H);

  // Mixed VAT: 200 @ 5% + 50 @ 0% = subtotal 250, vat 10, grand 260.
  const res = await fetch(`${base}/api/quotations`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customerId, quoteDate: '2026-05-06', validUntil: '2026-06-06', status: 'draft',
      items: [
        { product_id: productId, quantity: 2, unit_price: '100', vat_rate: '0.05', line_total: '200' },
        { product_id: productId, quantity: 1, unit_price: '50',  vat_rate: '0',    line_total: '50'  },
      ],
    }),
  });
  if (!res.ok) assert.fail(`create failed: ${res.status} ${await res.text()}`);
  const quote = await res.json() as { id: number; quoteNumber: string };

  try {
    const { rows } = await pool.query<{ total_amount: string; vat_amount: string; grand_total: string }>(
      'SELECT total_amount, vat_amount, grand_total FROM quotations WHERE id = $1',
      [quote.id]
    );
    assert.equal(rows[0]?.total_amount, '250.00', 'subtotal must equal sum of line totals');
    assert.equal(rows[0]?.vat_amount,   '10.00',  'vat must equal sum(line_total * vat_rate)');
    assert.equal(rows[0]?.grand_total,  '260.00', 'grand total must equal subtotal + vat');
  } finally {
    await fetch(`${base}/api/quotations/${quote.id}`, { method: 'DELETE', headers: H });
  }
});

test('PUT /api/quotations/:id with new items recomputes header totals', { skip: SHOULD_SKIP }, async () => {
  const H = await loginHeaders();
  const { customerId, productId } = await pickFixtures(H);

  const res = await fetch(`${base}/api/quotations`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customerId, quoteDate: '2026-05-06', validUntil: '2026-06-06', status: 'draft',
      items: [{ product_id: productId, quantity: 1, unit_price: '100', vat_rate: '0.05', line_total: '100' }],
    }),
  });
  const quote = await res.json() as { id: number; quoteNumber: string };

  try {
    // Mixed-VAT replacement on edit: 300 @ 5% + 100 @ 0%
    //   subtotal = 400, vat = 15, grand = 415
    const put = await fetch(`${base}/api/quotations/${quote.id}`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({
        items: [
          { product_id: productId, quantity: 3, unit_price: '100', vat_rate: '0.05', line_total: '300' },
          { product_id: productId, quantity: 1, unit_price: '100', vat_rate: '0',    line_total: '100' },
        ],
      }),
    });
    if (!put.ok) assert.fail(`PUT failed: ${put.status} ${await put.text()}`);
    const putBody = await put.json() as { totalAmount?: string; vatAmount?: string; grandTotal?: string };
    assert.equal(putBody.totalAmount, '400.00', 'PUT response must include recomputed subtotal');
    assert.equal(putBody.vatAmount,   '15.00',  'PUT response must include recomputed VAT');
    assert.equal(putBody.grandTotal,  '415.00', 'PUT response must include recomputed grand total');

    const { rows } = await pool.query<{ total_amount: string; vat_amount: string; grand_total: string }>(
      'SELECT total_amount, vat_amount, grand_total FROM quotations WHERE id = $1',
      [quote.id]
    );
    assert.equal(rows[0]?.total_amount, '400.00');
    assert.equal(rows[0]?.vat_amount,   '15.00');
    assert.equal(rows[0]?.grand_total,  '415.00');
  } finally {
    await fetch(`${base}/api/quotations/${quote.id}`, { method: 'DELETE', headers: H });
  }
});

test.after(async () => { await pool.end(); });
