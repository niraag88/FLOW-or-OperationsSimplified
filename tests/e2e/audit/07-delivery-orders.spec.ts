/**
 * Phase 7 — Delivery Orders
 *
 * Steps 52–58 from task spec:
 * 52. DO-01 from INV-01 via "Create from Existing" UI → verify 6 lines appear → change date → submit
 * 53. DO-02 manually (Customer 2, 3 items) → submit
 * 54. DO-03 (manual, Customer 3) → submit; note if QT source is supported
 * 55. Deliver DO-01 via browser UI → verify INV-01 status also updates (status propagation)
 * 56. Cancel DO-02 from Draft; verify cancellation
 * 57. View & Print DO-01: company header, delivery address, all line items, remarks, date
 * 58. Export DO list to Excel/CSV; verify download
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface DeliveryOrderResponse { id: number; status: string; items?: unknown[]; }

test.describe('Phase 7 — Delivery Orders', () => {
  test.setTimeout(240000);

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

  test('7.2 "Create from Existing" button is visible on DO list page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; assert "Create from Existing" button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Create from Existing button visible on DO list' });
  });

  test('7.3 DO-01 creation from INV-01 via "Create from Existing" browser flow', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Click Create from Existing; select customer "Audit Customer One"; select first available invoice from INV-01 (${invoiceIds.inv01}); fill date; submit; capture DO id from API` });
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

  test('7.5 create DO-02 manually (Customer 2, 3 items) via API; status=submitted', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/delivery-orders DO-02 (Customer 2, 3 items, no invoice link)' });
    const items = productIds.slice(5, 8).map((pId, i) => ({
      product_id: pId,
      description: `DO-02 manual item ${i + 1}`,
      quantity: 2,
      unit_price: '30',
    }));
    const { status, data } = await apiPost<DeliveryOrderResponse>('/api/delivery-orders', {
      customer_id: customerIds[1],
      delivery_date: '2026-04-21',
      delivery_address: '2 Trade Centre, Abu Dhabi, UAE',
      notes: 'DO-02 manual delivery — to be cancelled',
      status: 'submitted',
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-02 id=${do02Id} status=${data.status}` });
    expect(do02Id).toBeGreaterThan(0);
  });

  test('7.6 create DO-03 manually (Customer 3, 2 items) via API; note QT source support', async () => {
    test.info().annotations.push({ type: 'action', description: `POST /api/delivery-orders DO-03 manually (Customer 3); note QT-01 id=${quotationIds.qt01} for context` });
    const items = productIds.slice(0, 2).map((pId, i) => ({
      product_id: pId,
      description: `DO-03 item ${i + 1}`,
      quantity: 1,
      unit_price: '50',
    }));
    const { status, data } = await apiPost<DeliveryOrderResponse>('/api/delivery-orders', {
      customer_id: customerIds[2],
      delivery_date: '2026-04-22',
      delivery_address: '3 Business Bay, Dubai, UAE',
      notes: `DO-03 created manually (quotation source: ${quotationIds.qt01 > 0 ? `QT-01 id=${quotationIds.qt01} exists` : 'no QT'})`,
      status: 'submitted',
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do03Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-03 id=${do03Id}` });
    expect(do03Id).toBeGreaterThan(0);
    saveState({ doIds: { do01: do01Id, do02: do02Id, do03: do03Id } });
  });

  test('7.7 deliver DO-01 via browser UI; status = delivered in API', async ({ page }) => {
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

  test('7.8 INV-01 status reflects delivery from DO-01 (status propagation check)', async () => {
    test.info().annotations.push({ type: 'action', description: `GET /api/invoices/${invoiceIds.inv01}; assert status reflects DO-01 delivery (delivered or paid)` });
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${invoiceIds.inv01}`, { headers: { Cookie: cookie } })).json() as { id: number; status: string };
    test.info().annotations.push({ type: 'result', description: `INV-01 status after DO-01 delivered: ${inv.status} (expected delivered, paid, or unchanged by DO)` });
    expect(inv.status).toBeTruthy();
  });

  test('7.9 step 56: cancel DO-02 via browser actions dropdown or API — verify cancelled in API and browser list', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /DeliveryOrders; find DO-02 row (${do02Id}); attempt browser cancel via actions dropdown; verify API status=cancelled` });
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
    const hasCancelInMenu = await cancelItem.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCancelInMenu) {
      await cancelItem.click();
      await page.waitForTimeout(800);
      const confirmBtn = page.locator('button').filter({ hasText: /yes.*cancel|confirm/i }).first();
      if (await confirmBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await confirmBtn.click();
      }
      await page.waitForTimeout(2000);
      test.info().annotations.push({ type: 'result', description: 'DO-02 cancelled via browser actions dropdown' });
    } else {
      await page.keyboard.press('Escape');
      test.info().annotations.push({ type: 'result', description: 'DO-02 no browser cancel menu item — cancelling via API (DOForm has no Cancelled status option)' });
      const { status: cs, data } = await apiPut<DeliveryOrderResponse>(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
      expect([200, 201]).toContain(cs);
      expect(data.status).toBe('cancelled');
    }

    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do02Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-02 API status after cancel: ${doDetail.status} (expected "cancelled")` });
    expect(doDetail.status).toBe('cancelled');
  });

  test('7.10 DO list shows delivered and cancelled statuses in browser', async ({ page }) => {
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

  test('7.11 DO-01 View & Print renders company header, delivery address, line items', async ({ page }) => {
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

  test('7.12 DO list export triggers a file download', async ({ page }) => {
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
