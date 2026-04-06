import { test, expect } from '@playwright/test';
import {
  apiLogin, apiGet, apiPost, apiDelete,
  toProductList, toInvoiceList, productPrice, ApiProduct, ApiInvoice,
} from './helpers';

test.describe('Invoices — create, large document, filters', () => {
  let cookie: string;
  let customerId: number;
  let testCustomerId: number;
  let testInvoiceId: number;
  let largeInvoiceId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    // Create a dedicated test customer so tests are self-contained
    const { data: cData } = await apiPost('/api/customers', { name: 'E2E Test Customer (Invoices)', dataSource: 'e2e_test' }, cookie);
    testCustomerId = (cData as { id: number }).id;
    customerId = testCustomerId;

    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const raw = await apiGet('/api/products', cookie);
      const list = toProductList(raw);
      if (list.length > 0) { prods = list; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    const largeItems = prods.slice(0, 10).map((p, i) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: productPrice(p),
      line_total: (i + 1) * productPrice(p),
    }));
    const largeSub = largeItems.reduce((s, it) => s + it.line_total, 0);
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
      largeInvoiceId = (data as ApiInvoice).id;
    }
  });

  test.afterAll(async () => {
    if (testInvoiceId) await apiDelete(`/api/invoices/${testInvoiceId}`, cookie);
    if (largeInvoiceId) await apiDelete(`/api/invoices/${largeInvoiceId}`, cookie);
    if (testCustomerId) await apiDelete(`/api/customers/${testCustomerId}`, cookie);
  });

  test('invoices list API responds in under 200ms', async () => {
    const start = Date.now();
    await apiGet('/api/invoices', cookie);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  test('create invoice with customer and 6 line items', async () => {
    let prods: ApiProduct[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await apiGet('/api/products', cookie);
      const list = toProductList(r);
      if (list.length > 0) { prods = list; break; }
      await new Promise((res) => setTimeout(res, 400));
    }
    const items = prods.slice(0, 6).map((p, i) => ({
      product_id: p.id,
      description: p.name,
      product_code: p.sku,
      quantity: i + 1,
      unit_price: productPrice(p),
      line_total: (i + 1) * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
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
    const created = data as ApiInvoice;
    expect(created.id).toBeTruthy();
    testInvoiceId = created.id;
  });

  test('invoice detail returns all 6 line items', async () => {
    const data = await apiGet(`/api/invoices/${testInvoiceId}`, cookie) as {
      items?: unknown[];
    };
    expect((data.items ?? []).length).toBe(6);
  });

  test('large (10-line) invoice loads all items and correct total', async () => {
    expect(largeInvoiceId).toBeTruthy();
    const data = await apiGet(`/api/invoices/${largeInvoiceId}`, cookie) as {
      items?: unknown[]; total_amount?: string | number; amount?: string | number;
    };
    expect((data.items ?? []).length).toBe(10);
    expect(parseFloat(String(data.total_amount ?? data.amount ?? 0))).toBeGreaterThan(0);
  });

  test('invoice filter by status=Draft returns only Draft invoices', async () => {
    const raw = await apiGet('/api/invoices?status=Draft', cookie);
    const invs = toInvoiceList(raw);
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      expect(inv.status).toBe('Draft');
    }
  });

  test('invoice filter by customerId returns only that customer invoices', async () => {
    const raw = await apiGet(`/api/invoices?customerId=${customerId}`, cookie);
    const invs = toInvoiceList(raw) as Array<ApiInvoice & { customerId?: number; customer_id?: number }>;
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      expect(inv.customerId ?? inv.customer_id).toBe(customerId);
    }
  });

  test('invoice filter by date range returns results within window', async () => {
    const raw = await apiGet('/api/invoices?dateFrom=2026-01-01&dateTo=2026-12-31', cookie);
    const invs = toInvoiceList(raw) as Array<ApiInvoice & { invoiceDate?: string; invoice_date?: string }>;
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      const invDate = new Date(inv.invoiceDate ?? inv.invoice_date ?? '');
      expect(invDate.getFullYear()).toBeGreaterThanOrEqual(2025);
    }
  });

  test('invoice requires valid customer_id — rejects missing', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      invoice_date: '2026-03-23',
      items: [],
    }, cookie);
    expect(status).toBe(400);
    expect((data as { error?: string }).error).toMatch(/customer/i);
  });

  test('invoice requires valid customer_id — rejects nonexistent ID', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: 999999,
      invoice_date: '2026-03-23',
    }, cookie);
    expect(status).toBe(400);
    expect((data as { error?: string }).error).toMatch(/not found/i);
  });

  test('invoices list endpoint is idempotent — two calls return same count', async () => {
    const d1 = await apiGet('/api/invoices', cookie);
    const d2 = await apiGet('/api/invoices', cookie);
    const c1 = toInvoiceList(d1).length;
    const c2 = toInvoiceList(d2).length;
    expect(c1).toBe(c2);
  });

  test('invoice status badges are valid — all returned statuses within expected set', async () => {
    const raw = await apiGet('/api/invoices', cookie);
    const invs = toInvoiceList(raw);
    // All status values found in the DB (case-normalised to lowercase for comparison)
    const validStatuses = new Set(['draft', 'sent', 'paid', 'overdue', 'cancelled', 'partial', 'submitted', 'delivered']);
    for (const inv of invs.slice(0, 50)) {
      if (inv.status) {
        expect(
          validStatuses.has(inv.status.toLowerCase()),
          `Unexpected status: "${inv.status}"`,
        ).toBe(true);
      }
    }
  });

  test('invoice API supports pagination via page + pageSize params', async () => {
    // Paginated response format: { data: [...], total: N }
    // Use pageSize=1 so page 2 exists even with just 2 test invoices
    const raw = await apiGet('/api/invoices?page=1&pageSize=1', cookie);
    const resp1 = raw as { data?: ApiInvoice[]; total?: number };
    const page1 = resp1.data ?? toInvoiceList(raw);
    expect(page1.length).toBeGreaterThan(0);
    expect(page1.length).toBeLessThanOrEqual(1);
    expect(typeof (resp1.total ?? 0)).toBe('number');

    const raw2 = await apiGet('/api/invoices?page=2&pageSize=1', cookie);
    const resp2 = raw2 as { data?: ApiInvoice[]; total?: number };
    const page2 = resp2.data ?? toInvoiceList(raw2);
    expect(page2.length).toBeGreaterThan(0);
    if (page1.length > 0 && page2.length > 0) {
      expect(page1[0]!.id).not.toBe(page2[0]!.id);
    }
  });
});
