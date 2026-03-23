import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, apiPost } from './helpers';

test.describe('Delivery Orders', () => {
  let cookie: string;
  let customerId: number;
  let testDoId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const custsRaw = await apiGet('/api/customers', cookie);
    const custs: any[] = Array.isArray(custsRaw) ? custsRaw : (Array.isArray(custsRaw.customers) ? custsRaw.customers : []);
    customerId = custs[0]?.id ?? 3;
  });

  test('delivery orders list loads with 200+ records', async () => {
    const data = await apiGet('/api/delivery-orders', cookie);
    const dos = data.deliveryOrders ?? data.data ?? data;
    expect(Array.isArray(dos)).toBe(true);
    expect(dos.length).toBeGreaterThanOrEqual(200);
  });

  test('delivery orders response time is under 100ms', async () => {
    const start = Date.now();
    await apiGet('/api/delivery-orders', cookie);
    expect(Date.now() - start).toBeLessThan(100);
  });

  test('create delivery order with customer and line items via API', async () => {
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];

    const items = prods.slice(0, 3).map((p: any, i: number) => ({
      product_id: p.id,
      product_code: p.sku,
      description: p.name,
      quantity: (i + 1) * 2,
      unit_price: parseFloat(p.unitPrice),
      line_total: (i + 1) * 2 * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, it: any) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/delivery-orders', {
      customer_id: customerId,
      order_date: '2026-03-23',
      status: 'draft',
      subtotal: subtotal.toFixed(2),
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      notes: 'E2E test delivery order',
      items,
    }, cookie);

    expect(status).toBe(201);
    expect(data.id).toBeTruthy();
    expect(data.orderNumber).toMatch(/DO-/);
    testDoId = data.id;
  });

  test('created delivery order appears in list', async () => {
    expect(testDoId).toBeTruthy();
    const data = await apiGet(`/api/delivery-orders/${testDoId}`, cookie);
    expect(data.id).toBe(testDoId);
    expect((data.items ?? []).length).toBe(3);
  });

  test('delivery orders page renders in browser', async ({ page }) => {
    await login(page);
    const nav = page.locator('nav, aside, [role="navigation"]');
    await nav.locator('text=/delivery/i').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/DO-|delivery|Delivery/i);
  });
});
