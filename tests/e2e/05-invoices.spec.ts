import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, apiPost, apiDelete } from './helpers';

test.describe('Invoices — create, large document, filters', () => {
  let cookie: string;
  let customerId: number;
  let testInvoiceId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const custsRaw = await apiGet('/api/customers', cookie);
    const custs: any[] = Array.isArray(custsRaw) ? custsRaw : (Array.isArray(custsRaw.customers) ? custsRaw.customers : []);
    customerId = custs[0]?.id ?? 3;
  });

  test('invoices list loads with 500+ records in < 200ms', async () => {
    const start = Date.now();
    const data = await apiGet('/api/invoices', cookie);
    const elapsed = Date.now() - start;
    const invs = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(200);
  });

  test('create invoice with customer and line items', async () => {
    const prods = await apiGet('/api/products', cookie);
    const items = prods.slice(0, 6).map((p: any, i: number) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: parseFloat(p.unitPrice),
      line_total: (i + 1) * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, it: any) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerId,
      invoice_date: '2026-03-23',
      status: 'Draft',
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items,
    }, cookie);

    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    testInvoiceId = data.id;
  });

  test('invoice detail returns all line items', async () => {
    const data = await apiGet(`/api/invoices/${testInvoiceId}`, cookie);
    expect((data.items ?? []).length).toBe(6);
  });

  test('50-line invoice (INV-2025-554) loads all items and correct total', async () => {
    const data = await apiGet('/api/invoices/516', cookie);
    expect((data.items ?? []).length).toBe(50);
    expect(data.total_amount).toBeCloseTo(17671.5, 0);
  });

  test('invoice requires valid customer_id — rejects missing', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      invoice_date: '2026-03-23',
      items: [],
    }, cookie);
    expect(status).toBe(400);
    expect(data.error).toMatch(/customer/i);
  });

  test('invoice requires valid customer_id — rejects nonexistent ID', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: 999999,
      invoice_date: '2026-03-23',
    }, cookie);
    expect(status).toBe(400);
    expect(data.error).toMatch(/not found/i);
  });

  test('invoices page renders in browser with invoice numbers visible', async ({ page }) => {
    await login(page);
    const nav = page.locator('nav, aside, [role="navigation"]');
    await nav.locator('text=/invoice/i').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/INV-\d{4}-\d+/);
  });

  test.afterAll(async () => {
    if (testInvoiceId) await apiDelete(`/api/invoices/${testInvoiceId}`, cookie);
  });
});
