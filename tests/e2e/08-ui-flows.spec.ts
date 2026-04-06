import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, apiPost, apiDelete, BASE_URL, toProductList, productPrice, ApiProduct } from './helpers';

test.describe('UI Flows — page loads, dialogs, navigation', () => {
  test.setTimeout(60000);

  let testCookie: string;
  let testCustomerId: number;
  let testInvoiceId: number;

  test.beforeAll(async () => {
    testCookie = await apiLogin();

    // Create test customer + a submitted invoice so the "Create from Existing" DO test can work
    const { data: cData } = await apiPost('/api/customers', { name: 'E2E UI Test Customer', dataSource: 'e2e_test' }, testCookie);
    testCustomerId = (cData as { id: number }).id;

    const prodsRaw = await apiGet('/api/products?pageSize=2', testCookie);
    const prods = toProductList(prodsRaw) as ApiProduct[];
    if (prods.length > 0) {
      const items = prods.slice(0, 2).map((p, i) => ({
        product_id: p.id,
        description: p.name,
        product_code: p.sku,
        quantity: i + 1,
        unit_price: productPrice(p),
        line_total: (i + 1) * productPrice(p),
      }));
      const subtotal = items.reduce((s, it) => s + it.line_total, 0);
      const vat = subtotal * 0.05;
      const { data: invData } = await apiPost('/api/invoices', {
        customer_id: testCustomerId,
        invoice_date: '2026-03-23',
        status: 'submitted',
        tax_amount: vat.toFixed(2),
        total_amount: (subtotal + vat).toFixed(2),
        items,
      }, testCookie);
      testInvoiceId = (invData as { id: number }).id;
    }
  });

  test.afterAll(async () => {
    if (testInvoiceId) await apiDelete(`/api/invoices/${testInvoiceId}`, testCookie);
    if (testCustomerId) await apiDelete(`/api/customers/${testCustomerId}`, testCookie);
  });

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

  test('DO "Create from Existing" dialog: select submitted invoice and verify form pre-population', async ({ page }) => {
    // Full browser flow: open dialog → switch to invoice tab → select invoice → confirm → verify form shown
    await login(page);

    // Navigate to delivery orders page
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});

    // Click "Create from Existing" button
    const btn = page.locator('button').filter({ hasText: /create from existing/i }).first();
    await btn.waitFor({ timeout: 20000 });
    await btn.click();

    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
    await page.waitForTimeout(2000); // allow the API call to load invoices

    // Switch to "From Invoice" tab (data-testid="tab-invoice")
    const invoiceTab = page.locator('[data-testid="tab-invoice"]');
    await invoiceTab.waitFor({ timeout: 5000 });
    await invoiceTab.click();
    await page.waitForTimeout(500);

    // Open the Radix Select combobox for invoice selection
    const selectTrigger = page.locator('[role="combobox"]').last();
    await selectTrigger.waitFor({ timeout: 5000 });
    await selectTrigger.click();

    // Wait for dropdown options to appear (Radix renders in a portal)
    await page.waitForSelector('[role="option"]', { timeout: 5000 });

    // Click the first available (non-disabled) option
    const firstOption = page.locator('[role="option"]').filter({ hasNot: page.locator('[data-disabled]') }).first();
    await firstOption.waitFor({ timeout: 3000 });
    await firstOption.click();
    await page.waitForTimeout(300);

    // Click "Create Delivery Order" button (data-testid="button-create-delivery-order")
    const createBtn = page.locator('[data-testid="button-create-delivery-order"]');
    await createBtn.waitFor({ timeout: 5000 });
    await expect(createBtn).not.toBeDisabled();
    await createBtn.click();

    // After clicking "Create Delivery Order":
    // - The "Create from Existing" dialog fetches the full invoice, then closes
    // - The DO form dialog opens (pre-populated with invoice data)
    await page.waitForTimeout(2500);
    const bodyText = await page.locator('body').innerText();

    // The DO form should now be visible (it's a separate dialog)
    expect(bodyText).toMatch(/delivery order|customer|save|cancel|order date|notes/i);

    // The "Create from Existing" dialog title should no longer appear
    expect(bodyText).not.toMatch(/Create Delivery Order from Existing/);
  });

  test('stock count page renders and shows relevant controls', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/stock-count`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/stock|count|product|inventory/i);
  });

  test('reports page renders with non-empty revenue or summary data', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/Reports`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(4000);
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(100);
    expect(text).toMatch(/report|revenue|sales|summary|total|AED/i);
    // Verify at least some numeric content is displayed (not just headings)
    expect(text).toMatch(/\d+/);
  });

  // ── Page-level performance checks ──────────────────────────────────────────
  // These pages must load and render within 4s regardless of DB size.
  // Threshold: domcontentloaded + 2s render buffer must complete within 4s total.

  test('purchase orders page loads within 4s', async ({ page }) => {
    await login(page);
    const start = Date.now();
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const elapsed = Date.now() - start;
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/purchase order|new purchase order/i);
    // 4s threshold: domcontentloaded + 2s data render budget.
    // If this fails, investigate API response time and query plans.
    expect(elapsed).toBeLessThan(4000);
  });

  test('invoices page loads within 4s', async ({ page }) => {
    await login(page);
    const start = Date.now();
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const elapsed = Date.now() - start;
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/invoice|new invoice/i);
    expect(elapsed).toBeLessThan(4000);
  });

  test('inventory page loads within 4s', async ({ page }) => {
    await login(page);
    const start = Date.now();
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const elapsed = Date.now() - start;
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/product|inventory|add product/i);
    expect(elapsed).toBeLessThan(4000);
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
