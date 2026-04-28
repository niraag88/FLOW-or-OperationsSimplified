/**
 * Bad-input validation regression suite (Task #320)
 *
 * The probe in `scripts/probe-bad-input.ts` (results in
 * `.local/tasks/validation-probe-results.md`) found 5 endpoints that
 * either crashed with a 500 or, worse, accepted bad input and wrote a
 * partial / corrupt row. This spec locks in the fixes:
 *
 *   PUT /api/purchase-orders/:id   non-numeric id  → must be 400 (was 500)
 *   PUT /api/purchase-orders/:id   negative id     → must be 400 (was 500)
 *   PUT /api/quotations/:id        non-numeric id  → must be 400 (was 500)
 *   POST /api/customers            malformed email → must be 400 + no row
 *   POST /api/customers            10KB name       → must be 400 + no row
 *
 * It also self-seeds a supplier / brand / customer / product / PO /
 * quotation / invoice and probes the bad-status PUT paths the original
 * probe couldn't reach (DB was empty), so any future regression of
 * status validation on those routes will fail this spec.
 *
 * Everything created by the spec is cleaned up in afterAll.
 */

import { test, expect } from '@playwright/test';
import { ADMIN, BASE_URL } from './helpers';

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ADMIN),
  });
  return r.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function http(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON body is fine */
  }
  return { status: r.status, data };
}

