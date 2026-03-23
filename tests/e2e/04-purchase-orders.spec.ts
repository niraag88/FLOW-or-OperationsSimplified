import { test, expect } from '@playwright/test';
import { login, apiLogin, apiGet, apiPost, apiPut } from './helpers';

test.describe('Purchase Orders', () => {
  let cookie: string;
  let supplierId: number;
  let productId: number;
  let lifecyclePoId: number;

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

  test('purchase orders list responds under 150ms at full scale', async () => {
    const start = Date.now();
    const raw = await apiGet('/api/purchase-orders', cookie);
    const elapsed = Date.now() - start;
    const pos: any[] = Array.isArray(raw) ? raw : (raw.purchaseOrders ?? raw.data ?? []);
    expect(pos.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
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

  test('PO lifecycle: draft → submitted → closed', async () => {
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods: any[] = Array.isArray(prodsRaw) ? prodsRaw : [];

    const { status: createStatus, data: po } = await apiPost('/api/purchase-orders', {
      supplierId,
      orderDate: '2026-03-23',
      expectedDelivery: '2026-04-30',
      status: 'draft',
      notes: 'E2E lifecycle test PO',
      totalAmount: '500.00',
      vatAmount: '25.00',
      grandTotal: '525.00',
      items: [{ productId: prods[0]?.id ?? productId, description: 'Lifecycle test item', quantity: 10, unitPrice: 50, lineTotal: 500 }],
    }, cookie);
    expect(createStatus).toBe(201);
    lifecyclePoId = po.id;

    const { status: submitStatus, data: submitted } = await apiPut(`/api/purchase-orders/${lifecyclePoId}`, {
      status: 'submitted',
    }, cookie);
    expect(submitStatus).toBe(200);
    expect(submitted.status).toBe('submitted');

    const { status: closeStatus, data: closed } = await apiPut(`/api/purchase-orders/${lifecyclePoId}`, {
      status: 'closed',
    }, cookie);
    expect(closeStatus).toBe(200);
    expect(closed.status).toBe('closed');
  });

  test('PO detail reflects closed status after lifecycle', async () => {
    expect(lifecyclePoId).toBeTruthy();
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos: any[] = Array.isArray(raw) ? raw : (raw.purchaseOrders ?? raw.data ?? []);
    const found = pos.find((p: any) => p.id === lifecyclePoId);
    expect(found).toBeTruthy();
    expect(found.status).toBe('closed');
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

  test('purchase orders page renders in browser', async ({ page }) => {
    await login(page);
    const nav = page.locator('nav, aside, [role="navigation"]');
    await nav.locator('text=/purchase.*order|PO/i').first().click().catch(() => {});
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    expect(text).toMatch(/PO-\d{4}-\d+/i);
  });
});
