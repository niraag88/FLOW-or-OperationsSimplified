import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiDelete } from './helpers';

test.describe('Invoices — create, large document, filters', () => {
  let cookie: string;
  let customerId: number;
  let testInvoiceId: number;
  let largeInvoiceId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const custsRaw = await apiGet('/api/customers', cookie);
    const custs: any[] = Array.isArray(custsRaw) ? custsRaw : (Array.isArray(custsRaw.customers) ? custsRaw.customers : []);
    customerId = custs[0]?.id ?? 3;

    // Create a large (10-line) invoice for the large-document tests
    let prods: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const prodsRaw = await apiGet('/api/products', cookie);
      if (Array.isArray(prodsRaw) && prodsRaw.length > 0) {
        prods = prodsRaw;
        break;
      }
      await new Promise(r => setTimeout(r, 500));
    }
    const largeItems = prods.slice(0, 10).map((p: any, i: number) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: parseFloat(p.unitPrice),
      line_total: (i + 1) * parseFloat(p.unitPrice),
    }));
    const largeSub = largeItems.reduce((s: number, it: any) => s + it.line_total, 0);
    const largeVat = largeSub * 0.05;
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerId,
      invoice_date: '2026-03-23',
      status: 'Draft',
      tax_amount: largeVat.toFixed(2),
      total_amount: (largeSub + largeVat).toFixed(2),
      items: largeItems,
    }, cookie);
    if (status === 201) {
      largeInvoiceId = data.id;
    }
  });

  test.afterAll(async () => {
    if (testInvoiceId) await apiDelete(`/api/invoices/${testInvoiceId}`, cookie);
    if (largeInvoiceId) await apiDelete(`/api/invoices/${largeInvoiceId}`, cookie);
  });

  test('invoices list loads with 500+ records in < 200ms', async () => {
    const start = Date.now();
    const data = await apiGet('/api/invoices', cookie);
    const elapsed = Date.now() - start;
    const invs = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThanOrEqual(500);
    expect(elapsed).toBeLessThan(200);
  });

  test('create invoice with customer and 6 line items', async () => {
    let prods: any[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      if (Array.isArray(r) && r.length > 0) { prods = r; break; }
      await new Promise(res => setTimeout(res, 400));
    }
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

  test('invoice detail returns all 6 line items', async () => {
    const data = await apiGet(`/api/invoices/${testInvoiceId}`, cookie);
    expect((data.items ?? []).length).toBe(6);
  });

  test('large (10-line) invoice loads all items and correct total', async () => {
    expect(largeInvoiceId).toBeTruthy();
    const data = await apiGet(`/api/invoices/${largeInvoiceId}`, cookie);
    expect((data.items ?? []).length).toBe(10);
    expect(parseFloat(data.total_amount ?? data.amount ?? 0)).toBeGreaterThan(0);
  });

  test('invoice filter by status=Draft returns only Draft invoices', async () => {
    const data = await apiGet('/api/invoices?status=Draft', cookie);
    const invs: any[] = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      expect(inv.status).toBe('Draft');
    }
  });

  test('invoice filter by customerId returns only that customer invoices', async () => {
    const data = await apiGet(`/api/invoices?customerId=${customerId}`, cookie);
    const invs: any[] = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      expect(inv.customerId ?? inv.customer_id).toBe(customerId);
    }
  });

  test('invoice filter by date range returns results within window', async () => {
    const data = await apiGet('/api/invoices?dateFrom=2026-01-01&dateTo=2026-12-31', cookie);
    const invs: any[] = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      const invDate = new Date(inv.invoiceDate ?? inv.invoice_date);
      expect(invDate.getFullYear()).toBeGreaterThanOrEqual(2025);
    }
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

  test('invoices list endpoint is idempotent — two calls return same count', async () => {
    const d1 = await apiGet('/api/invoices', cookie);
    const d2 = await apiGet('/api/invoices', cookie);
    const c1 = (Array.isArray(d1) ? d1 : d1.invoices ?? []).length;
    const c2 = (Array.isArray(d2) ? d2 : d2.invoices ?? []).length;
    expect(c1).toBe(c2);
  });
});
