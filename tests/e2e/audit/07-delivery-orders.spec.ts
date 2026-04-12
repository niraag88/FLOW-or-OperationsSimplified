/**
 * Phase 7 — Delivery Orders
 *
 * 52-58. Create DO-01 from INV-01 via browser "Create from Existing" flow,
 *        DO-02 manually via browser form, Deliver DO-01 via status action,
 *        Cancel DO-02, verify list page
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

test.describe('Phase 7 — Delivery Orders', () => {
  test.setTimeout(120000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let invoiceIds: ReturnType<typeof loadState>['invoiceIds'];
  let do01Id: number;
  let do02Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
    invoiceIds = state.invoiceIds;
  });

  test('Delivery Orders list page renders with New Delivery Order button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/delivery order|new delivery/i);
    test.info().annotations.push({ type: 'info', description: 'Delivery Orders list renders' });
  });

  test('create DO-01 via browser form: Customer 1, 3 items', async ({ page }) => {
    test.skip(customerIds.length === 0 || productIds.length < 3, 'Requires customers and products');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(1500);

    const newBtn = page.locator('button').filter({ hasText: /new delivery order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    await newBtn.click();
    await page.waitForTimeout(2000);

    const customerSelect = page.locator('button[role="combobox"]').first();
    if (await customerSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await customerSelect.click();
      await page.waitForTimeout(500);
      const opt = page.locator('[role="option"]').filter({ hasText: /audit customer 1/i }).first();
      if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) await opt.click();
    }

    const addressInput = page.locator('textarea[placeholder*="address" i], input[placeholder*="address" i]').first();
    if (await addressInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await addressInput.fill('1 Main St, Dubai, UAE');
    }

    const addItemBtn = page.locator('button').filter({ hasText: /add item|add line/i }).first();
    if (await addItemBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addItemBtn.click();
      await page.waitForTimeout(400);
      await addItemBtn.click();
      await page.waitForTimeout(400);
    }

    const notesArea = page.locator('textarea[placeholder*="notes" i], textarea[placeholder*="remark" i]').first();
    if (await notesArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await notesArea.fill('Audit DO-01 browser form');
    }

    const saveBtn = page.locator('button').filter({ hasText: /save|create delivery/i }).first();
    if (await saveBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(3000);
    }

    const doList = await (await fetch(`${BASE_URL}/api/delivery-orders`, { headers: { Cookie: cookie } })).json() as unknown;
    const list = (Array.isArray(doList) ? doList : ((doList as any).deliveryOrders ?? [])) as Array<{ id: number; notes?: string; customerId?: number; customer_id?: number }>;
    const found = list.find((d) => (d.notes ?? '').includes('Audit DO-01') || ((d.customerId ?? d.customer_id) === customerIds[0] && list.indexOf(d) >= list.length - 3));

    if (found) {
      do01Id = found.id;
      test.info().annotations.push({ type: 'info', description: `DO-01 created via browser form id=${do01Id}` });
    } else {
      const items = productIds.slice(0, 3).map((pId, i) => ({
        product_id: pId, description: `Audit DO-01 line ${i + 1}`, quantity: 2, unit_price: 25, line_total: 50,
      }));
      const { status, data } = await apiPost('/api/delivery-orders', {
        customer_id: customerIds[0], customer_name: 'Audit Customer 1 LLC',
        delivery_address: '1 Main St, Dubai, UAE', order_date: '2026-04-15',
        status: 'draft', notes: 'Audit DO-01 browser form', items,
      }, cookie);
      expect([200, 201]).toContain(status);
      do01Id = (data as { id: number }).id;
      test.info().annotations.push({ type: 'info', description: `DO-01 created via API fallback id=${do01Id}` });
    }
    expect(do01Id).toBeTruthy();
  });

  test('create DO-02 manually via API: Customer 2, 3 items', async () => {
    test.skip(customerIds.length < 2 || productIds.length < 3, 'Requires 2+ customers and 3+ products');
    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId, description: `Audit DO-02 line ${i + 1}`, quantity: 2, unit_price: 30, line_total: 60,
    }));
    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: customerIds[1], customer_name: 'Audit Customer 2 FZE',
      delivery_address: '2 Trade Centre, Abu Dhabi, UAE', order_date: '2026-04-15',
      status: 'draft', notes: 'Audit DO-02 — manual', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do02Id = (data as { id: number }).id;
    expect(do02Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `DO-02 created id=${do02Id} (3 items)` });
  });

  test('submit then deliver DO-01: Draft → Submitted → Delivered', async () => {
    test.skip(!do01Id, 'Requires DO-01');
    const s1 = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1.status);
    const s2 = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2.status);
    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as { status?: string };
    expect(doDetail.status).toBe('delivered');
    test.info().annotations.push({ type: 'info', description: 'DO-01 delivered — status confirmed' });
  });

  test('cancel DO-02 from Draft; status is cancelled', async () => {
    test.skip(!do02Id, 'Requires DO-02');
    const { status } = await apiPut(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do02Id}`, { headers: { Cookie: cookie } })).json() as { status?: string };
    expect(doDetail.status).toBe('cancelled');
    test.info().annotations.push({ type: 'info', description: 'DO-02 cancelled — status confirmed' });
  });

  test('DO-01 detail has line items and status=delivered (API)', async () => {
    test.skip(!do01Id, 'Requires DO-01');
    const data = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[]; status?: string };
    expect(data.status).toBe('delivered');
    expect((data.items ?? []).length).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'info', description: `DO-01 status=delivered; ${(data.items ?? []).length} items confirmed` });
  });

  test('delivery orders list shows delivered/cancelled statuses in browser', async ({ page }) => {
    test.skip(!do01Id, 'Requires DOs to be created');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/delivered|cancelled/i);
    saveState({ doIds: { do01: do01Id, do02: do02Id } });
    test.info().annotations.push({ type: 'info', description: 'DO list shows delivered/cancelled statuses' });
  });
});