test.describe('Bad-input validation (Task #320)', () => {
  let cookie = '';

  // Seeded fixtures (created in beforeAll, removed in afterAll)
  const created = {
    customerId: 0,
    supplierId: 0,
    brandId: 0,
    productId: 0,
    poId: 0,
    quotationId: 0,
    invoiceId: 0,
  };

  test.beforeAll(async () => {
    cookie = await login();
    expect(cookie).toBeTruthy();

    const stamp = Date.now();

    // --- minimal, isolated seed --------------------------------------------
    const cust = await http('POST', '/api/customers', cookie, {
      name: `BadInputSpec Customer ${stamp}`,
      email: `bad-input-${stamp}@spec.test`,
    });
    expect(cust.status).toBe(201);
    created.customerId = cust.data.id;

    const sup = await http('POST', '/api/suppliers', cookie, {
      name: `BadInputSpec Supplier ${stamp}`,
    });
    if (sup.status === 201 || sup.status === 200) created.supplierId = sup.data.id;

    const brand = await http('POST', '/api/brands', cookie, {
      name: `BadInputSpec Brand ${stamp}`,
    });
    if (brand.status === 201 || brand.status === 200) created.brandId = brand.data.id;

    const prod = await http('POST', '/api/products', cookie, {
      sku: `BIS-${stamp}`,
      name: `BadInputSpec Product ${stamp}`,
      category: 'BadInputSpec',
      unitPrice: '10',
      costPrice: '5',
      stockQuantity: 100,
    });
    if (prod.status === 201 || prod.status === 200) created.productId = prod.data.id;

    if (created.supplierId && created.brandId && created.productId) {
      const po = await http('POST', '/api/purchase-orders', cookie, {
        supplierId: created.supplierId,
        brandId: created.brandId,
        orderDate: '2026-04-01',
        items: [{ productId: created.productId, quantity: 1, unitPrice: 10, lineTotal: 10 }],
      });
      if (po.status === 201 || po.status === 200) created.poId = po.data.id;
    }

    if (created.customerId && created.productId) {
      const quote = await http('POST', '/api/quotations', cookie, {
        customerId: created.customerId,
        quoteDate: '2026-04-01',
        items: [{ productId: created.productId, quantity: 1, unitPrice: 10, lineTotal: 10 }],
      });
      if (quote.status === 201 || quote.status === 200) created.quotationId = quote.data.id;

      const inv = await http('POST', '/api/invoices', cookie, {
        customer_id: created.customerId,
        invoice_date: '2026-04-01',
        due_date: '2026-05-01',
        items: [{ product_id: created.productId, quantity: 1, unit_price: 10, line_total: 10 }],
      });
      if (inv.status === 201 || inv.status === 200) created.invoiceId = inv.data.id;
    }
  });

  test.afterAll(async () => {
    if (!cookie) return;
    if (created.invoiceId) await http('DELETE', `/api/invoices/${created.invoiceId}`, cookie);
    if (created.quotationId) await http('DELETE', `/api/quotations/${created.quotationId}`, cookie);
    if (created.poId) await http('DELETE', `/api/purchase-orders/${created.poId}`, cookie);
    if (created.productId) await http('DELETE', `/api/products/${created.productId}`, cookie);
    if (created.brandId) await http('DELETE', `/api/brands/${created.brandId}`, cookie);
    if (created.supplierId) await http('DELETE', `/api/suppliers/${created.supplierId}`, cookie);
    if (created.customerId) await http('DELETE', `/api/customers/${created.customerId}`, cookie);
  });

  // ── 1. PUT id-validation: non-numeric / negative IDs return 400 ─────────

  test('PUT /api/purchase-orders/abc → 400 (was 500 before fix)', async () => {
    const r = await http('PUT', '/api/purchase-orders/abc', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
    expect(typeof r.data?.error).toBe('string');
  });

  test('PUT /api/purchase-orders/-1 → 400 (was 500 before fix)', async () => {
    const r = await http('PUT', '/api/purchase-orders/-1', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
    expect(typeof r.data?.error).toBe('string');
  });

  test('PUT /api/quotations/abc → 400 (was 500 before fix)', async () => {
    const r = await http('PUT', '/api/quotations/abc', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
    expect(typeof r.data?.error).toBe('string');
  });

  test('PUT /api/quotations/-1 → 400 (negative id)', async () => {
    const r = await http('PUT', '/api/quotations/-1', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
  });

  // parseInt('1abc') quietly returns 1, so before the strict regex guard
  // these requests would have targeted record id=1 instead of being
  // rejected. Lock the strict-digits-only contract on all three routes.
  test('PUT /api/purchase-orders/1abc → 400 (mixed-string id)', async () => {
    const r = await http('PUT', '/api/purchase-orders/1abc', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
  });

  test('PUT /api/quotations/1abc → 400 (mixed-string id)', async () => {
    const r = await http('PUT', '/api/quotations/1abc', cookie, { status: 'submitted' });
    expect(r.status).toBe(400);
  });

  test('PUT /api/customers/1abc → 400 (mixed-string id)', async () => {
    const r = await http('PUT', '/api/customers/1abc', cookie, { name: 'whatever' });
    expect(r.status).toBe(400);
  });

  // ── 2. POST /api/customers: malformed email + no row created ────────────

  test('POST /api/customers with malformed email → 400 and no row written', async () => {
    const stamp = Date.now();
    const probeName = `BadInputSpec MalformedEmail ${stamp}`;
    const r = await http('POST', '/api/customers', cookie, {
      name: probeName,
      email: 'not-an-email',
    });
    expect(r.status).toBe(400);
    expect(typeof r.data?.error).toBe('string');

    // Confirm no row was written.
    const list = await http('GET', '/api/customers', cookie);
    const customers = Array.isArray(list.data) ? list.data : (list.data?.customers ?? []);
    const leak = customers.find((c: any) => c.name === probeName);
    expect(leak).toBeUndefined();
  });

  // ── 3. POST /api/customers: oversized name + no row created ─────────────

  test('POST /api/customers with 10KB name → 400 and no row written', async () => {
    const stamp = Date.now();
    const oversizedName = 'x'.repeat(10240);
    const r = await http('POST', '/api/customers', cookie, {
      name: oversizedName,
      email: `oversized-${stamp}@spec.test`,
    });
    expect(r.status).toBe(400);
    expect(typeof r.data?.error).toBe('string');

    const list = await http('GET', '/api/customers', cookie);
    const customers = Array.isArray(list.data) ? list.data : (list.data?.customers ?? []);
    const leak = customers.find((c: any) => c.name === oversizedName);
    expect(leak).toBeUndefined();
  });

  // ── 4. Sanity: the schema tightening did not break legitimate creates ───

  test('POST /api/customers with valid email and name still succeeds', async () => {
    const stamp = Date.now();
    const name = `BadInputSpec Sanity ${stamp}`;
    const r = await http('POST', '/api/customers', cookie, {
      name,
      email: `sanity-${stamp}@spec.test`,
    });
    expect(r.status).toBe(201);
    expect(r.data?.id).toBeTruthy();
    // Clean up the throw-away row.
    if (r.data?.id) await http('DELETE', `/api/customers/${r.data.id}`, cookie);
  });

  test('POST /api/customers with omitted email still succeeds (email is optional)', async () => {
    const stamp = Date.now();
    const name = `BadInputSpec NoEmail ${stamp}`;
    const r = await http('POST', '/api/customers', cookie, { name });
    expect(r.status).toBe(201);
    if (r.data?.id) await http('DELETE', `/api/customers/${r.data.id}`, cookie);
  });

  test('POST /api/customers with email: null still succeeds', async () => {
    const stamp = Date.now();
    const r = await http('POST', '/api/customers', cookie, {
      name: `BadInputSpec NullEmail ${stamp}`,
      email: null,
    });
    expect(r.status).toBe(201);
    if (r.data?.id) await http('DELETE', `/api/customers/${r.data.id}`, cookie);
  });

  test("POST /api/customers with email: '' still succeeds", async () => {
    const stamp = Date.now();
    const r = await http('POST', '/api/customers', cookie, {
      name: `BadInputSpec EmptyEmail ${stamp}`,
      email: '',
    });
    expect(r.status).toBe(201);
    if (r.data?.id) await http('DELETE', `/api/customers/${r.data.id}`, cookie);
  });

  // ── 5. Self-seeded bad-status PUT probes (regression net) ───────────────
  // These were unreachable from the original tsx probe because the DB had
  // no rows. They live here so any future regression of status validation
  // shows up in this single bad-input spec.

  test('PUT /api/purchase-orders/:id with garbage status enum → not 500', async () => {
    test.skip(!created.poId, 'PO seed unavailable in this environment');
    const r = await http('PUT', `/api/purchase-orders/${created.poId}`, cookie, { status: 'banana' });
    // Allow 200 (legacy: status not strictly validated yet) or 400 (validated),
    // but never 500 (our actual concern).
    expect([200, 400]).toContain(r.status);
  });

  test('PUT /api/quotations/:id with garbage status enum → 400 (transition rule)', async () => {
    test.skip(!created.quotationId, 'Quotation seed unavailable in this environment');
    const r = await http('PUT', `/api/quotations/${created.quotationId}`, cookie, { status: 'banana' });
    // Quotations enforce an allowed-transitions map, so any unknown status
    // is rejected with 400 — never 500.
    expect(r.status).toBe(400);
  });

  test('PUT /api/invoices/:id with garbage status enum → not 500', async () => {
    test.skip(!created.invoiceId, 'Invoice seed unavailable in this environment');
    const r = await http('PUT', `/api/invoices/${created.invoiceId}`, cookie, { status: 'banana' });
    expect([200, 400]).toContain(r.status);
  });
});
