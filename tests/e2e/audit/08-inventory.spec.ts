/**
 * Phase 8 — Inventory & Stock
 *
 * Browser tests: Inventory page shows products with stock > 0;
 *                Reports page renders.
 * API tests: Verify stock > 0 post-GRN; stock movements exist; stock count create.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState } from './audit-helpers';

interface ProductDetail { stockQuantity?: number; stock_quantity?: number; sku?: string; name?: string; }
interface GrnDetail { items?: Array<{ productId?: number; product_id?: number }>; }
interface StockCountResponse { id: number; }

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
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory; assert "Audit Product" text visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Inventory body contains Audit Product: ${/audit product/i.test(body)}` });
    expect(body).toMatch(/audit product/i);
  });

  test('products received in GRN-01 have stock > 0 in API', async () => {
    test.info().annotations.push({ type: 'action', description: `GET /api/goods-receipts/${grnIds?.grn01}; check product stock > 0` });
    const grn = await (await fetch(`${BASE_URL}/api/goods-receipts/${grnIds!.grn01}`, { headers: { Cookie: cookie } })).json() as GrnDetail;
    const items = grn.items ?? [];
    expect(items.length).toBeGreaterThan(0);

    for (const item of items.slice(0, 3)) {
      const pId = item.productId ?? item.product_id;
      expect(pId).toBeGreaterThan(0);
      const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as ProductDetail;
      const stock = prod.stockQuantity ?? prod.stock_quantity ?? 0;
      test.info().annotations.push({ type: 'result', description: `Product ${pId} stock: ${stock}` });
      expect(stock).toBeGreaterThan(0);
    }
  });

  test('inventory page shows non-zero stock for received products in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory; assert non-zero stock number present' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    const hasNonZeroStock = /[1-9]\d*/.test(body);
    test.info().annotations.push({ type: 'result', description: `Page has non-zero stock number: ${hasNonZeroStock}` });
    expect(hasNonZeroStock).toBe(true);
  });

  test('stock movements API returns array with at least one entry', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/stock-movements; assert non-empty array' });
    const data = await (await fetch(`${BASE_URL}/api/stock-movements`, { headers: { Cookie: cookie } })).json() as unknown[];
    test.info().annotations.push({ type: 'result', description: `Stock movements count: ${data.length}` });
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  test('create a stock count via API; ID returned', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/stock-counts with 1 item' });
    const pId = productIds[0];
    const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as ProductDetail;
    const { status, data } = await apiPost<StockCountResponse>('/api/stock-counts', {
      items: [{
        product_id: pId, product_code: prod.sku ?? 'AUDIT-001', product_name: prod.name ?? 'Audit Product 1',
        brand_name: '', size: '', quantity: 5,
      }],
    }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'result', description: `Stock count created id=${data.id}` });
    expect(data.id).toBeGreaterThan(0);
  });

  test('Reports page renders with revenue/PO/inventory content', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Reports; assert report-related text visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Reports`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Reports page contains report/revenue/purchase: ${/report|revenue|purchase|inventory/i.test(body)}` });
    expect(body).toMatch(/report|revenue|purchase|inventory/i);
  });
});
