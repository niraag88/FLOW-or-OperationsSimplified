import { test, expect } from '@playwright/test';
import { login, BASE_URL } from './helpers';

test.describe('UI Flows — page loads, dialogs, navigation', () => {
  test.setTimeout(60000);

  test('dashboard page loads with sidebar and main content', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/Dashboard`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/dashboard|internal|external/i);
    expect(text.length).toBeGreaterThan(30);
  });

  test('delivery orders page has "Create from Existing" button', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const btn = page.locator('button').filter({ hasText: /create from existing/i }).first();
    await btn.waitFor({ timeout: 20000 });
    await expect(btn).toBeVisible();
  });

  test('DO "Create from Existing" dialog opens and contains document selector', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    const btn = page.locator('button').filter({ hasText: /create from existing/i }).first();
    await btn.waitFor({ timeout: 20000 });
    await btn.click();
    await page.waitForTimeout(1500);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/quotation|invoice|document|select|choose/i);
  });

  test('stock count page renders and shows relevant controls', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/stock-count`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/stock|count|product|inventory/i);
  });

  test('reports page renders successfully', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/Reports`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(30);
    expect(text).toMatch(/report|revenue|sales|summary/i);
  });

  test('purchase orders page loads with controls visible', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/purchase order|new purchase order/i);
  });

  test('invoices page loads with controls visible', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/invoice|new invoice/i);
  });

  test('inventory page loads with product listing controls', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/product|inventory|add product/i);
  });

  test('dashboard page total navigation + load time under 12 seconds', async ({ page }) => {
    await login(page);
    const navStart = Date.now();
    await page.goto(`${BASE_URL}/Dashboard`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(1000);
    const elapsed = Date.now() - navStart;
    expect(elapsed).toBeLessThan(12000);
  });
});
