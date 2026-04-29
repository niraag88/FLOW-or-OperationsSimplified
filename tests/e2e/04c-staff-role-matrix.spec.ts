/**
 * Staff role matrix (Task #370, RF-7B)
 *
 * Proves that the Staff role is now explicitly bounded at the route level.
 * The single authoritative matrix lives in replit.md ("Explicit Staff Role
 * Matrix (Task #370, RF-7B)") — see that section for the canonical list of
 * Staff-allowed and Admin/Manager-only write routes. This file exercises a
 * representative probe for each entry in that matrix.
 *
 * For routes the matrix marks Staff-allowed we assert status !== 401/403 —
 * a 400 from the validator still proves the gate accepted the Staff session
 * and handed off to the handler, which is exactly what this test guards
 * against (a future refactor that accidentally re-clamps these to
 * Admin/Manager would surface here as a 403). For routes the matrix marks
 * Staff-forbidden we assert an exact 403 so any regression that re-opens
 * them to Staff fails loudly.
 *
 * Self-provisions a dedicated Staff user (`staff_matrix_test`) and cleans it
 * up afterwards so this spec is independent of any other test file.
 */

import { test, expect } from '@playwright/test';
import { ADMIN, BASE_URL } from './helpers';
import { USER_DELETE_PHRASE } from '../../shared/destructiveActionPhrases';

const STAFF_USERNAME = 'staff_matrix_test';
const STAFF_PASSWORD = 'StaffMatrix123!';

async function loginCookie(username: string, password: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (resp.status !== 200) {
    throw new Error(`Login as ${username} failed: ${resp.status}`);
  }
  const cookie = resp.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!cookie) throw new Error(`No session cookie returned for ${username}`);
  return cookie;
}

async function api(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  cookie: string,
  body?: object,
): Promise<{ status: number }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: resp.status };
}

