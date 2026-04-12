import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, toProductList, toInvoiceList, productStock, ApiProduct } from './helpers';

test.describe('Stock Count & Reports', () => {
  let cookie: string;
  let stockCountId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('stock counts list is reachable', async () => {
    const data = await apiGet('/api/stock-counts', cookie);
    expect(Array.isArray(data)).toBe(true);
  });

  test('create a stock count (save) from current product list', async () => {
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods = toProductList(prodsRaw);
    test.skip(prods.length === 0, 'Requires at least one product in the database');
    expect(prods.length).toBeGreaterThan(0);

    const items = prods.slice(0, 5).map((p: ApiProduct) => ({
      product_id: p.id,
      product_code: p.sku ?? '',
      product_name: p.name,
      brand_name: '',
      size: '',
      quantity: Math.max(1, productStock(p)),
    }));

    const { status, data } = await apiPost('/api/stock-counts', { items }, cookie);
    expect(status).toBe(201);
    stockCountId = (data as { id: number }).id;
    expect(stockCountId).toBeTruthy();
  });

  test('load stock count by ID — all 5 items present', async () => {
    expect(stockCountId).toBeTruthy();
    const data = await apiGet(`/api/stock-counts/${stockCountId}`, cookie) as {
      id: number; items?: unknown[]; totalProducts?: number; totalQuantity?: number;
    };
    expect(data.id).toBe(stockCountId);
    expect((data.items ?? []).length).toBe(5);
    expect(data.totalProducts).toBe(5);
    expect(data.totalQuantity).toBeGreaterThan(0);
  });

  test('stock count rejects empty items array', async () => {
    const { status } = await apiPost('/api/stock-counts', { items: [] }, cookie);
    expect(status).toBe(400);
  });

  test('dashboard summary shows product and purchase order counts', async () => {
    const data = await apiGet('/api/dashboard', cookie) as {
      summary?: { totalProducts?: number; totalCustomers?: number; totalSuppliers?: number; totalPurchaseOrders?: number };
    };
    const summary = data.summary ?? {};
    expect(typeof summary.totalProducts).toBe('number');
    expect(typeof summary.totalCustomers).toBe('number');
    expect(typeof summary.totalSuppliers).toBe('number');
    expect(typeof summary.totalPurchaseOrders).toBe('number');
  });

  test('dashboard stats endpoint is reachable with valid shape', async () => {
    const data = await apiGet('/api/dashboard/stats', cookie) as {
      products?: number; customers?: number; suppliers?: number;
      purchaseOrders?: number; quotations?: number;
    };
    expect(typeof data.products).toBe('number');
    expect(typeof data.customers).toBe('number');
    expect(typeof data.suppliers).toBe('number');
    expect(typeof data.purchaseOrders).toBe('number');
    expect(typeof data.quotations).toBe('number');
  });

  test('invoices list API is reachable and has correct shape', async () => {
    const raw = await apiGet('/api/invoices?pageSize=20', cookie);
    const invs = toInvoiceList(raw) as Array<{
      invoiceNumber?: string; invoice_number?: string; amount?: unknown;
    }>;
    expect(Array.isArray(invs)).toBe(true);
    // If invoices exist, verify their shape
    for (const inv of invs) {
      expect(inv.invoiceNumber ?? inv.invoice_number).toBeTruthy();
      expect(inv.amount).toBeDefined();
    }
  });

  test('products list loads without error (reports sanity)', async () => {
    const raw = await apiGet('/api/products?pageSize=5', cookie);
    const prods = toProductList(raw);
    expect(prods.length).toBeGreaterThanOrEqual(0);
    for (const p of prods) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
    }
  });
});
