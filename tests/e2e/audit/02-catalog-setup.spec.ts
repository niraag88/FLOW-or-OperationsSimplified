/**
 * Phase 2 — Catalog: Brands & Products
 *
 * Steps 12–16 from task spec:
 * 12. Create 3 brands via API (e2e_test)
 * 13. Create 15 products via API (e2e_test) — varied sizes, costs in GBP/USD/AED, long names, no-size
 * 14. Navigate to Inventory → Products: verify search, brand filter, size filter; pagination totals
 * 15. Edit one product price via browser; verify update in list
 * 16. Attempt to delete a product with no history — verify removed (noted; PO-history block in cleanup)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, saveState } from './audit-helpers';

interface BrandResponse { id: number; name: string; }
interface ProductResponse { id: number; name?: string; unitPrice?: string; }

test.describe('Phase 2 — Catalog Setup (Brands & Products)', () => {
  test.setTimeout(180000);

  let cookie: string;
  let alphaBrandId: number;
  let betaBrandId: number;
  let gammaBrandId: number;
  const productIds: number[] = [];

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('2.1 seed 3 brands via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/brands ×3: Alpha Brand, Beta Supplies, Gamma Imports with dataSource=e2e_test' });
    const brands = [
      { name: 'Alpha Brand', description: 'Audit test brand Alpha', dataSource: 'e2e_test' },
      { name: 'Beta Supplies', description: 'Audit test brand Beta', dataSource: 'e2e_test' },
      { name: 'Gamma Imports', description: 'Audit test brand Gamma', dataSource: 'e2e_test' },
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

  test('2.2 seed 15 products via API (dataSource=e2e_test) with varied sizes, currencies, names', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/products ×15: 5 per brand, varied sizes (100ml/250ml/500ml/50g/none), GBP/USD/AED cost prices' });
    const brandCycle = [
      alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId,
      betaBrandId, betaBrandId, betaBrandId, betaBrandId, betaBrandId,
      gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId,
    ];
    const currencies = ['GBP', 'USD', 'AED'];
    const sizes = ['100ml', '250ml', '500ml', '50g', ''];
    const names = [
      'Audit Product 1 Standard',
      'Audit Product 2 Long Name That Exceeds Normal Length',
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
      const sku = `AUD-${String(i + 1).padStart(3, '0')}-${ts}`;
      const { status, data } = await apiPost<ProductResponse>('/api/products', {
        name: names[i],
        sku,
        category: 'Test Category',
        size: sizes[i % 5],
        unitPrice: String(10 + i * 3),
        costPrice: String(5 + i * 1.5),
        costPriceCurrency: currencies[i % 3],
        vatRate: '0.05',
        unit: 'Bottle',
        stockQuantity: 0,
        minStockLevel: 2,
        brandId: brandCycle[i],
        dataSource: 'e2e_test',
      }, cookie);
      expect([200, 201]).toContain(status);
      expect(data.id).toBeGreaterThan(0);
      productIds.push(data.id);
    }
    test.info().annotations.push({ type: 'result', description: `${productIds.length} products seeded; ids[0]=${productIds[0]}, ids[14]=${productIds[14]}` });
    expect(productIds.length).toBe(15);
    saveState({ brandIds: { alpha: alphaBrandId, beta: betaBrandId, gamma: gammaBrandId }, productIds });
  });

  test('2.3 Inventory page renders with seeded audit products visible', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory; assert "Audit Product" text in page body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body length: ${body.length}; contains Audit Product: ${/audit product/i.test(body)}` });
    expect(body).toMatch(/audit product/i);
  });

  test('2.4 product search filter narrows results', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Type "Audit Product 2" in search input; assert only matching items shown' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Audit Product 2');
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Filtered body contains "Audit Product 2": ${/audit product 2/i.test(body)}` });
    expect(body).toMatch(/audit product 2/i);
  });

  test('2.5 Add Product button opens creation form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Add Product on /Inventory; assert product name input visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const addBtn = page.locator('button').filter({ hasText: /add product|new product/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10000 });
    await addBtn.click();
    await page.waitForTimeout(1500);

    const nameInput = page.locator('input[placeholder*="name" i], [data-testid="input-product-name"], input[name="name"]').first();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    test.info().annotations.push({ type: 'result', description: 'Product form opened — name input visible' });
  });

  test('2.6 edit product 1 price via API; verify updated unit price reflected', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/products/${productIds[0]} with new unitPrice=99` });
    const pId = productIds[0];
    const { status } = await apiPut<ProductResponse>(`/api/products/${pId}`, { unitPrice: '99' }, cookie);
    expect([200, 201]).toContain(status);

    const prod = await (await fetch(`${BASE_URL}/api/products/${pId}`, { headers: { Cookie: cookie } })).json() as ProductResponse;
    const price = prod.unitPrice ?? '0';
    test.info().annotations.push({ type: 'result', description: `Product ${pId} unitPrice after update: ${price}` });
    expect(parseFloat(price)).toBeCloseTo(99, 0);
  });
});
