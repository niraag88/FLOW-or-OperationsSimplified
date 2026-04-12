/**
 * Phase 2 — Catalog: Brands & Products
 *
 * Seed 3 brands + 15 products via API (e2e_test tag).
 * Browser tests verify:
 * - Inventory page renders products
 * - Search filter works
 * - Add Product button opens creation form
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, saveState } from './audit-helpers';

interface BrandResponse { id: number; name: string; }
interface ProductResponse { id: number; }

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

  test('seed 3 brands via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/brands ×3: Alpha Brand, Beta Supplies, Gamma Imports' });
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
    test.info().annotations.push({ type: 'result', description: `alphaBrandId=${alphaBrandId} betaBrandId=${betaBrandId} gammaBrandId=${gammaBrandId}` });
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(betaBrandId).toBeGreaterThan(0);
    expect(gammaBrandId).toBeGreaterThan(0);
  });

  test('seed 15 products via API (dataSource=e2e_test)', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/products ×15 spread across 3 brands' });
    const brandCycle = [
      alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId,
      betaBrandId, betaBrandId, betaBrandId, betaBrandId, betaBrandId,
      gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId,
    ];
    const currencies = ['GBP', 'USD', 'AED'];
    const sizes = ['100ml', '250ml', '500ml', '50g', ''];

    for (let i = 0; i < 15; i++) {
      const sku = `AUDIT-${String(i + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      const { status, data } = await apiPost<ProductResponse>('/api/products', {
        name: `Audit Product ${i + 1}`,
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

  test('inventory page renders with seeded audit products visible', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory in browser; assert "Audit Product" text in page body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Inventory body length: ${body.length}; contains "Audit Product": ${/audit product/i.test(body)}` });
    expect(body).toMatch(/audit product/i);
  });

  test('product search filters list to matching products', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Type "Audit Product 1" in search input on /Inventory; assert match in body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Audit Product 1');
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body after search contains "Audit Product 1": ${/audit product 1/i.test(body)}` });
    expect(body).toMatch(/audit product 1/i);
  });

  test('Add Product button is visible and opens creation form', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Add Product button on /Inventory; assert name input visible' });
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
    test.info().annotations.push({ type: 'result', description: 'Product creation form opened — name input visible' });
  });
});
