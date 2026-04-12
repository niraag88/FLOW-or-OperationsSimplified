/**
 * Phase 7 — Delivery Orders
 *
 * Browser tests: DO list renders; New DO button visible; DO status (delivered/cancelled) in list.
 * API tests: Create DOs, lifecycle transitions, verify status persistence.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

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

  test('Delivery Orders list page renders with "New Delivery Order" button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test('New DO button opens form with customer selector', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const customerSelect = page.locator('button[role="combobox"]').first();
    await expect(customerSelect).toBeVisible({ timeout: 10000 });
  });

  test('create DO-01 (Customer 1, 3 items) via API; verify status=draft', async () => {
    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId, description: `DO-01 line ${i + 1}`, quantity: 2, unit_price: 25, line_total: 50,
    }));
    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: customerIds[0], customer_name: 'Audit Customer 1 LLC',
      delivery_address: '1 Main St, Dubai, UAE', order_date: '2026-04-15',
      status: 'draft', notes: 'Audit DO-01', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do01Id = (data as { id: number }).id;
    expect(do01Id).toBeGreaterThan(0);
  });

  test('create DO-02 (Customer 2, 3 items) via API — to be cancelled', async () => {
    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId, description: `DO-02 line ${i + 1}`, quantity: 2, unit_price: 30, line_total: 60,
    }));
    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: customerIds[1], customer_name: 'Audit Customer 2 FZE',
      delivery_address: '2 Trade Centre, Abu Dhabi, UAE', order_date: '2026-04-15',
      status: 'draft', notes: 'Audit DO-02 to be cancelled', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do02Id = (data as { id: number }).id;
    expect(do02Id).toBeGreaterThan(0);
  });

  test('DO-01: Draft → Submitted → Delivered; status=delivered confirmed in API', async () => {
    const s1 = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1.status);
    const s2 = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2.status);

    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as { status: string };
    expect(detail.status).toBe('delivered');
  });

  test('cancel DO-02 from Draft; status=cancelled confirmed in API', async () => {
    const { status } = await apiPut(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do02Id}`, { headers: { Cookie: cookie } })).json() as { status: string };
    expect(detail.status).toBe('cancelled');
  });

  test('DO-01 detail confirms 3 line items and status=delivered', async () => {
    const detail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as { status: string; items?: unknown[] };
    expect(detail.status).toBe('delivered');
    expect((detail.items ?? []).length).toBe(3);
  });

  test('DO list page shows delivered and cancelled statuses in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/delivered/i);
    expect(body).toMatch(/cancelled/i);
    saveState({ doIds: { do01: do01Id, do02: do02Id } });
  });
});
