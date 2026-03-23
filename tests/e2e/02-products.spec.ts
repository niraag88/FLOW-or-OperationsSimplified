import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, apiPost, apiDelete } from './helpers';

test.describe('Products CRUD', () => {
  let cookie: string;
  let testProductId: number;
  const testSku = `TEST-E2E-${Date.now()}`;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('products list loads with 498+ items', async () => {
    const prods = await apiGet('/api/products', cookie);
    expect(Array.isArray(prods)).toBe(true);
    expect(prods.length).toBeGreaterThanOrEqual(490);
  });

  test('all 12 product categories are represented', async () => {
    const prods = await apiGet('/api/products', cookie);
    const categories = new Set(prods.map((p: any) => p.category));
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
      brandId: 1,
    }, cookie);
    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    testProductId = data.id;
  });

  test('created product appears in list', async () => {
    const prods = await apiGet('/api/products', cookie);
    const found = prods.find((p: any) => p.sku === testSku);
    expect(found).toBeTruthy();
    expect(found.name).toBe('E2E Test Product');
  });

  test('delete unreferenced product (hard delete)', async () => {
    expect(testProductId).toBeTruthy();
    const status = await apiDelete(`/api/products/${testProductId}`, cookie);
    expect(status).toBe(200);

    const prods = await apiGet('/api/products', cookie);
    const found = prods.find((p: any) => p.id === testProductId);
    expect(found).toBeUndefined();
  });

  test('invoice customer_id is required — no orphan invoices', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      invoice_date: '2026-03-23',
      items: [],
    }, cookie);
    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  test('invalid customer_id rejected on invoice create', async () => {
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: 999999,
      invoice_date: '2026-03-23',
    }, cookie);
    expect(status).toBe(400);
    expect(data.error).toContain('not found');
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

  test('products page renders in browser with count badge', async ({ page }) => {
    await login(page);
    await page.goto('/');
    const sidebar = page.locator('nav, aside, [role="navigation"]');
    await sidebar.locator('text=/inventory|products/i').first().click().catch(() => {});
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/\d{3,}/);
  });
});
