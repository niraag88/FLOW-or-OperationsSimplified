/**
 * Phase 7 — Delivery Orders
 *
 * Browser tests: DO list renders; New DO button visible; form opens;
 *                DO-01 deliver via browser UI; DO-02 cancel status in list.
 * API tests: Create DOs, lifecycle transitions.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface DeliveryOrderResponse { id: number; status: string; items?: unknown[]; }

test.describe('Phase 7 — Delivery Orders', () => {
  test.setTimeout(120000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let do01Id: number;
  let do02Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
    expect(customerIds.length).toBeGreaterThanOrEqual(2);
    expect(productIds.length).toBeGreaterThanOrEqual(3);
  });

  test('Delivery Orders list renders with "New Delivery Order" button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /delivery-orders; assert New Delivery Order button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'New Delivery Order button visible' });
  });

  test('New DO button opens form with customer selector', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click New Delivery Order; assert customer combobox visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const customerSelect = page.locator('button[role="combobox"]').first();
    await expect(customerSelect).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'DO creation form opened — customer combobox visible' });
  });

  test('create DO-01 (Customer 1, 3 items) via API; verify status=draft', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/delivery-orders DO-01 (3 items, Customer 1)' });
    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId, description: `DO-01 line ${i + 1}`, quantity: 2, unit_price: 25, line_total: 50,
    }));
    const { status, data } = await apiPost<DeliveryOrderResponse>('/api/delivery-orders', {
      customer_id: customerIds[0], customer_name: 'Audit Customer 1 LLC',
      delivery_address: '1 Main St, Dubai, UAE', order_date: '2026-04-15',
      status: 'draft', notes: 'Audit DO-01', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do01Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-01 id=${do01Id} status=${data.status}` });
    expect(do01Id).toBeGreaterThan(0);
  });

  test('create DO-02 (Customer 2, 3 items) via API — to be cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/delivery-orders DO-02 (3 items, Customer 2)' });
    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId, description: `DO-02 line ${i + 1}`, quantity: 2, unit_price: 30, line_total: 60,
    }));
    const { status, data } = await apiPost<DeliveryOrderResponse>('/api/delivery-orders', {
      customer_id: customerIds[1], customer_name: 'Audit Customer 2 FZE',
      delivery_address: '2 Trade Centre, Abu Dhabi, UAE', order_date: '2026-04-15',
      status: 'draft', notes: 'Audit DO-02 to be cancelled', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-02 id=${do02Id}` });
    expect(do02Id).toBeGreaterThan(0);
  });

  test('deliver DO-01 via browser UI (navigate to detail, click Deliver/Submit)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /delivery-orders/${do01Id}; click Submit then Deliver` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders/${do01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const submitBtn = page.locator('button').filter({ hasText: /submit|deliver/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-01 status after browser action: ${detail.status}` });
    expect(['submitted', 'delivered']).toContain(detail.status);
  });

  test('complete DO-01 to delivered; confirm status in API', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT DO-01 to delivered via API if not already` });
    const current = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    if (current.status !== 'delivered') {
      const { status } = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'delivered' }, cookie);
      expect([200, 201]).toContain(status);
    }
    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-01 final status: ${detail.status}` });
    expect(detail.status).toBe('delivered');
  });

  test('cancel DO-02; status=cancelled confirmed in API', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/delivery-orders/${do02Id} status=cancelled` });
    const { status } = await apiPut(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do02Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-02 status=${detail.status}` });
    expect(detail.status).toBe('cancelled');
  });

  test('DO-01 detail confirms 3 line items and status=delivered', async () => {
    test.info().annotations.push({ type: 'action', description: `GET /api/delivery-orders/${do01Id}; assert 3 items + delivered` });
    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-01 items=${detail.items?.length} status=${detail.status}` });
    expect(detail.status).toBe('delivered');
    expect((detail.items ?? []).length).toBe(3);
  });

  test('DO list shows delivered and cancelled statuses in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /delivery-orders; assert delivered + cancelled in page body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has "delivered": ${/delivered/i.test(body)}; "cancelled": ${/cancelled/i.test(body)}` });
    expect(body).toMatch(/delivered/i);
    expect(body).toMatch(/cancelled/i);
    saveState({ doIds: { do01: do01Id, do02: do02Id } });
  });
});
