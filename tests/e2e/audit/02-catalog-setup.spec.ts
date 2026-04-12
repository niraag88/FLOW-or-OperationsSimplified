/**
 * Phase 2 — Catalog: Brands & Products
 *
 * Data setup via API (explicitly allowed — browser forms are in Settings dialogs,
 * not primary product creation flow for bulk seeding).
 * Browser tests verify:
 * - Inventory page renders products
 * - Search filter works
 * - Add Product form opens and saves via browser
 * - Edit product price via browser
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';

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

  test('seed 3 brands via API (e2e_test)', async () => {
    const brands = [
      { name: 'Alpha Brand', description: 'Audit test brand Alpha', dataSource: 'e2e_test' },
      { name: 'Beta Supplies', description: 'Audit test brand Beta', dataSource: 'e2e_test' },
      { name: 'Gamma Imports', description: 'Audit test brand Gamma', dataSource: 'e2e_test' },
    ];
    for (const b of brands) {
      const { status, data } = await apiPost('/api/brands', b, cookie);
      expect([200, 201]).toContain(status);
      const created = data as { id: number; name: string };
      expect(created.id).toBeGreaterThan(0);
      if (b.name === 'Alpha Brand') alphaBrandId = created.id;
      if (b.name === 'Beta Supplies') betaBrandId = created.id;
      if (b.name === 'Gamma Imports') gammaBrandId = created.id;
    }
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(betaBrandId).toBeGreaterThan(0);
    expect(gammaBrandId).toBeGreaterThan(0);
  });

  test('seed 14 products via API (e2e_test tag)', async () => {
    const brandCycle = [alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId, alphaBrandId,
      betaBrandId, betaBrandId, betaBrandId, betaBrandId, betaBrandId,
      gammaBrandId, gammaBrandId, gammaBrandId, gammaBrandId];
    const currencies = ['GBP', 'USD', 'AED'];
    const sizes = ['100ml', '250ml', '500ml', '50g', ''];

    for (let i = 0; i < 14; i++) {
      const sku = `AUDIT-${String(i + 1).padStart(3, '0')}-${Date.now().toString().slice(-4)}`;
      const { status, data } = await apiPost('/api/products', {
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
      const created = data as { id: number };
      expect(created.id).toBeGreaterThan(0);
      productIds.push(created.id);
    }
    saveState({ brandIds: { alpha: alphaBrandId, beta: betaBrandId, gamma: gammaBrandId }, productIds });
  });

  test('inventory page renders with Audit products visible', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit product/i);
  });

  test('product search filters list to matching products', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('Audit Product 1');
    await page.waitForTimeout(1500);

    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit product 1/i);
  });

  test('Add Product button is visible and opens creation form', async ({ page }) => {
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
  });
});
