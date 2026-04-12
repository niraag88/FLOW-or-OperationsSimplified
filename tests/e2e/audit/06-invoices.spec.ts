/**
 * Phase 6 — Invoices
 *
 * Browser tests: Invoice list renders; New Invoice + Create from Existing buttons visible;
 *                INV-01 submit via browser UI; PAID badge in list; print views.
 * API tests: Create invoices, lifecycle transitions, verify line counts.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface InvoiceResponse { id: number; status: string; paymentStatus?: string; payment_status?: string; items?: unknown[]; }

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
    expect(customerIds.length).toBeGreaterThanOrEqual(4);
    expect(productIds.length).toBeGreaterThanOrEqual(10);
  });

  function makeItems(count: number) {
    return productIds.slice(0, count).map((pId, i) => ({
      product_id: pId, description: `Invoice line ${i + 1}`,
      quantity: i + 1, unit_price: 25 + i * 5, line_total: (i + 1) * (25 + i * 5),
    }));
  }

  test('Invoices list page renders with "New Invoice" button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert New Invoice button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new invoice/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'New Invoice button visible' });
  });

  test('"Create from Existing" button is visible on Invoices page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Assert Create from Existing button on /Invoices' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Create from Existing button visible' });
  });

  test('create INV-01 (Customer 1, 6 items) via API; line count = 6', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-01 with 6 items' });
    const items = makeItems(6);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-01 remarks', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv01Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 id=${inv01Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(6);
  });

  test('create INV-02 (Customer 2, 1 item) via API', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-02 with 1 item' });
    const items = makeItems(1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[1], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `INV-02 id=${inv02Id}` });
    expect(inv02Id).toBeGreaterThan(0);
  });

  test('create INV-03 (Customer 3, 10 items) via API; line count = 10', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-03 with 10 items' });
    const items = makeItems(10);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[2], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-03 10 items', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv03Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-03 id=${inv03Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(10);
  });

  test('create INV-04 (Customer 1, 3 items) via API — to be cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-04 with 3 items' });
    const items = makeItems(3);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv04Id = data.id;
    test.info().annotations.push({ type: 'result', description: `INV-04 id=${inv04Id}` });
    expect(inv04Id).toBeGreaterThan(0);
  });

  test('submit INV-01 via browser UI (navigate to detail, click Submit)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /Invoices/${inv01Id}; click Submit button` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices/${inv01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const submitBtn = page.locator('button').filter({ hasText: /submit/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 status after browser submit: ${inv.status}` });
    expect(['submitted', 'Submitted', 'delivered', 'paid']).toContain(inv.status);
  });

  test('INV-01: advance to Delivered → Paid via API; payment_status=paid', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT INV-01 delivered then paid` });
    await apiPut(`/api/invoices/${inv01Id}`, { status: 'delivered' }, cookie);
    const s3 = await apiPut<InvoiceResponse>(`/api/invoices/${inv01Id}`, {
      status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15', paymentRemarks: 'Bank transfer',
    }, cookie);
    expect([200, 201]).toContain(s3.status);

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 payment_status=${inv.paymentStatus ?? inv.payment_status}` });
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('INV-02: Draft → Submitted → Paid; payment_status=paid', async () => {
    test.info().annotations.push({ type: 'action', description: 'PUT INV-02 submitted → paid' });
    await apiPut(`/api/invoices/${inv02Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut<InvoiceResponse>(`/api/invoices/${inv02Id}`, { status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv02Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-02 payment_status=${inv.paymentStatus ?? inv.payment_status}` });
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('INV-03: Draft → Submitted → Delivered (outstanding)', async () => {
    test.info().annotations.push({ type: 'action', description: 'PUT INV-03 submitted → delivered' });
    await apiPut(`/api/invoices/${inv03Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut<InvoiceResponse>(`/api/invoices/${inv03Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    const pStatus = inv.paymentStatus ?? inv.payment_status;
    test.info().annotations.push({ type: 'result', description: `INV-03 status=${inv.status} payment_status=${pStatus}` });
    expect(pStatus === null || pStatus === undefined || pStatus === 'outstanding' || pStatus === '').toBeTruthy();
  });

  test('cancel INV-04 from Draft; status = cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/invoices/${inv04Id} status=cancelled` });
    const { status, data } = await apiPut<InvoiceResponse>(`/api/invoices/${inv04Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'result', description: `INV-04 status=${data.status}` });
    expect(data.status).toBe('cancelled');
  });

  test('invoice list shows PAID badge for INV-01 and OUTSTANDING/DELIVERED for INV-03', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert paid and outstanding/delivered badges' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has "paid": ${/paid/i.test(body)}; "outstanding/delivered": ${/outstanding|delivered/i.test(body)}` });
    expect(body).toMatch(/paid/i);
    expect(body).toMatch(/outstanding|delivered/i);
  });

  test('INV-01 print view renders with company name, TRN, items, and VAT', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${inv01Id}/print; assert company name + TRN + AED/VAT` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Print body length: ${body.length}; company: ${/audit test co/i.test(body)}; TRN: ${body.includes('100123456700003')}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/audit test co/i);
    expect(body).toContain('100123456700003');
    expect(body).toMatch(/AED|total|VAT/i);
  });

  test('INV-03 print view (10 items) renders without errors', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${inv03Id}/print; assert content` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv03Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `INV-03 print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3|invoice|total/i);
  });

  test('payments ledger page renders with content', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Payments; assert body not empty' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Payments`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Payments page body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(50);

    saveState({ invoiceIds: { inv01: inv01Id, inv02: inv02Id, inv03: inv03Id, inv04: inv04Id } });
  });
});
