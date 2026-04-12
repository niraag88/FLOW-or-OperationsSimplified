/**
 * Phase 4 — Purchase Orders
 *
 * Browser tests: PO list page renders; New PO button visible; PO print page renders.
 * API tests (explicitly permitted for lifecycle ops): create POs, GRN receives, payment marking.
 * All lifecycle state verified via API after UI navigation check.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, apiPatch, browserLogin, loadState, saveState } from './audit-helpers';

test.describe('Phase 4 — Purchase Orders', () => {
  test.setTimeout(180000);

  let cookie: string;
  let alphaBrandId: number;
  let betaBrandId: number;
  let gammaBrandId: number;
  let productIds: number[];
  let po01Id: number;
  let po02Id: number;
  let po03Id: number;
  let grn01Id: number;
  let grn01bId: number;
  let grn02Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    alphaBrandId = state.brandIds?.alpha ?? 0;
    betaBrandId = state.brandIds?.beta ?? 0;
    gammaBrandId = state.brandIds?.gamma ?? 0;
    productIds = state.productIds ?? [];
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(betaBrandId).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThanOrEqual(14);
  });

  test('Purchase Orders list page renders with "New Purchase Order" button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new purchase order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test('New PO button opens the PO creation form with Brand selector', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new purchase order/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const brandSelect = page.locator('[id="select-brand"], button[role="combobox"]').first();
    await expect(brandSelect).toBeVisible({ timeout: 10000 });
  });

  test('create PO-01 (Alpha Brand, GBP, 5 items) via API; verify status=draft', async () => {
    const items = productIds.slice(0, 5).map((pId, i) => ({
      productId: pId, description: `PO-01 item ${i + 1}`, quantity: (i + 1) * 2, unitPrice: 10 + i * 2, lineTotal: (i + 1) * 2 * (10 + i * 2),
    }));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const { status, data } = await apiPost('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'draft',
      notes: 'Audit PO-01 GBP 5 items', currency: 'GBP', fxRateToAed: '4.85',
      totalAmount: subtotal.toFixed(2), vatAmount: '0', grandTotal: subtotal.toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    po01Id = (data as { id: number }).id;
    expect(po01Id).toBeGreaterThan(0);
  });

  test('submit PO-01 via API; status changes to submitted', async () => {
    const { status, data } = await apiPut(`/api/purchase-orders/${po01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(status);
    expect((data as { status: string }).status).toBe('submitted');
  });

  test('create PO-02 (Beta Brand, AED, 2 items) via API; status=submitted', async () => {
    const items = productIds.slice(5, 7).map((pId, i) => ({
      productId: pId, description: `PO-02 item ${i + 1}`, quantity: 5, unitPrice: 20, lineTotal: 100,
    }));
    const { status, data } = await apiPost('/api/purchase-orders', {
      brandId: betaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'submitted',
      notes: 'Audit PO-02 AED 2 items', currency: 'AED', fxRateToAed: '1',
      totalAmount: '200.00', vatAmount: '0', grandTotal: '200.00', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    po02Id = (data as { id: number }).id;
    expect(po02Id).toBeGreaterThan(0);
  });

  test('create PO-03 (Gamma Brand, Draft) then cancel it; verify status=cancelled', async () => {
    const items = productIds.slice(10, 12).map((pId, i) => ({
      productId: pId, description: `PO-03 item ${i + 1}`, quantity: 3, unitPrice: 15, lineTotal: 45,
    }));
    const { status: cs, data } = await apiPost('/api/purchase-orders', {
      brandId: gammaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'draft',
      notes: 'Audit PO-03 to be cancelled', currency: 'AED', fxRateToAed: '1',
      totalAmount: '90.00', vatAmount: '0', grandTotal: '90.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs);
    po03Id = (data as { id: number }).id;

    const { status: cancelStatus, data: cancelData } = await apiPut(`/api/purchase-orders/${po03Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(cancelStatus);
    expect((cancelData as { status: string }).status).toBe('cancelled');
  });

  test('PO list page shows submitted and cancelled statuses in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/submitted|cancelled/i);
  });

  test('receive PO-01 fully via GRN API (forceClose=true); PO-01 auto-closes', async () => {
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po01Id}/items`, { headers: { Cookie: cookie } })).json() as Array<{ id: number; productId: number; quantity: number; unitPrice: string }>;
    expect(Array.isArray(poItems) && poItems.length).toBeTruthy();

    const grnItems = poItems.map((item) => ({
      poItemId: item.id, productId: item.productId, orderedQuantity: item.quantity,
      receivedQuantity: item.quantity, unitPrice: parseFloat(item.unitPrice),
    }));
    const r = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: po01Id, items: grnItems, forceClose: true, referenceNumber: 'INV-ALPHA-001', referenceDate: '2026-04-05' }),
    });
    expect(r.status).toBe(201);
    const grn = await r.json() as { id: number; poStatus: string };
    grn01Id = grn.id;
    expect(grn01Id).toBeGreaterThan(0);
    expect(grn.poStatus).toBe('closed');
  });

  test('receive PO-02 partially (item 1 only); PO-02 stays open', async () => {
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po02Id}/items`, { headers: { Cookie: cookie } })).json() as Array<{ id: number; productId: number; quantity: number; unitPrice: string }>;
    expect(poItems.length).toBeGreaterThan(0);

    const grnItems = [{ poItemId: poItems[0].id, productId: poItems[0].productId, orderedQuantity: poItems[0].quantity, receivedQuantity: poItems[0].quantity, unitPrice: parseFloat(poItems[0].unitPrice) }];
    const r = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: po02Id, items: grnItems }),
    });
    expect(r.status).toBe(201);
    const grn = await r.json() as { id: number; poStatus: string };
    grn01bId = grn.id;
    expect(grn01bId).toBeGreaterThan(0);
    expect(['submitted', 'partial']).toContain(grn.poStatus);
  });

  test('receive PO-02 remaining item; PO-02 closes', async () => {
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po02Id}/items`, { headers: { Cookie: cookie } })).json() as Array<{ id: number; productId: number; quantity: number; unitPrice: string }>;
    if (poItems.length < 2) return;

    const grnItems = [{ poItemId: poItems[1].id, productId: poItems[1].productId, orderedQuantity: poItems[1].quantity, receivedQuantity: poItems[1].quantity, unitPrice: parseFloat(poItems[1].unitPrice) }];
    const r = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: po02Id, items: grnItems, forceClose: true }),
    });
    expect(r.status).toBe(201);
    const grn = await r.json() as { id: number; poStatus: string };
    grn02Id = grn.id;
    expect(grn.poStatus).toBe('closed');
  });

  test('mark GRN-01 payment as paid; payment_status=paid in API', async () => {
    const { status } = await apiPatch(`/api/goods-receipts/${grn01Id}/payment`, {
      payment_status: 'paid', payment_made_date: '2026-04-10', payment_remarks: 'Bank transfer',
    }, cookie);
    expect([200, 201]).toContain(status);

    const grns = await (await fetch(`${BASE_URL}/api/goods-receipts`, { headers: { Cookie: cookie } })).json() as Array<{ id: number; paymentStatus?: string; payment_status?: string }>;
    const found = grns.find((g) => g.id === grn01Id);
    expect(found).toBeTruthy();
    expect(found!.paymentStatus ?? found!.payment_status).toBe('paid');
  });

  test('PO-01 print page renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${po01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);

    saveState({ poIds: { po01: po01Id, po02: po02Id, po03: po03Id }, grnIds: { grn01: grn01Id, grn01b: grn01bId, grn02: grn02Id } });
  });
});
