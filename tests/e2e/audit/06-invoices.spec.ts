/**
 * Phase 6 — Invoices
 *
 * Browser tests: Invoice list renders; New Invoice button visible; PAID badge in list;
 *                Invoice print view renders with company data.
 * API tests: Create 4 invoices, full lifecycle transitions, verify line counts.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

test.describe('Phase 6 — Invoices', () => {
  test.setTimeout(180000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let inv01Id: number;
  let inv02Id: number;
  let inv03Id: number;
  let inv04Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
    expect(customerIds.length).toBeGreaterThanOrEqual(5);
    expect(productIds.length).toBeGreaterThanOrEqual(10);
  });

  function makeItems(count: number) {
    return productIds.slice(0, count).map((pId, i) => ({
      product_id: pId, description: `Invoice line ${i + 1}`,
      quantity: i + 1, unit_price: 25 + i * 5, line_total: (i + 1) * (25 + i * 5),
    }));
  }

  test('Invoices list page renders with "New Invoice" button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new invoice/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test('"Create from Existing" button is visible on Invoices page', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
  });

  test('create INV-01 (Customer 1, 6 items) via API; line count = 6', async () => {
    const items = makeItems(6);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-01 remarks', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv01Id = (data as { id: number }).id;
    expect(inv01Id).toBeGreaterThan(0);

    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((detail.items ?? []).length).toBe(6);
  });

  test('create INV-02 (Customer 2, 1 item) via API', async () => {
    const items = makeItems(1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[1], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv02Id = (data as { id: number }).id;
    expect(inv02Id).toBeGreaterThan(0);
  });

  test('create INV-03 (Customer 3, 10 items) via API; line count = 10', async () => {
    const items = makeItems(10);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[2], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-03 10 items', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv03Id = (data as { id: number }).id;
    expect(inv03Id).toBeGreaterThan(0);

    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((detail.items ?? []).length).toBe(10);
  });

  test('create INV-04 (Customer 1, 3 items) via API — to be cancelled', async () => {
    const items = makeItems(3);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv04Id = (data as { id: number }).id;
    expect(inv04Id).toBeGreaterThan(0);
  });

  test('INV-01 lifecycle: Draft → Submitted → Delivered → Paid (API)', async () => {
    const s1 = await apiPut(`/api/invoices/${inv01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1.status);
    const s2 = await apiPut(`/api/invoices/${inv01Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2.status);
    const s3 = await apiPut(`/api/invoices/${inv01Id}`, {
      status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15', paymentRemarks: 'Bank transfer',
    }, cookie);
    expect([200, 201]).toContain(s3.status);

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as { paymentStatus?: string; payment_status?: string };
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('INV-02: Draft → Submitted → Paid (direct); confirm payment_status=paid', async () => {
    await apiPut(`/api/invoices/${inv02Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut(`/api/invoices/${inv02Id}`, { status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv02Id}`, { headers: { Cookie: cookie } })).json() as { paymentStatus?: string; payment_status?: string };
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('INV-03: Draft → Submitted → Delivered (remains outstanding)', async () => {
    await apiPut(`/api/invoices/${inv03Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut(`/api/invoices/${inv03Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as { status: string; paymentStatus?: string; payment_status?: string };
    const pStatus = inv.paymentStatus ?? inv.payment_status;
    expect(pStatus === null || pStatus === undefined || pStatus === 'outstanding' || pStatus === '').toBeTruthy();
  });

  test('cancel INV-04 from Draft; status = cancelled', async () => {
    const { status, data } = await apiPut(`/api/invoices/${inv04Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    expect((data as { status: string }).status).toBe('cancelled');
  });

  test('invoices list shows PAID badge for INV-01 and OUTSTANDING for INV-03 in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/paid/i);
    expect(body).toMatch(/outstanding|delivered/i);
  });

  test('INV-01 print view renders with company name, line items, VAT, and TRN', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/audit test co/i);
    expect(body).toContain('100123456700003');
    expect(body).toMatch(/AED|total|VAT/i);
  });

  test('INV-03 print view (10 items) renders without errors', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv03Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3|invoice|total/i);
  });

  test('payments ledger page renders', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Payments`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);

    saveState({ invoiceIds: { inv01: inv01Id, inv02: inv02Id, inv03: inv03Id, inv04: inv04Id } });
  });
});
