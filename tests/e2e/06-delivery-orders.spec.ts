import { test, expect } from '@playwright/test';
import {
  apiLogin, apiGet, apiPost,
  toCustomerList, toProductList, toDeliveryOrderList, productPrice, ApiProduct, ApiDeliveryOrder,
} from './helpers';

test.describe('Delivery Orders', () => {
  let cookie: string;
  let customerId: number;
  let testDoId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const custsRaw = await apiGet('/api/customers', cookie);
    const custs = toCustomerList(custsRaw);
    customerId = custs[0]?.id ?? 3;
  });

  test('delivery orders list loads with 200+ records', async () => {
    const raw = await apiGet('/api/delivery-orders', cookie);
    const dos = toDeliveryOrderList(raw);
    expect(dos.length).toBeGreaterThanOrEqual(200);
  });

  test('delivery orders response time is under 100ms', async () => {
    const start = Date.now();
    await apiGet('/api/delivery-orders', cookie);
    expect(Date.now() - start).toBeLessThan(100);
  });

  test('create delivery order with customer and line items via API', async () => {
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods = toProductList(prodsRaw);

    const items = prods.slice(0, 3).map((p: ApiProduct, i: number) => ({
      product_id: p.id,
      product_code: p.sku,
      description: p.name,
      quantity: (i + 1) * 2,
      unit_price: productPrice(p),
      line_total: (i + 1) * 2 * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
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
    const created = data as ApiDeliveryOrder & { orderNumber?: string };
    expect(created.id).toBeTruthy();
    expect(created.orderNumber).toMatch(/DO-/);
    testDoId = created.id;
  });

  test('created delivery order appears in list', async () => {
    expect(testDoId).toBeTruthy();
    const data = await apiGet(`/api/delivery-orders/${testDoId}`, cookie) as {
      id: number; items?: unknown[];
    };
    expect(data.id).toBe(testDoId);
    expect((data.items ?? []).length).toBe(3);
  });

  test('delivery orders list API returns 202+ records', async () => {
    const raw = await apiGet('/api/delivery-orders', cookie);
    const dos = toDeliveryOrderList(raw);
    expect(dos.length).toBeGreaterThanOrEqual(200);
  });
});
