import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, BASE_URL, toProductList, toPurchaseOrderList, toInvoiceList } from './helpers';

/**
 * Factory Reset spec
 *
 * Verifies that POST /api/ops/factory-reset:
 *  - Is accessible only to Admin users
 *  - Returns { ok: true } and wipes all business data
 *  - Leaves company_settings with a blank row (so the app still boots)
 *  - Leaves users table untouched (Admin session remains valid)
 *
 * NOTE: This spec runs LAST (10-) because it destroys all data.
 * If the suite is run against a production DB this test must be excluded.
 */

test.describe('Factory Reset', () => {
  let cookie: string;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('factory reset endpoint returns 401 without any auth cookie', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/factory-reset`, { method: 'POST' });
    expect(r.status).toBe(401);
  });

  test('factory reset endpoint denies access with an invalid/expired session', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { Cookie: 'connect.sid=s%3Ainvalid-session-id.bad-signature' },
    });
    expect([401, 403]).toContain(r.status);
  });

  test('factory reset endpoint succeeds for Admin and returns ok:true', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/factory reset/i);
  });

  test('after factory reset — products list is empty', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    expect(prods.length).toBe(0);
  });

  test('after factory reset — purchase orders list is empty', async () => {
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos = toPurchaseOrderList(raw);
    expect(pos.length).toBe(0);
  });

  test('after factory reset — invoices list is empty', async () => {
    const raw = await apiGet('/api/invoices', cookie);
    const invs = toInvoiceList(raw);
    expect(invs.length).toBe(0);
  });

  test('after factory reset — quotations list is empty', async () => {
    const raw = await apiGet('/api/quotations', cookie);
    const quotes = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] }).data ?? []);
    expect(quotes.length).toBe(0);
  });

  test('after factory reset — brands list is empty', async () => {
    const raw = await apiGet('/api/brands', cookie) as unknown[] | { brands?: unknown[] };
    const list = Array.isArray(raw) ? raw : ((raw as { brands?: unknown[] }).brands ?? []);
    expect(list.length).toBe(0);
  });

  test('after factory reset — customers list is empty', async () => {
    const raw = await apiGet('/api/customers', cookie);
    const list = Array.isArray(raw) ? raw : ((raw as { data?: unknown[] }).data ?? []);
    expect(list.length).toBe(0);
  });

  test('after factory reset — company settings row exists (blank slate)', async () => {
    const r = await fetch(`${BASE_URL}/api/company-settings`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { companyName?: string };
    expect(typeof body.companyName).toBe('string');
  });

  test('after factory reset — auth/me still works (users unaffected)', async () => {
    const r = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { user?: { username: string }; username?: string };
    const username = body.user?.username ?? body.username;
    expect(username).toBeTruthy();
  });

  test('after factory reset — dashboard summary returns zeros', async () => {
    const data = await apiGet('/api/dashboard', cookie) as {
      summary?: { totalProducts?: number; totalPurchaseOrders?: number };
    };
    const summary = data.summary ?? {};
    expect(summary.totalProducts ?? 0).toBe(0);
    expect(summary.totalPurchaseOrders ?? 0).toBe(0);
  });

  test('factory reset is idempotent — calling it twice does not error', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
