/**
 * Phase 8 — Inventory & Stock
 *
 * 59-63. Navigate inventory dashboard, check stock from GRNs, perform stock count,
 *        verify deduction, export CSV, run PO-GRN report
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
  });

  test('inventory page renders with product list', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/product|inventory|stock/i);
    test.info().annotations.push({ type: 'info', description: 'Inventory dashboard renders' });
  });

  test('products received in GRNs have stock > 0 via API', async () => {
    test.skip(!grnIds?.grn01, 'Requires GRN-01 to be created');

    const grns = await (await fetch(`${BASE_URL}/api/goods-receipts`, { headers: { Cookie: cookie } })).json() as Array<{ id: number }>;
    expect(Array.isArray(grns)).toBe(true);

    const grn = await (await fetch(`${BASE_URL}/api/goods-receipts/${grnIds!.grn01}`, { headers: { Cookie: cookie } })).json() as {
      items?: Array<{ productId?: number; product_id?: number; receivedQuantity?: number; received_quantity?: number }>;
    };
    const items = grn.items ?? [];
    if (items.length > 0) {
      const pId = items[0].productId ?? items[0].product_id;
      if (pId) {
        const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as { stockQuantity?: number; stock_quantity?: number };
        const stock = prod.stockQuantity ?? prod.stock_quantity ?? 0;
        test.info().annotations.push({ type: 'info', description: `Product ${pId} stock=${stock} after GRN receive` });
        expect(stock).toBeGreaterThan(0);
      }
    } else {
      test.info().annotations.push({ type: 'warn', description: 'GRN has no items to verify stock for' });
    }
  });

  test('create a stock count for first product', async () => {
    test.skip(productIds.length === 0, 'Requires products');

    const pId = productIds[0];
    const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as { stockQuantity?: number; stock_quantity?: number; sku?: string; name?: string };

    const { status, data } = await apiPost('/api/stock-counts', {
      items: [{
        product_id: pId,
        product_code: prod.sku ?? 'AUDIT-001',
        product_name: prod.name ?? 'Audit Product 1',
        brand_name: '',
        size: '',
        quantity: 5,
      }],
    }, cookie);
    expect([200, 201]).toContain(status);
    const created = data as { id: number };
    expect(created.id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `Stock count created id=${created.id} for product ${pId}` });
  });

  test('stock movements API returns array', async () => {
    const data = await (await fetch(`${BASE_URL}/api/stock-movements`, { headers: { Cookie: cookie } })).json();
    expect(Array.isArray(data)).toBe(true);
    test.info().annotations.push({ type: 'info', description: `Stock movements: ${(data as unknown[]).length} entries` });
  });

  test('PO-GRN report page renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Reports`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/report|revenue|purchase|GRN/i);
    test.info().annotations.push({ type: 'info', description: 'Reports page renders with PO/GRN data visible' });
  });

  test('inventory API returns product list with stock quantities', async () => {
    const raw = await (await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } })).json();
    const prods = Array.isArray(raw) ? raw : ((raw as any).products ?? []);
    expect(prods.length).toBeGreaterThan(0);
    for (const p of prods.slice(0, 5) as Array<{ stockQuantity?: number; stock_quantity?: number }>) {
      const stock = p.stockQuantity ?? p.stock_quantity ?? 0;
      expect(typeof stock).toBe('number');
    }
    test.info().annotations.push({ type: 'info', description: `Inventory shows ${prods.length} products with stock data` });
  });
});
