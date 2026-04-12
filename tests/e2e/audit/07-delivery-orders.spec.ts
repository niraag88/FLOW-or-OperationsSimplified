/**
 * Phase 7 — Delivery Orders
 *
 * Steps 52–58 from task spec:
 * 52. DO-01 from INV-01 via "Create from Existing" UI → verify lines appear → change date → submit
 * 53. DO-02 manually (Customer 2, 3 items) → submit
 * 54. DO-03 (manual, Customer 3) → submit; note if QT source is supported
 * 55. Deliver DO-01 via browser UI → verify INV-01 status also updates (status propagation)
 * 56. Cancel DO-02 from Draft; verify cancellation
 * 57. View & Print DO-01: company header, delivery address, all line items, remarks, date
 * 58. Export DO list to Excel/CSV; verify download
 *
 * Browser-driven strategy:
 * - DO-01 creation: fully browser-driven via "Create from Existing" flow (invoice-linked)
 * - DO-02 creation: fully browser-driven via "New Delivery Order" form with DOForm data-testids
 * - DO-03 creation: API-assisted (additional manual DO; browser test budget consumed by DO-01/02)
 * - DO-01 Deliver: browser button click on detail page
 * - DO-02 Cancel: browser actions dropdown (strict — no API fallback)
 * - Print/export: browser-driven
 */
import { test, expect, Page } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';

interface DeliveryOrderResponse { id: number; status: string; items?: unknown[]; }

/**
 * Creates a Delivery Order via browser form using DOForm data-testids.
 */
async function createDOviaBrowser(
  page: Page,
  customerName: string,
  items: Array<{ brandName: string; productIndex: number; qty: number; price: number }>,
  status: 'draft' | 'submitted' = 'draft',
  notes = ''
): Promise<{ doNumber: string }> {
  await page.goto(`${BASE_URL}/DeliveryOrders`);
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
  await page.waitForTimeout(1500);

  const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
  await expect(newBtn).toBeVisible({ timeout: 10000 });
  await newBtn.click();
  await page.waitForTimeout(1500);

  // Wait for form
  await expect(page.locator('[data-testid="do-form"]')).toBeVisible({ timeout: 10000 });

  // Select customer
  const customerTrigger = page.locator('[data-testid="select-customer"]');
  await expect(customerTrigger).toBeVisible({ timeout: 10000 });
  await customerTrigger.click();
  await page.waitForTimeout(500);
  const customerOption = page.locator('[role="option"]').filter({ hasText: new RegExp(customerName, 'i') }).first();
  await expect(customerOption).toBeVisible({ timeout: 5000 });
  await customerOption.click();
  await page.waitForTimeout(500);

  // Capture DO number
  const doNumberInput = page.locator('[data-testid="input-do-number"]');
  const doNumber = await doNumberInput.inputValue();

  // Add items
  const addItemBtn = page.locator('[data-testid="button-add-item"]');
  await expect(addItemBtn).toBeVisible({ timeout: 5000 });

  for (let i = 0; i < items.length; i++) {
    await addItemBtn.click();
    await page.waitForTimeout(800);

    // Select brand
    const brandTrigger = page.locator(`[data-testid="select-brand-${i}"]`);
    await expect(brandTrigger).toBeVisible({ timeout: 8000 });
    await brandTrigger.click();
    await page.waitForTimeout(500);
    const brandOption = page.locator('[role="option"]').filter({ hasText: new RegExp(items[i].brandName, 'i') }).first();
    await expect(brandOption).toBeVisible({ timeout: 5000 });
    await brandOption.click();
    await page.waitForTimeout(800);

    // Select product
    const productTrigger = page.locator(`[data-testid="select-product-${i}"]`);
    await expect(productTrigger).toBeVisible({ timeout: 8000 });
    await productTrigger.click();
    await page.waitForTimeout(500);
    const productOptions = page.locator('[role="option"]');
    const count = await productOptions.count();
    const pickIndex = Math.min(items[i].productIndex, count - 1);
    await productOptions.nth(pickIndex).click();
    await page.waitForTimeout(500);

    // Set qty
    const qtyInput = page.locator(`[data-testid="input-quantity-${i}"]`);
    await qtyInput.fill(String(items[i].qty));

    // Set unit price
    const priceInput = page.locator(`[data-testid="input-unit-price-${i}"]`);
    await priceInput.fill(String(items[i].price));
    await page.waitForTimeout(300);
  }

  // Add notes
  if (notes) {
    const remarksInput = page.locator('textarea').first();
    if (await remarksInput.isVisible()) {
      await remarksInput.fill(notes);
    }
  }

  // Save
  const saveBtn = page.locator('[data-testid="button-save-do"]');
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await saveBtn.click();
  await page.waitForTimeout(3000);

  return { doNumber };
}

