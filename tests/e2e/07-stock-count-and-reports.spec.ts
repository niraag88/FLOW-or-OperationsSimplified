import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost } from './helpers';

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
    const prods: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];
    expect(prods.length).toBeGreaterThan(0);

    const items = prods.slice(0, 5).map((p: any) => ({
      product_id: p.id,
      product_code: p.sku ?? '',
      product_name: p.name,
      brand_name: p.brandName ?? '',
      size: p.size ?? '',
      quantity: Math.max(1, p.stockQuantity ?? 1),
    }));

    const { status, data } = await apiPost('/api/stock-counts', { items }, cookie);
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    stockCountId = data.id;
  });

  test('load stock count by ID — all 5 items present', async () => {
    expect(stockCountId).toBeTruthy();
    const data = await apiGet(`/api/stock-counts/${stockCountId}`, cookie);
    expect(data.id).toBe(stockCountId);
    expect((data.items ?? []).length).toBe(5);
    expect(data.totalProducts).toBe(5);
    expect(data.totalQuantity).toBeGreaterThan(0);
  });

  test('stock count rejects empty items array', async () => {
    const { status } = await apiPost('/api/stock-counts', { items: [] }, cookie);
    expect(status).toBe(400);
  });

  test('dashboard summary shows non-zero product/customer/supplier counts', async () => {
    const data = await apiGet('/api/dashboard', cookie);
    const summary = data.summary ?? {};
    expect(summary.totalProducts).toBeGreaterThanOrEqual(500);
    expect(summary.totalCustomers).toBeGreaterThanOrEqual(150);
    expect(summary.totalSuppliers).toBeGreaterThanOrEqual(50);
    expect(summary.totalPurchaseOrders).toBeGreaterThanOrEqual(300);
  });

  test('dashboard stats endpoint is reachable with valid shape', async () => {
    const data = await apiGet('/api/dashboard/stats', cookie);
    expect(typeof data.products).toBe('number');
    expect(typeof data.customers).toBe('number');
    expect(typeof data.suppliers).toBe('number');
    expect(typeof data.purchaseOrders).toBe('number');
    expect(typeof data.quotations).toBe('number');
  });

  test('invoices list is non-empty and has amount field', async () => {
    const data = await apiGet('/api/invoices?pageSize=20', cookie);
    const invs: any[] = Array.isArray(data) ? data : (data.invoices ?? []);
    expect(invs.length).toBeGreaterThan(0);
    for (const inv of invs) {
      expect(inv.invoiceNumber ?? inv.invoice_number).toBeTruthy();
      expect(inv.amount).toBeDefined();
    }
  });

  test('products list loads without error (reports sanity)', async () => {
    const data = await apiGet('/api/products?pageSize=5', cookie);
    const prods: any[] = Array.isArray(data) ? data : [];
    expect(prods.length).toBeGreaterThan(0);
    for (const p of prods) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
    }
  });
});