test.describe('Staff role matrix (Task #370)', () => {
  let adminCookie = '';
  let staffCookie = '';
  let staffUserId = '';

  // Admin-created fixtures the Staff session probes against.
  let fixtureBrandId = 0;
  let fixtureSupplierId = 0;
  let fixtureProductId = 0;
  let fixtureCustomerId = 0;
  let fixtureInvoiceId = 0;
  let fixtureDoId = 0;
  let fixtureQuotationId = 0;
  let fixtureStockCountId = 0;

  test.beforeAll(async () => {
    adminCookie = await loginCookie(ADMIN.username, ADMIN.password);

    // Clean up leftover staff user from a previous interrupted run.
    const listResp = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: adminCookie } });
    const listData = (await listResp.json()) as { users?: Array<{ id: string; username: string }> };
    const existing = (listData.users ?? []).find((u) => u.username === STAFF_USERNAME);
    if (existing) {
      await api('DELETE', `/api/users/${existing.id}`, adminCookie, { confirmation: USER_DELETE_PHRASE });
    }

    // Provision the Staff fixture user.
    const createResp = await fetch(`${BASE_URL}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        username: STAFF_USERNAME,
        password: STAFF_PASSWORD,
        role: 'Staff',
        firstName: 'Staff',
        lastName: 'Matrix',
        email: 'staff.matrix@audit.test',
      }),
    });
    if (createResp.status !== 201) {
      const text = await createResp.text().catch(() => '');
      throw new Error(`Failed to create Staff fixture user: ${createResp.status} ${text}`);
    }
    const created = (await createResp.json()) as { user?: { id: string } };
    staffUserId = created.user?.id ?? '';
    expect(staffUserId).toBeTruthy();

    staffCookie = await loginCookie(STAFF_USERNAME, STAFF_PASSWORD);

    // Build admin-side fixtures the staff probes will read or attempt to mutate.
    // Every fixture create asserts 201 and fails fast with the response body
    // if the seed step itself broke — otherwise downstream URLs would silently
    // become `/api/.../undefined` and the test would still pass for the wrong
    // reason (gate runs before route-param parsing).
    const stamp = Date.now();

    async function adminPost<T extends { id: number }>(path: string, body: unknown): Promise<T> {
      const resp = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (resp.status !== 201) {
        throw new Error(`Fixture POST ${path} → ${resp.status}: ${text.slice(0, 500)}`);
      }
      return JSON.parse(text) as T;
    }

    fixtureBrandId = (await adminPost<{ id: number }>('/api/brands', { name: `RF7B Brand ${stamp}` })).id;

    fixtureSupplierId = (await adminPost<{ id: number }>('/api/suppliers', { name: `RF7B Supplier ${stamp}` })).id;

    fixtureProductId = (await adminPost<{ id: number }>('/api/products', {
      sku: `RF7B-SKU-${stamp}`,
      name: `RF7B Product ${stamp}`,
      brandId: fixtureBrandId,
      unitPrice: '100.00',
      stockQuantity: 100,
    })).id;

    fixtureCustomerId = (await adminPost<{ id: number }>('/api/customers', {
      name: `RF7B Customer ${stamp}`,
      dataSource: 'e2e_test',
    })).id;

    const items = [{
      product_id: fixtureProductId,
      product_code: `RF7B-SKU-${stamp}`,
      description: `RF7B Product ${stamp}`,
      quantity: 1,
      unit_price: 100,
      line_total: 100,
    }];

    // Submitted invoice — process-sale + cancel paths require non-draft.
    fixtureInvoiceId = (await adminPost<{ id: number }>('/api/invoices', {
      customer_id: fixtureCustomerId,
      invoice_date: '2026-04-01',
      status: 'submitted',
      items,
    })).id;

    // Submitted DO — cancel is allowed only on submitted/delivered.
    fixtureDoId = (await adminPost<{ id: number }>('/api/delivery-orders', {
      customer_id: fixtureCustomerId,
      order_date: '2026-04-01',
      status: 'submitted',
      items,
    })).id;

    // Quotation route uses camelCase `customerId`; mismatch would 400 before
    // the gate is exercised. See server/routes/quotations.ts POST precheck.
    fixtureQuotationId = (await adminPost<{ id: number }>('/api/quotations', {
      customerId: fixtureCustomerId,
      quoteDate: '2026-04-01',
      validUntil: '2026-05-01',
      status: 'submitted',
      items,
    })).id;

    // A stock-count whose every item matches current stock — produces no
    // adjustment movement so the DELETE branch is reachable. The DELETE
    // probe here will still 403 for staff before any handler logic runs.
    fixtureStockCountId = (await adminPost<{ id: number }>('/api/stock-counts', {
      items: [{
        product_id: fixtureProductId,
        product_code: `RF7B-SKU-${stamp}`,
        product_name: `RF7B Product ${stamp}`,
        brand_name: `RF7B Brand ${stamp}`,
        size: '',
        quantity: 100,
      }],
    })).id;

    expect(fixtureBrandId).toBeGreaterThan(0);
    expect(fixtureSupplierId).toBeGreaterThan(0);
    expect(fixtureProductId).toBeGreaterThan(0);
    expect(fixtureCustomerId).toBeGreaterThan(0);
    expect(fixtureInvoiceId).toBeGreaterThan(0);
    expect(fixtureDoId).toBeGreaterThan(0);
    expect(fixtureQuotationId).toBeGreaterThan(0);
    expect(fixtureStockCountId).toBeGreaterThan(0);
  });

  test.afterAll(async () => {
    // Best-effort fixture cleanup — order matters because of FKs.
    if (fixtureInvoiceId) await api('DELETE', `/api/invoices/${fixtureInvoiceId}`, adminCookie);
    if (fixtureDoId) await api('DELETE', `/api/delivery-orders/${fixtureDoId}`, adminCookie);
    if (fixtureQuotationId) await api('DELETE', `/api/quotations/${fixtureQuotationId}`, adminCookie);
    if (fixtureStockCountId) await api('DELETE', `/api/stock-counts/${fixtureStockCountId}`, adminCookie);
    if (fixtureCustomerId) await api('DELETE', `/api/customers/${fixtureCustomerId}`, adminCookie);
    if (fixtureProductId) await api('DELETE', `/api/products/${fixtureProductId}`, adminCookie);
    if (fixtureBrandId) await api('DELETE', `/api/brands/${fixtureBrandId}`, adminCookie);
    if (fixtureSupplierId) await api('DELETE', `/api/suppliers/${fixtureSupplierId}`, adminCookie);
    if (staffUserId && adminCookie) {
      await api('DELETE', `/api/users/${staffUserId}`, adminCookie, { confirmation: USER_DELETE_PHRASE });
    }
  });

  // ── ALLOWED for Staff (the gate must NOT short-circuit at 401/403) ──────
  //
  // We deliberately don't insist on 200/201 — a downstream 400 from the
  // validator still proves the auth gate let staff through, which is the
  // contract this spec defends. The "create" probes use real bodies and
  // expect 201; the "update" probes use minimal bodies that exercise the
  // gate without mutating committed totals.

  test('Staff can POST /api/customers (201)', async () => {
    const stamp = Date.now();
    const r = await api('POST', '/api/customers', staffCookie, {
      name: `Staff Created Customer ${stamp}`,
      dataSource: 'e2e_test',
    });
    expect(r.status).toBe(201);
  });

  test('Staff can PUT /api/customers/:id (gate accepts → not 403)', async () => {
    const r = await api('PUT', `/api/customers/${fixtureCustomerId}`, staffCookie, {
      contactPerson: 'Staff Edit',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can POST /api/invoices (201)', async () => {
    const r = await api('POST', '/api/invoices', staffCookie, {
      customer_id: fixtureCustomerId,
      invoice_date: '2026-04-15',
      status: 'draft',
      items: [{
        product_id: fixtureProductId,
        product_code: 'STAFF-INV',
        description: 'Staff Created',
        quantity: 1,
        unit_price: 50,
        line_total: 50,
      }],
    });
    expect(r.status).toBe(201);
  });

  test('Staff can PUT /api/invoices/:id (gate accepts → not 403)', async () => {
    const r = await api('PUT', `/api/invoices/${fixtureInvoiceId}`, staffCookie, {
      notes: 'Staff edit',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can PATCH /api/invoices/:id/cancel (gate accepts → not 403)', async () => {
    // Don't actually cancel the shared fixture — hit a non-existent id so
    // the call falls through to 404. Auth still runs first; 403 here would
    // mean the gate regressed. We avoid mutating the fixture invoice so
    // the process-sale forbidden test still has a valid target.
    const r = await api('PATCH', '/api/invoices/999999/cancel', staffCookie, {});
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can PATCH /api/invoices/:id/scan-key (gate accepts → not 403)', async () => {
    const r = await api('PATCH', `/api/invoices/${fixtureInvoiceId}/scan-key`, staffCookie, {
      scanKey: 'invoices/staff-test.pdf',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can DELETE /api/invoices/:id/scan-key (gate accepts → not 403)', async () => {
    // Drive against a non-existent id so we don't disturb fixture state.
    const r = await api('DELETE', '/api/invoices/999999/scan-key', staffCookie);
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can POST /api/invoices/from-quotation (gate accepts → not 403)', async () => {
    // Empty body → handler returns 400 ("quotationId is required"); 403
    // here would mean the gate regressed and clamped Staff out.
    const r = await api('POST', '/api/invoices/from-quotation', staffCookie, {});
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can PATCH /api/invoices/:id/payment (gate accepts → not 403)', async () => {
    const r = await api('PATCH', `/api/invoices/${fixtureInvoiceId}/payment`, staffCookie, {
      paymentStatus: 'unpaid',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can POST /api/delivery-orders (201)', async () => {
    const r = await api('POST', '/api/delivery-orders', staffCookie, {
      customer_id: fixtureCustomerId,
      order_date: '2026-04-15',
      status: 'draft',
      items: [{
        product_id: fixtureProductId,
        product_code: 'STAFF-DO',
        description: 'Staff Created',
        quantity: 1,
        unit_price: 50,
        line_total: 50,
      }],
    });
    expect(r.status).toBe(201);
  });

  test('Staff can PUT /api/delivery-orders/:id (gate accepts → not 403)', async () => {
    const r = await api('PUT', `/api/delivery-orders/${fixtureDoId}`, staffCookie, {
      notes: 'Staff edit',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can PATCH /api/delivery-orders/:id/scan-key (gate accepts → not 403)', async () => {
    const r = await api('PATCH', `/api/delivery-orders/${fixtureDoId}/scan-key`, staffCookie, {
      scanKey: 'delivery/staff-test.pdf',
    });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can DELETE /api/delivery-orders/:id/scan-key (gate accepts → not 403)', async () => {
    // Drive against a non-existent id so we don't disturb fixture state.
    const r = await api('DELETE', '/api/delivery-orders/999999/scan-key', staffCookie);
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can PATCH /api/delivery-orders/:id/cancel (gate accepts → not 403)', async () => {
    // Drive against a non-existent id so we don't consume the fixture DO
    // (which the FORBIDDEN DELETE test still needs as a target). Gate runs
    // before the 404 lookup, so 403 here would mean Staff was wrongly
    // clamped out of the cancel flow.
    const r = await api('PATCH', '/api/delivery-orders/999999/cancel', staffCookie, {});
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  test('Staff can POST /api/quotations (201)', async () => {
    const r = await api('POST', '/api/quotations', staffCookie, {
      customerId: fixtureCustomerId,
      quoteDate: '2026-04-15',
      validUntil: '2026-05-15',
      status: 'draft',
      items: [{
        product_id: fixtureProductId,
        product_code: 'STAFF-QT',
        description: 'Staff Created',
        quantity: 1,
        unit_price: 50,
        line_total: 50,
      }],
    });
    expect(r.status).toBe(201);
  });

  test('Staff can PATCH /api/quotations/:id/convert (gate accepts → not 403)', async () => {
    // Drive against a non-existent id so we don't consume the fixture
    // quotation. Gate must run before the 404, so 403 here would regress.
    const r = await api('PATCH', '/api/quotations/999999/convert', staffCookie, {});
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });

  // ── FORBIDDEN for Staff (must be exactly 403) ───────────────────────────

  test('Staff CANNOT POST /api/brands (403)', async () => {
    const r = await api('POST', '/api/brands', staffCookie, { name: `Staff Forbidden ${Date.now()}` });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT PUT /api/brands/:id (403)', async () => {
    const r = await api('PUT', `/api/brands/${fixtureBrandId}`, staffCookie, { name: 'Staff Edit' });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/brands/:id (403)', async () => {
    const r = await api('DELETE', `/api/brands/${fixtureBrandId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/suppliers (403)', async () => {
    const r = await api('POST', '/api/suppliers', staffCookie, { name: `Staff Forbidden ${Date.now()}` });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT PUT /api/suppliers/:id (403)', async () => {
    const r = await api('PUT', `/api/suppliers/${fixtureSupplierId}`, staffCookie, { name: 'Staff Edit' });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/suppliers/:id (403)', async () => {
    const r = await api('DELETE', `/api/suppliers/${fixtureSupplierId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/products (403)', async () => {
    const r = await api('POST', '/api/products', staffCookie, {
      sku: `STAFF-${Date.now()}`,
      name: 'Staff Forbidden',
      brandId: fixtureBrandId,
      unitPrice: '1.00',
    });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT PUT /api/products/:id (403)', async () => {
    const r = await api('PUT', `/api/products/${fixtureProductId}`, staffCookie, { name: 'Staff Edit' });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/products/:id (403)', async () => {
    const r = await api('DELETE', `/api/products/${fixtureProductId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/products/bulk (403)', async () => {
    const r = await api('POST', '/api/products/bulk', staffCookie, { rows: [] });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/products/:id/adjust-stock (403)', async () => {
    const r = await api('POST', `/api/products/${fixtureProductId}/adjust-stock`, staffCookie, {
      adjustmentType: 'increase',
      quantity: 1,
      reason: 'staff probe',
    });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/stock-movements/bulk (403)', async () => {
    const r = await api('POST', '/api/stock-movements/bulk', staffCookie, {
      movements: [{ productId: fixtureProductId, quantity: 1, movementType: 'adjustment' }],
    });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/stock-counts (403)', async () => {
    const r = await api('POST', '/api/stock-counts', staffCookie, {
      items: [{ product_id: fixtureProductId, product_code: 'X', product_name: 'X', quantity: 1 }],
    });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/stock-counts/:id (403)', async () => {
    const r = await api('DELETE', `/api/stock-counts/${fixtureStockCountId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/customers/:id (403)', async () => {
    const r = await api('DELETE', `/api/customers/${fixtureCustomerId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/delivery-orders/:id (403)', async () => {
    const r = await api('DELETE', `/api/delivery-orders/${fixtureDoId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT POST /api/invoices/:id/process-sale (403)', async () => {
    const r = await api('POST', `/api/invoices/${fixtureInvoiceId}/process-sale`, staffCookie, {});
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/invoices/:id (403)', async () => {
    const r = await api('DELETE', `/api/invoices/${fixtureInvoiceId}`, staffCookie);
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT PUT /api/quotations/:id (403)', async () => {
    const r = await api('PUT', `/api/quotations/${fixtureQuotationId}`, staffCookie, { notes: 'Staff Edit' });
    expect(r.status).toBe(403);
  });

  test('Staff CANNOT DELETE /api/quotations/:id (403)', async () => {
    const r = await api('DELETE', `/api/quotations/${fixtureQuotationId}`, staffCookie);
    expect(r.status).toBe(403);
  });
});