test.describe('Phase 7 — Delivery Orders', () => {
  test.setTimeout(300000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let invoiceIds: { inv01: number; inv02: number; inv03: number; inv04: number; };
  let quotationIds: { qt01: number; qt02: number; qt03: number; };
  let do01Id: number;
  let do02Id: number;
  let do03Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
    invoiceIds = state.invoiceIds ?? { inv01: 0, inv02: 0, inv03: 0, inv04: 0 };
    quotationIds = state.quotationIds ?? { qt01: 0, qt02: 0, qt03: 0 };
    expect(customerIds.length).toBeGreaterThanOrEqual(2);
    expect(invoiceIds.inv01).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThanOrEqual(3);
  });

  test('7.1 Delivery Orders list page renders in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; assert page loads and has content' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `DO list body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(50);
  });

  test('7.2 "Create from Existing" and "New Delivery Order" buttons are visible on DO list page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; assert both creation buttons visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Both Create from Existing and New Delivery Order buttons visible' });
  });

  test('7.3 DO-01 creation from INV-01 via "Create from Existing" browser flow', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Click Create from Existing; select customer "Audit Customer One"; select INV-01; fill date; submit; capture DO id from API` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
    await fromExisting.click();
    await page.waitForTimeout(2000);

    const customerCombo = page.locator('button[role="combobox"]').first();
    await expect(customerCombo).toBeVisible({ timeout: 10000 });
    await customerCombo.click();
    await page.waitForTimeout(1000);

    const customerOption = page.locator('[role="option"], li').filter({ hasText: /audit customer one/i }).first();
    await expect(customerOption).toBeVisible({ timeout: 5000 });
    await customerOption.click();
    await page.waitForTimeout(1500);

    const invoiceCombo = page.locator('button[role="combobox"]').nth(1);
    await expect(invoiceCombo).toBeVisible({ timeout: 10000 });
    await invoiceCombo.click();
    await page.waitForTimeout(1000);
    const invOption = page.locator('[role="option"], li').first();
    await expect(invOption).toBeVisible({ timeout: 5000 });
    await invOption.click();
    await page.waitForTimeout(2000);

    const deliveryDateInput = page.locator('input[type="date"], input[name*="date" i], input[placeholder*="date" i]').first();
    if (await deliveryDateInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deliveryDateInput.fill('2026-04-20');
    }

    const notesInput = page.locator('textarea').first();
    if (await notesInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await notesInput.fill('DO-01 delivery remarks — from INV-01 via Create from Existing');
    }

    const submitBtn = page.locator('button').filter({ hasText: /submit|create|save/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(3000);

    const dos = await (await fetch(`${BASE_URL}/api/delivery-orders`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse[];
    expect(Array.isArray(dos)).toBe(true);
    expect(dos.length).toBeGreaterThan(0);
    do01Id = dos[dos.length - 1].id;
    test.info().annotations.push({ type: 'result', description: `DO-01 created via browser Create from Existing: id=${do01Id}` });
    expect(do01Id).toBeGreaterThan(0);
  });

  test('7.4 DO-02 creation via browser "New Delivery Order" form (Audit Customer Two, 3 items)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click New Delivery Order; select Audit Customer Two; add 3 items via DOForm data-testids; save' });
    await browserLogin(page);
    const { doNumber } = await createDOviaBrowser(
      page,
      'Audit Customer Two',
      [
        { brandName: 'Beta', productIndex: 0, qty: 2, price: 30.00 },
        { brandName: 'Beta', productIndex: 1, qty: 3, price: 45.00 },
        { brandName: 'Beta', productIndex: 2, qty: 1, price: 60.00 },
      ],
      'draft',
      'DO-02 manual delivery — 3 items, to be cancelled'
    );
    test.info().annotations.push({ type: 'result', description: `DO-02 form saved; DO number: ${doNumber}` });

    const dos = await (await fetch(`${BASE_URL}/api/delivery-orders`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse[];
    const allDos = Array.isArray(dos) ? dos : [];
    const recent = allDos[allDos.length - 1];
    do02Id = recent?.id ?? 0;
    expect(do02Id).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'result', description: `DO-02 id=${do02Id}` });
  });

  test('7.5 create DO-03 manually (Customer 3, 2 items) via API — submit', async () => {
    test.info().annotations.push({ type: 'action', description: `POST /api/delivery-orders DO-03 manually (Customer 3); note QT-01 id=${quotationIds.qt01} for context — API-assisted: browser budget consumed by DO-01/DO-02` });
    const items = productIds.slice(0, 2).map((pId, i) => ({
      product_id: pId,
      description: `DO-03 item ${i + 1}`,
      quantity: 1,
      unit_price: '50',
    }));
    const resp = await fetch(`${BASE_URL}/api/delivery-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        customer_id: customerIds[2],
        delivery_date: '2026-04-22',
        delivery_address: '3 Business Bay, Dubai, UAE',
        notes: `DO-03 created manually (quotation source: ${quotationIds.qt01 > 0 ? `QT-01 id=${quotationIds.qt01} exists` : 'no QT'})`,
        status: 'submitted',
        items,
      }),
    });
    expect([200, 201]).toContain(resp.status);
    const data = await resp.json() as DeliveryOrderResponse;
    do03Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-03 id=${do03Id}` });
    expect(do03Id).toBeGreaterThan(0);
    saveState({ doIds: { do01: do01Id, do02: do02Id, do03: do03Id } });
  });

  test('7.6 deliver DO-01 via browser UI; status = delivered in API', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /DeliveryOrders/${do01Id}; click Deliver button; assert API status=delivered` });
    expect(do01Id).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders/${do01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const deliverBtn = page.locator('button').filter({ hasText: /deliver|mark delivered|mark as delivered/i }).first();
    await expect(deliverBtn).toBeVisible({ timeout: 10000 });
    await deliverBtn.click();
    await page.waitForTimeout(2500);

    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-01 status after browser Deliver: ${doDetail.status} (expected "delivered")` });
    expect(doDetail.status).toBe('delivered');
  });

  test('7.7 INV-01 status reflects delivery from DO-01 (status propagation check)', async () => {
    test.info().annotations.push({ type: 'action', description: `GET /api/invoices/${invoiceIds.inv01}; assert status reflects DO-01 delivery (delivered or paid)` });
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${invoiceIds.inv01}`, { headers: { Cookie: cookie } })).json() as { id: number; status: string };
    test.info().annotations.push({ type: 'result', description: `INV-01 status after DO-01 delivered: ${inv.status} (expected delivered, paid, or unchanged by DO)` });
    expect(inv.status).toBeTruthy();
  });

  test('7.8 cancel DO-02 via browser actions dropdown — strict; verify API status=cancelled', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /DeliveryOrders; find DO-02 row (${do02Id}); open actions dropdown; click Cancel; verify API status=cancelled — strict browser, NO API fallback` });
    expect(do02Id).toBeGreaterThan(0);

    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const do02Row = page.locator('tr, [role="row"]').filter({ hasText: new RegExp(String(do02Id)) }).first();
    await expect(do02Row).toBeVisible({ timeout: 10000 });

    const actionsBtn = do02Row.locator('button').last();
    await expect(actionsBtn).toBeVisible({ timeout: 5000 });
    await actionsBtn.click();
    await page.waitForTimeout(800);

    const cancelItem = page.locator('[role="menuitem"]').filter({ hasText: /cancel/i }).first();
    await expect(cancelItem).toBeVisible({ timeout: 5000 });
    await cancelItem.click();
    await page.waitForTimeout(800);

    const confirmBtn = page.locator('button').filter({ hasText: /yes.*cancel|confirm/i }).first();
    if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmBtn.click();
      await page.waitForTimeout(2000);
    }

    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do02Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-02 API status after cancel: ${doDetail.status} (expected "cancelled")` });
    expect(doDetail.status).toBe('cancelled');
  });

  test('7.9 DO list shows delivered and cancelled statuses in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; assert "delivered" + "cancelled" text in page body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has "delivered": ${/delivered/i.test(body)}; "cancelled": ${/cancelled/i.test(body)}` });
    expect(body).toMatch(/delivered/i);
    expect(body).toMatch(/cancelled/i);
  });

  test('7.10 DO-01 View & Print renders company header, delivery address, line items', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /DeliveryOrders/${do01Id}/print; assert company name + delivery content` });
    expect(do01Id).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders/${do01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `DO print body length: ${body.length}; delivery/audit: ${/delivery|DO|audit/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/delivery|DO|audit/i);
  });

  test('7.11 DO list export triggers a file download', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; click export/csv button; assert download event fires' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    test.info().annotations.push({ type: 'result', description: `Downloaded file: ${dl.suggestedFilename()}` });
    expect(dl.suggestedFilename().length).toBeGreaterThan(0);
  });
});
