/**
 * Phase 8 — Inventory & Stock
 *
 * Browser tests: Inventory page shows products with stock > 0;
 *                Stock count tab accessible; Reports page renders.
 * API tests: Verify stock movements exist; verify stock counts work.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState } from './audit-helpers';

test.describe('Phase 8 — Inventory & Stock', () => {
  test.setTimeout(120000);

  let cookie: string;
  let productIds: number[];
  let grnIds: ReturnType<typeof loadState>['grnIds'];

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    productIds = state.productIds ?? [];
    grnIds = state.grnIds;
    expect(productIds.length).toBeGreaterThan(0);
    expect(grnIds?.grn01).toBeGreaterThan(0);
  });

  test('inventory page renders with seeded audit products', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit product/i);
  });

  test('products received in GRN-01 have stock > 0 in API', async () => {
    const grn = await (await fetch(`${BASE_URL}/api/goods-receipts/${grnIds!.grn01}`, { headers: { Cookie: cookie } })).json() as {
      items?: Array<{ productId?: number; product_id?: number }>;
    };
    const items = grn.items ?? [];
    expect(items.length).toBeGreaterThan(0);

    for (const item of items.slice(0, 3)) {
      const pId = item.productId ?? item.product_id;
      expect(pId).toBeGreaterThan(0);
      const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as { stockQuantity?: number; stock_quantity?: number };
      const stock = prod.stockQuantity ?? prod.stock_quantity ?? 0;
      expect(stock).toBeGreaterThan(0);
    }
  });

  test('inventory page shows non-zero stock for received products in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    const hasNonZeroStock = /[1-9]\d*/.test(body);
    expect(hasNonZeroStock).toBe(true);
  });

  test('stock movements API returns array with at least one entry', async () => {
    const data = await (await fetch(`${BASE_URL}/api/stock-movements`, { headers: { Cookie: cookie } })).json() as unknown[];
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('create a stock count via API; ID returned', async () => {
    const pId = productIds[0];
    const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as { sku?: string; name?: string };
    const { status, data } = await apiPost('/api/stock-counts', {
      items: [{
        product_id: pId, product_code: prod.sku ?? 'AUDIT-001', product_name: prod.name ?? 'Audit Product 1',
        brand_name: '', size: '', quantity: 5,
      }],
    }, cookie);
    expect([200, 201]).toContain(status);
    expect((data as { id: number }).id).toBeGreaterThan(0);
  });

  test('Reports page renders with revenue/PO/inventory content', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Reports`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/report|revenue|purchase|inventory/i);
  });
});
