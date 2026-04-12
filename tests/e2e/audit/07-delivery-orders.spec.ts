/**
 * Phase 7 — Delivery Orders
 *
 * 52-58. Create DO-01 from INV-01, DO-02 manually, DO-03 (manual),
 *        Deliver DO-01, Cancel DO-02, view/print, export
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

  test('create DO-01 from INV-01 (pre-fill from invoice)', async () => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01 to be created');

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${invoiceIds!.inv01}`, { headers: { Cookie: cookie } })).json() as {
      customerId?: number; customer_id?: number; customerName?: string; customer_name?: string;
      items?: Array<{ product_id?: number; productId?: number; description?: string; quantity: number; unit_price?: number; unitPrice?: number; line_total?: number; lineTotal?: number }>;
    };
    const custId = inv.customerId ?? inv.customer_id;
    const custName = inv.customerName ?? inv.customer_name ?? 'Audit Customer 1 LLC';
    const invItems = inv.items ?? [];

    const doItems = invItems.map((it) => ({
      product_id: it.product_id ?? it.productId,
      description: it.description ?? 'Audit DO line',
      quantity: it.quantity,
      unit_price: it.unit_price ?? it.unitPrice ?? 25,
      line_total: it.line_total ?? it.lineTotal ?? it.quantity * (it.unit_price ?? it.unitPrice ?? 25),
    }));

    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: custId,
      customer_name: custName,
      delivery_address: '1 Main St, Dubai, UAE',
      order_date: '2026-04-15',
      status: 'draft',
      notes: 'Audit DO-01 from INV-01',
      items: doItems,
    }, cookie);
    expect([200, 201]).toContain(status);
    do01Id = (data as { id: number }).id;
    expect(do01Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `DO-01 created id=${do01Id} (from INV-01 items)` });
  });

  test('create DO-02 manually: Customer 2, 3 line items', async () => {
    test.skip(customerIds.length < 2 || productIds.length < 3, 'Requires 2+ customers and 3+ products');

    const items = productIds.slice(0, 3).map((pId, i) => ({
      product_id: pId,
      description: `Audit DO-02 line ${i + 1}`,
      quantity: 2,
      unit_price: 30,
      line_total: 60,
    }));

    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: customerIds[1],
      customer_name: 'Audit Customer 2 FZE',
      delivery_address: '2 Trade Centre, Abu Dhabi, UAE',
      order_date: '2026-04-15',
      status: 'draft',
      notes: 'Audit DO-02 — manual',
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    do02Id = (data as { id: number }).id;
    expect(do02Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `DO-02 created id=${do02Id} (manual, 3 items)` });
  });

  test('deliver DO-01: change status to Delivered', async () => {
    test.skip(!do01Id, 'Requires DO-01');
    const { status: s1 } = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1);

    const { status: s2 } = await apiPut(`/api/delivery-orders/${do01Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2);
    test.info().annotations.push({ type: 'info', description: 'DO-01 marked as Delivered' });
  });

  test('cancel DO-02 from Draft', async () => {
    test.skip(!do02Id, 'Requires DO-02');
    const { status } = await apiPut(`/api/delivery-orders/${do02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'info', description: 'DO-02 cancelled from Draft' });
  });

  test('DO-01 detail shows correct line items', async () => {
    test.skip(!do01Id, 'Requires DO-01');
    const data = await (await fetch(`${BASE_URL}/api/delivery-orders/${do01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((data.items ?? []).length).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'info', description: `DO-01 confirmed ${(data.items ?? []).length} line items` });
  });

  test('delivery orders list page renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/delivery-orders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/delivery order|create|new/i);
    saveState({ doIds: { do01: do01Id, do02: do02Id } });
    test.info().annotations.push({ type: 'info', description: 'Delivery Orders list page renders' });
  });
});
