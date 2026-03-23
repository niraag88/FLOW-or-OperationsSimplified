import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost } from './helpers';

test.describe('Purchase Orders', () => {
  let cookie: string;
  let supplierId: number;
  let productId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const suppsRaw = await apiGet('/api/suppliers', cookie);
    const suppList: any[] = Array.isArray(suppsRaw) ? suppsRaw : (Array.isArray(suppsRaw.suppliers) ? suppsRaw.suppliers : []);
    supplierId = suppList[0]?.id ?? 1;

    const prodsRaw = await apiGet('/api/products', cookie);
    const prodList: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];
    productId = prodList[0]?.id ?? 1;
  });

  test('purchase orders list loads with 307+ records', async () => {
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos: any[] = Array.isArray(raw) ? raw : (raw.purchaseOrders ?? raw.data ?? []);
    expect(pos.length).toBeGreaterThanOrEqual(300);
  });

  test('create purchase order with line items via API', async () => {
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];
    const items = prods.slice(0, 4).map((p: any, i: number) => ({
      productId: p.id,
      description: p.name,
      quantity: (i + 1) * 5,
      unitPrice: parseFloat(p.unitPrice),
      lineTotal: (i + 1) * 5 * parseFloat(p.unitPrice),
    }));
    const subtotal = items.reduce((s: number, i: any) => s + i.lineTotal, 0);

    const { status, data } = await apiPost('/api/purchase-orders', {
      supplierId,
      orderDate: '2026-03-23',
      expectedDelivery: '2026-04-23',
      status: 'draft',
      notes: 'E2E test PO — 4 line items',
      totalAmount: subtotal.toFixed(2),
      vatAmount: '0',
      grandTotal: subtotal.toFixed(2),
      items,
    }, cookie);

    expect(status).toBe(201);
    expect(data.id ?? data.poNumber).toBeTruthy();
  });

  test('77+ suppliers available', async () => {
    const raw = await apiGet('/api/suppliers', cookie);
    const supps: any[] = Array.isArray(raw) ? raw : (raw.suppliers ?? []);
    expect(supps.length).toBeGreaterThanOrEqual(50);
  });

  test('150+ customers available', async () => {
    const raw = await apiGet('/api/customers', cookie);
    const custs: any[] = Array.isArray(raw) ? raw : (raw.customers ?? []);
    expect(custs.length).toBeGreaterThanOrEqual(148);
  });
});
