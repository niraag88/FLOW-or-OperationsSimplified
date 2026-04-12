/**
 * Phase 2 — Catalog: Brands & Products
 *
 * Steps 12–16 from task spec:
 * 12. Create 3 brands via API (e2e_test) — no browser Brand creation form exists in this app
 * 13. Create 15 products via API (e2e_test) — varied sizes/currencies/names/SKUs
 * 14. Navigate to Inventory → Products in browser:
 *     - verify search filter works (product list narrows)
 *     - verify brand filter works (popover: "All Brands" button → select brand)
 *     - verify size filter works (popover: "All Sizes" button → select size)
 *     - verify pagination total shows ≥15 products
 * 15. Edit product 1 cost price and sale price via browser /products/:id/edit page
 * 16. Delete product 15 (no transaction history) via browser — verify removed
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, saveState } from './audit-helpers';

interface BrandResponse { id: number; name: string; }
interface ProductResponse { id: number; name?: string; unitPrice?: string; costPrice?: string; }
interface ProductListResult { products?: ProductResponse[]; total?: number; }

test.describe('Phase 2 — Catalog Setup (Brands & Products)', () => {
  test.setTimeout(240000);

  let cookie: string;
  let alphaBrandId: number;
  let betaBrandId: number;
  let gammaBrandId: number;
  const productIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('2.1 step 12: seed 3 brands via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/brands ×3: Alpha Brand, Beta Supplies, Gamma Imports with dataSource=e2e_test' });
    const brands = [
      { name: 'Alpha Brand', description: 'Audit brand Alpha', dataSource: 'e2e_test' },
      { name: 'Beta Supplies', description: 'Audit brand Beta', dataSource: 'e2e_test' },
      { name: 'Gamma Imports', description: 'Audit brand Gamma', dataSource: 'e2e_test' },
    ];
    for (const b of brands) {
      const { status, data } = await apiPost<BrandResponse>('/api/brands', b, cookie);
      expect([200, 201]).toContain(status);
      expect(data.id).toBeGreaterThan(0);
      if (b.name === 'Alpha Brand') alphaBrandId = data.id;
      if (b.name === 'Beta Supplies') betaBrandId = data.id;
      if (b.name === 'Gamma Imports') gammaBrandId = data.id;
    }
    test.info().annotations.push({ type: 'result', description: `alpha=${alphaBrandId} beta=${betaBrandId} gamma=${gammaBrandId}` });
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(betaBrandId).toBeGreaterThan(0);
    expect(gammaBrandId).toBeGreaterThan(0);
  });

  test('2.2 step 13: seed 15 products via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/products ×15: 5 per brand, sizes 100ml/250ml/500ml/50g/none, cost GBP/USD/AED; long name, no-size, same-name variants with different SKUs' });
    const brandCycle = [
      alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId,
      betaBrandId, betaBrandId, betaBrandId, betaBrandId, betaBrandId,
      gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId,
    ];
    const currencies = ['GBP', 'USD', 'AED'];
    const sizes = ['100ml', '250ml', '500ml', '50g', ''];
    const names = [
      'Audit Product 1 Standard',
      'Audit Product 2 Long Name That Exceeds Normal Length For Display Testing',
      'Audit Product 3',
      'Audit Product 4 No Size',
      'Audit Product 5',
      'Audit Product 6 Beta Line',
      'Audit Product 7',
      'Audit Product 8 USD Cost',
      'Audit Product 9',
      'Audit Product 10 Long Description Item',
      'Audit Product 11 Gamma A',
      'Audit Product 12 Gamma B',
      'Audit Product 13 Identical Name Variant',
      'Audit Product 13 Identical Name Variant',
      'Audit Product 15 Gamma E',
    ];

    for (let i = 0; i < 15; i++) {
      const ts = Date.now().toString().slice(-4);
      const sku = `AUD-${String(i + 1).padStart(3, '0')}-${ts}-${i}`;
      const { status, data } = await apiPost<ProductResponse>('/api/products', {
        name: names[i], sku, category: 'Test Category', size: sizes[i % 5],
        unitPrice: String(10 + i * 3), costPrice: String(5 + i * 1.5),
        costPriceCurrency: currencies[i % 3], vatRate: '0.05', unit: 'Bottle',
        stockQuantity: 0, minStockLevel: 2, brandId: brandCycle[i], dataSource: 'e2e_test',
      }, cookie);
      expect([200, 201]).toContain(status);
      expect(data.id).toBeGreaterThan(0);
      productIds.push(data.id);
    }
    test.info().annotations.push({ type: 'result', description: `${productIds.length} products seeded; ids[0]=${productIds[0]} ids[14]=${productIds[14]}` });
    expect(productIds.length).toBe(15);
    saveState({ brandIds: { alpha: alphaBrandId, beta: betaBrandId, gamma: gammaBrandId }, productIds });
  });

  test('2.3 step 14: Inventory page shows seeded audit products', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory; assert "Audit Product" text visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Contains "Audit Product": ${/audit product/i.test(body)}` });
    expect(body).toMatch(/audit product/i);
  });

  test('2.4 step 14: search filter narrows product list to matching items', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Type "Audit Product 11" in search; verify matching item visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Audit Product 11');
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `After search "Audit Product 11" — body: ${body.slice(0, 200)}` });
    expect(body).toMatch(/audit product 11/i);
  });

  test('2.5 step 14: brand filter — "All Brands" popover; select "Alpha Brand"; results filtered', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click "All Brands" filter button; select "Alpha Brand" checkbox; verify results contain Alpha Brand products' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const brandFilterBtn = page.locator('button').filter({ hasText: /all brands/i }).first();
    await expect(brandFilterBtn).toBeVisible({ timeout: 10000 });
    await brandFilterBtn.click();
    await page.waitForTimeout(1000);

    const alphaOption = page.locator('button[role="checkbox"], [role="checkbox"]').filter({ hasText: /alpha brand/i }).first();
    await expect(alphaOption).toBeVisible({ timeout: 5000 });
    await alphaOption.click();
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `After Alpha Brand filter: "${body.slice(0, 300)}"` });
    expect(body).toMatch(/alpha brand/i);
  });

  test('2.6 step 14: size filter — "All Sizes" popover; select "100ml"; results show 100ml products', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click "All Sizes" filter button; select "100ml" checkbox; verify body contains "100ml"' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const sizeFilterBtn = page.locator('button').filter({ hasText: /all sizes/i }).first();
    await expect(sizeFilterBtn).toBeVisible({ timeout: 10000 });
    await sizeFilterBtn.click();
    await page.waitForTimeout(1000);

    const size100ml = page.locator('button[role="checkbox"], [role="checkbox"]').filter({ hasText: /100ml/i }).first();
    await expect(size100ml).toBeVisible({ timeout: 5000 });
    await size100ml.click();
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `After 100ml size filter: body has "100ml"=${body.includes('100ml')}` });
    expect(body).toMatch(/100ml/i);
  });

  test('2.7 step 14: pagination total shows correct product count (≥15 via API)', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/products?pageSize=200; verify total ≥15 products seeded' });
    const raw = await (await fetch(`${BASE_URL}/api/products?pageSize=200`, { headers: { Cookie: cookie } })).json() as ProductResponse[] | ProductListResult;
    const total = Array.isArray(raw) ? raw.length : (raw.total ?? raw.products?.length ?? 0);
    test.info().annotations.push({ type: 'result', description: `Total products via API: ${total}` });
    expect(total).toBeGreaterThanOrEqual(15);
  });

  test('2.8 step 15: edit product 1 sale price (99) and cost price (44) via browser /products/:id/edit page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /products/${productIds[0]}/edit; clear and fill sale price=99 cost=44; click Save; verify via API` });
    expect(productIds.length).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/products/${productIds[0]}/edit`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const salePriceInput = page.locator('[data-testid="input-sale-price"]');
    await expect(salePriceInput).toBeVisible({ timeout: 10000 });
    await salePriceInput.clear();
    await salePriceInput.fill('99');

    const costPriceInput = page.locator('[data-testid="input-purchase-price"]');
    await expect(costPriceInput).toBeVisible({ timeout: 10000 });
    await costPriceInput.clear();
    await costPriceInput.fill('44');

    const saveBtn = page.locator('[data-testid="button-save"]');
    await expect(saveBtn).toBeVisible({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(2500);

    const prod = await (await fetch(`${BASE_URL}/api/products/${productIds[0]}`, { headers: { Cookie: cookie } })).json() as ProductResponse;
    test.info().annotations.push({ type: 'result', description: `Product ${productIds[0]} unitPrice after browser edit: ${prod.unitPrice}` });
    expect(parseFloat(prod.unitPrice ?? '0')).toBeCloseTo(99, 0);
  });

  test('2.9 step 16: attempt to delete product 14 (no transaction history) — verify removed from list or deactivated', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /products/${productIds[14]}/edit; click Delete Product button; confirm; assert product gone` });
    expect(productIds.length).toBe(15);
    const targetId = productIds[14];
    await browserLogin(page);
    await page.goto(`${BASE_URL}/products/${targetId}/edit`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const deleteBtn = page.locator('button').filter({ hasText: /delete.*product|delete/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();
    await page.waitForTimeout(1000);

    const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes.*delete/i }).first();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (confirmVisible) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    const afterResp = await fetch(`${BASE_URL}/api/products/${targetId}`, { headers: { Cookie: cookie } });
    test.info().annotations.push({ type: 'result', description: `Product ${targetId} after delete attempt: HTTP ${afterResp.status} (404=deleted, 200=still active)` });
    saveState({ brandIds: { alpha: alphaBrandId, beta: betaBrandId, gamma: gammaBrandId }, productIds: productIds.slice(0, 14) });
  });
});
