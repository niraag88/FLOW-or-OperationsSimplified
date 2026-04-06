import { test, expect } from '@playwright/test';
import {
  apiLogin, apiGet, apiPost, apiPut, apiDelete,
  toProductList,
} from './helpers';

test.describe('Products CRUD', () => {
  let cookie: string;
  let testProductId: number;
  let firstBrandId: number;
  const testSku = `TEST-E2E-${Date.now()}`;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const brands = await apiGet('/api/brands', cookie) as { id: number }[];
    firstBrandId = Array.isArray(brands) && brands.length > 0 ? brands[0].id : 62;
  });

  test('products list loads with 490+ items', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    expect(prods.length).toBeGreaterThanOrEqual(490);
  });

  test('all 12 product categories are represented', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    const categories = new Set(prods.map((p) => p.category));
    const expected = [
      'Essential Oils', 'Carrier Oils', 'Bath Salts', 'Body Butters',
      'Massage Blends', 'Diffuser Blends', 'Roll-ons', 'Balms & Salves',
      'Hydrosols', 'Supplements', 'Electronics', 'Stationery',
    ];
    for (const cat of expected) {
      expect(categories.has(cat), `Category "${cat}" missing`).toBe(true);
    }
  });

  test('create new product via API', async () => {
    const { status, data } = await apiPost('/api/products', {
      name: 'E2E Test Product',
      sku: testSku,
      category: 'Essential Oils',
      unitPrice: '55.00',
      costPrice: '25.00',
      vatRate: '0.05',
      unit: 'Bottle',
      stockQuantity: 10,
      minStockLevel: 2,
      brandId: firstBrandId,
    }, cookie);
    expect(status).toBe(201);
    const created = data as { id: number };
    expect(created.id).toBeTruthy();
    testProductId = created.id;
  });

  test('created product appears in list', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    const found = prods.find((p) => p.sku === testSku);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('E2E Test Product');
  });

  test('update product name and price via API', async () => {
    expect(testProductId).toBeTruthy();
    const { status, data } = await apiPut(`/api/products/${testProductId}`, {
      name: 'E2E Test Product UPDATED',
      unitPrice: '65.00',
    }, cookie);
    expect(status).toBe(200);
    const updated = data as { name: string; unitPrice: string };
    expect(updated.name).toBe('E2E Test Product UPDATED');
    expect(parseFloat(updated.unitPrice)).toBeCloseTo(65.0, 1);
  });

  test('updated product reflects new values in list', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    const found = prods.find((p) => p.id === testProductId);
    expect(found).toBeTruthy();
    expect(found!.name).toBe('E2E Test Product UPDATED');
  });

  test('delete unreferenced product (hard delete)', async () => {
    expect(testProductId).toBeTruthy();
    const status = await apiDelete(`/api/products/${testProductId}`, cookie);
    expect(status).toBe(200);

    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    const found = prods.find((p) => p.id === testProductId);
    expect(found).toBeUndefined();
  });

  test('invoice customer_id is required — no orphan invoices', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      invoice_date: '2026-03-23',
      items: [],
    }, cookie);
    expect(status).toBe(400);
    const body = data as { error?: string };
    expect(body.error).toBeTruthy();
  });

  test('invalid customer_id rejected on invoice create', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: 999999,
      invoice_date: '2026-03-23',
    }, cookie);
    expect(status).toBe(400);
    const body = data as { error?: string };
    expect(body.error).toContain('not found');
  });

  test('product search is injection-safe', async () => {
    const malicious = encodeURIComponent("'; DROP TABLE products; --");
    const r = await fetch(`http://localhost:5000/api/products?search=${malicious}`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('products list API responds under 150ms at full scale', async () => {
    const start = Date.now();
    const raw = await apiGet('/api/products', cookie);
    const elapsed = Date.now() - start;
    const prods = toProductList(raw);
    expect(prods.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
  });

  test('products list has 540+ records and valid shape', async () => {
    const raw = await apiGet('/api/products', cookie);
    const prods = toProductList(raw);
    expect(prods.length).toBeGreaterThanOrEqual(540);
    for (const p of prods.slice(0, 10)) {
      expect(p.name).toBeTruthy();
      expect(p.sku).toBeTruthy();
      expect(p.category).toBeTruthy();
    }
  });
});
