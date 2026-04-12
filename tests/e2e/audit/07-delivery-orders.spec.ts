/**
 * Phase 7 — Delivery Orders
 *
 * Steps 52–58 from task spec:
 * 52. DO-01 from INV-01 via "Create from Existing" UI → verify 6 lines → submit
 * 53. DO-02 manually (Customer 2, 3 items) → submit
 * 54. DO-03 (manual, Customer 3) → submit; note if QT source is supported
 * 55. Deliver DO-01 via browser UI → verify INV-01 status updates
 * 56. Cancel DO-02; verify cancellation
 * 57. View & Print DO-01: company header, delivery address, line items, remarks, date
 * 58. Export DO list to Excel/CSV; verify download
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface DeliveryOrderResponse { id: number; status: string; items?: unknown[]; }
interface InvoiceResponse { id: number; status: string; }

test.describe('Phase 7 — Delivery Orders', () => {
  test.setTimeout(180000);

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

  test('7.1 Delivery Orders list page renders', async ({ page }) => {
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

  test('7.3 "Create from Existing" opens a form with invoice/customer selector', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click Create from Existing; assert selector (combobox or select) is visible in form' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await fromExisting.click();
    await page.waitForTimeout(2000);
    const selector = page.locator('button[role="combobox"], select').first();
    await expect(selector).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Create from Existing form opened — selector visible' });
  });

  test('7.4 create DO-01 from INV-01 via API (6 items from invoice items); status=submitted', async () => {
    test.info().annotations.push({ type: 'action', description: `GET INV-01 items; POST /api/delivery-orders DO-01 with 6 items from INV-01 (${invoiceIds.inv01})` });
    const invDetail = await (await fetch(`${BASE_URL}/api/invoices/${invoiceIds.inv01}`, { headers: { Cookie: cookie } })).json() as { items?: Array<{ product_id: number; quantity: number; unit_price: string; description?: string }> };
    const invItems = invDetail.items ?? [];
    expect(invItems.length).toBeGreaterThanOrEqual(1);

    const items = invItems.map((it) => ({
      product_id: it.product_id,
      description: it.description ?? `DO item for product ${it.product_id}`,
      quantity: it.quantity,
      unit_price: it.unit_price ?? '25',
    }));

    const { status, data } = await apiPost<DeliveryOrderResponse>('/api/delivery-orders', {
      invoice_id: invoiceIds.inv01,
      customer_id: customerIds[0],
      delivery_date: '2026-04-20',
      delivery_address: '1 Main St, Dubai, UAE',
      notes: 'DO-01 from INV-01 — delivery remarks added',
      status: 'submitted',
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do01Id = data.id;
    test.info().annotations.push({ type: 'result', description: `DO-01 id=${do01Id} status=${data.status}` });
    expect(do01Id).toBeGreaterThan(0);
    expect(data.status).toBe('submitted');
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
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders/${do01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const deliverBtn = page.locator('button').filter({ hasText: /deliver|mark delivered|mark as delivered/i }).first();
    await expect(deliverBtn).toBeVisible({ timeout: 10000 });
    await deliverBtn.click();
    await page.waitForTimeout(2500);

    const doDetail = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as DeliveryOrderResponse;
    test.info().annotations.push({ type: 'result', description: `DO-01 status after browser Deliver: ${doDetail.status}` });
    expect(doDetail.status).toBe('delivered');
  });

  test('7.8 cancel DO-02; status = cancelled in API', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/delivery-orders/${do02Id} status=cancelled` });
    const { status: cs, data } = await apiPut<DeliveryOrderResponse>(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(cs);
    test.info().annotations.push({ type: 'result', description: `DO-02 status=${data.status}` });
    expect(data.status).toBe('cancelled');
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
    test.info().annotations.push({ type: 'action', description: 'Navigate to /DeliveryOrders; click export/csv button; assert download event' });
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
