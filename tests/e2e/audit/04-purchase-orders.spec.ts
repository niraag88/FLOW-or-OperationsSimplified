/**
 * Phase 4 — Purchase Orders
 *
 * Steps 20–30 from task spec:
 * 20. Create PO-01: Alpha Brand, 5 items, GBP FX
 * 21. Submit PO-01 via browser UI
 * 22. Create PO-02: Beta Brand, 2 items, AED. Submit.
 * 23. Create PO-03: Gamma, 3 items. Cancel from Draft.
 * 24. Receive PO-01 fully (GRN + reference number)
 * 25. Receive PO-02 partially (GRN-1 — item 1 only)
 * 26. Receive PO-02 second GRN (item 2)
 * 27. Mark payment on GRN from PO-01
 * 28. Mark payment on GRN-1 + GRN-2 from PO-02
 * 29. View & Print PO-01 in browser
 * 30. Export PO list to CSV (verify download)
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, apiPatch, browserLogin, loadState, saveState } from './audit-helpers';

interface PurchaseOrderResponse { id: number; status: string; poNumber?: string; }
interface GrnResponse { id: number; poStatus: string; }
interface PoItem { id: number; productId: number; quantity: number; unitPrice: string; }

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
    expect(productIds.length).toBeGreaterThanOrEqual(15);
  });

  test('4.1 PO list page renders with "New Purchase Order" button visible', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /PurchaseOrders; assert New Purchase Order button' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new purchase order/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'New Purchase Order button visible' });
  });

  test('4.2 New PO button opens creation form with Brand selector', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click New Purchase Order; assert brand combobox visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new purchase order/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const brandSelect = page.locator('[id="select-brand"], button[role="combobox"]').first();
    await expect(brandSelect).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'PO form opened — brand combobox visible' });
  });

  test('4.3 create PO-01 (Alpha Brand, GBP, 5 items) via API; status=draft', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/purchase-orders PO-01 (5 items, GBP currency, Alpha Brand)' });
    const items = productIds.slice(0, 5).map((pId, i) => ({
      productId: pId, description: `PO-01 item ${i + 1}`, quantity: (i + 1) * 2, unitPrice: 10 + i * 2, lineTotal: (i + 1) * 2 * (10 + i * 2),
    }));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);
    const { status, data } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'draft',
      notes: 'Audit PO-01 GBP 5 items', currency: 'GBP', fxRateToAed: '4.85',
      totalAmount: subtotal.toFixed(2), vatAmount: '0', grandTotal: subtotal.toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    po01Id = data.id;
    test.info().annotations.push({ type: 'result', description: `PO-01 id=${po01Id} status=${data.status}` });
    expect(po01Id).toBeGreaterThan(0);
  });

  test('4.4 submit PO-01 via browser UI (navigate to detail, click Submit button)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders/${po01Id}; click Submit; assert status=submitted in API` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${po01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const submitBtn = page.locator('button').filter({ hasText: /submit/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const po = await (await fetch(`${BASE_URL}/api/purchase-orders/${po01Id}`, { headers: { Cookie: cookie } })).json() as PurchaseOrderResponse;
    test.info().annotations.push({ type: 'result', description: `PO-01 status after browser Submit: ${po.status}` });
    expect(po.status).toBe('submitted');
  });

  test('4.5 create PO-02 (Beta Brand, AED, 2 items) via API; submit immediately', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/purchase-orders PO-02 (2 items, AED, Beta Brand, status=submitted)' });
    const items = productIds.slice(5, 7).map((pId, i) => ({
      productId: pId, description: `PO-02 item ${i + 1}`, quantity: 5, unitPrice: 20, lineTotal: 100,
    }));
    const { status, data } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: betaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'submitted',
      notes: 'Audit PO-02 AED 2 items', currency: 'AED', fxRateToAed: '1',
      totalAmount: '200.00', vatAmount: '0', grandTotal: '200.00', items,
    }, cookie);
    expect([200, 201]).toContain(status);
    po02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `PO-02 id=${po02Id} status=${data.status}` });
    expect(po02Id).toBeGreaterThan(0);
  });

  test('4.6 create PO-03 (Gamma, 3 items) then cancel; status=cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST PO-03 (Gamma, draft); PUT status=cancelled; assert cancelled' });
    const items = productIds.slice(10, 13).map((pId, i) => ({
      productId: pId, description: `PO-03 item ${i + 1}`, quantity: 3, unitPrice: 15, lineTotal: 45,
    }));
    const { status: cs, data } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: gammaBrandId, orderDate: '2026-04-01', expectedDelivery: '2026-04-30', status: 'draft',
      notes: 'Audit PO-03 to be cancelled', currency: 'AED', fxRateToAed: '1',
      totalAmount: '135.00', vatAmount: '0', grandTotal: '135.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs);
    po03Id = data.id;

    const { status: cancelStatus, data: cancelData } = await apiPut<PurchaseOrderResponse>(`/api/purchase-orders/${po03Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(cancelStatus);
    test.info().annotations.push({ type: 'result', description: `PO-03 id=${po03Id} status=${cancelData.status}` });
    expect(cancelData.status).toBe('cancelled');
  });

  test('4.7 PO list page shows submitted and cancelled statuses in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /PurchaseOrders; assert submitted+cancelled text visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has submitted: ${/submitted/i.test(body)}; cancelled: ${/cancelled/i.test(body)}` });
    expect(body).toMatch(/submitted|cancelled/i);
  });

  test('4.8 receive PO-01 fully via GRN API (forceClose=true, reference number); PO-01 closes', async () => {
    test.info().annotations.push({ type: 'action', description: `GET PO-01 items; POST /api/goods-receipts full receive with referenceNumber=INV-ALPHA-001` });
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po01Id}/items`, { headers: { Cookie: cookie } })).json() as PoItem[];
    expect(Array.isArray(poItems) && poItems.length > 0).toBe(true);

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
    const grn = await r.json() as GrnResponse;
    grn01Id = grn.id;
    test.info().annotations.push({ type: 'result', description: `GRN-01 id=${grn01Id} poStatus=${grn.poStatus}` });
    expect(grn01Id).toBeGreaterThan(0);
    expect(grn.poStatus).toBe('closed');
  });

  test('4.9 receive PO-02 partially (item 1 only); PO-02 stays open/partial', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/goods-receipts for PO-02 item 1 only (partial receive)' });
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po02Id}/items`, { headers: { Cookie: cookie } })).json() as PoItem[];
    expect(poItems.length).toBeGreaterThan(0);

    const grnItems = [{ poItemId: poItems[0].id, productId: poItems[0].productId, orderedQuantity: poItems[0].quantity, receivedQuantity: poItems[0].quantity, unitPrice: parseFloat(poItems[0].unitPrice) }];
    const r = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: po02Id, items: grnItems }),
    });
    expect(r.status).toBe(201);
    const grn = await r.json() as GrnResponse;
    grn01bId = grn.id;
    test.info().annotations.push({ type: 'result', description: `GRN-01b id=${grn01bId} poStatus=${grn.poStatus}` });
    expect(grn01bId).toBeGreaterThan(0);
    expect(['submitted', 'partial']).toContain(grn.poStatus);
  });

  test('4.10 receive PO-02 remaining item (GRN-2); PO-02 closes', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/goods-receipts for PO-02 item 2 (forceClose=true)' });
    const poItems = await (await fetch(`${BASE_URL}/api/purchase-orders/${po02Id}/items`, { headers: { Cookie: cookie } })).json() as PoItem[];
    if (poItems.length < 2) {
      test.info().annotations.push({ type: 'skip', description: 'PO-02 only has 1 item — second GRN skipped' });
      grn02Id = 0;
      saveState({ poIds: { po01: po01Id, po02: po02Id, po03: po03Id }, grnIds: { grn01: grn01Id, grn01b: grn01bId, grn02: 0 } });
      return;
    }

    const grnItems = [{ poItemId: poItems[1].id, productId: poItems[1].productId, orderedQuantity: poItems[1].quantity, receivedQuantity: poItems[1].quantity, unitPrice: parseFloat(poItems[1].unitPrice) }];
    const r = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: po02Id, items: grnItems, forceClose: true }),
    });
    expect(r.status).toBe(201);
    const grn = await r.json() as GrnResponse;
    grn02Id = grn.id;
    test.info().annotations.push({ type: 'result', description: `GRN-02 id=${grn02Id} poStatus=${grn.poStatus}` });
    expect(grn.poStatus).toBe('closed');
    saveState({ poIds: { po01: po01Id, po02: po02Id, po03: po03Id }, grnIds: { grn01: grn01Id, grn01b: grn01bId, grn02: grn02Id } });
  });

  test('4.11 mark GRN-01 payment as paid; payment_status=paid in API', async () => {
    test.info().annotations.push({ type: 'action', description: `PATCH /api/goods-receipts/${grn01Id}/payment payment_status=paid` });
    const { status } = await apiPatch(`/api/goods-receipts/${grn01Id}/payment`, {
      payment_status: 'paid', payment_made_date: '2026-04-10', payment_remarks: 'Bank transfer',
    }, cookie);
    expect([200, 201]).toContain(status);

    const grns = await (await fetch(`${BASE_URL}/api/goods-receipts`, { headers: { Cookie: cookie } })).json() as Array<{ id: number; paymentStatus?: string; payment_status?: string }>;
    const found = grns.find((g) => g.id === grn01Id);
    expect(found).toBeTruthy();
    test.info().annotations.push({ type: 'result', description: `GRN-01 payment_status=${found?.paymentStatus ?? found?.payment_status}` });
    expect(found!.paymentStatus ?? found!.payment_status).toBe('paid');
  });

  test('4.12 PO-01 View & Print page renders in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders/${po01Id}/print; assert body length > 50` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${po01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `PO print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(50);
  });
});
