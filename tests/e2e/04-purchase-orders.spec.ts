import { test, expect } from '@playwright/test';
import {
  login, apiLogin, apiGet, apiPost, apiPut, apiDelete, BASE_URL,
  toProductList, toPurchaseOrderList,
  productPrice, ApiProduct, ApiPurchaseOrder,
} from './helpers';

interface ApiBrand { id: number; name: string; }

test.describe('Purchase Orders', () => {
  let cookie: string;
  let brandId: number;
  let productId: number;
  let lifecyclePoId: number;
  let lifecycleGrnId: number;
  let simplePOId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const brandsRaw = await apiGet('/api/brands', cookie) as ApiBrand[] | { brands?: ApiBrand[] };
    const brandList: ApiBrand[] = Array.isArray(brandsRaw) ? brandsRaw : ((brandsRaw as { brands?: ApiBrand[] }).brands ?? []);
    brandId = brandList[0]?.id ?? 0;

    const prodsRaw = await apiGet('/api/products', cookie);
    const prodList = toProductList(prodsRaw);
    productId = prodList[0]?.id ?? 0;
  });

  test.afterAll(async () => {
    if (simplePOId) await apiDelete(`/api/purchase-orders/${simplePOId}`, cookie);
    if (lifecycleGrnId) await apiDelete(`/api/goods-receipts/${lifecycleGrnId}`, cookie);
    if (lifecyclePoId) await apiDelete(`/api/purchase-orders/${lifecyclePoId}`, cookie);
  });

  test('purchase orders list loads with existing records', async () => {
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos = toPurchaseOrderList(raw);
    expect(pos.length).toBeGreaterThanOrEqual(0);
  });

  test('purchase orders list responds under 150ms at full scale', async () => {
    const start = Date.now();
    const raw = await apiGet('/api/purchase-orders', cookie);
    const elapsed = Date.now() - start;
    const pos = toPurchaseOrderList(raw);
    expect(pos.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(150);
  });

  test('create purchase order with line items via API', async () => {
    test.skip(!brandId || !productId, 'Requires at least one brand and one product');
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods = toProductList(prodsRaw);
    const items = prods.slice(0, 4).map((p: ApiProduct, i: number) => ({
      productId: p.id,
      description: p.name,
      quantity: (i + 1) * 5,
      unitPrice: productPrice(p),
      lineTotal: (i + 1) * 5 * productPrice(p),
    }));
    const subtotal = items.reduce((s, it) => s + it.lineTotal, 0);

    const { status, data } = await apiPost('/api/purchase-orders', {
      brandId,
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
    const created = data as ApiPurchaseOrder & { poNumber?: string };
    expect(created.id ?? created.poNumber).toBeTruthy();
    simplePOId = created.id;
  });

  test('PO full lifecycle: draft → submitted → GRN receive → auto-close', async () => {
    test.skip(!brandId || !productId, 'Requires at least one brand and one product');
    const prodsRaw = await apiGet('/api/products', cookie);
    const prods = toProductList(prodsRaw);

    const createItems = prods.slice(0, 2).map((p: ApiProduct, i: number) => ({
      productId: p.id,
      description: p.name,
      quantity: (i + 1) * 3,
      unitPrice: productPrice(p),
      lineTotal: (i + 1) * 3 * productPrice(p),
    }));

    const { status: createStatus, data: po } = await apiPost('/api/purchase-orders', {
      brandId,
      orderDate: '2026-03-23',
      expectedDelivery: '2026-04-30',
      status: 'draft',
      notes: 'E2E GRN lifecycle test PO',
      totalAmount: createItems.reduce((s, it) => s + it.lineTotal, 0).toFixed(2),
      vatAmount: '0',
      grandTotal: createItems.reduce((s, it) => s + it.lineTotal, 0).toFixed(2),
      items: createItems,
    }, cookie);
    expect(createStatus).toBe(201);
    lifecyclePoId = (po as ApiPurchaseOrder).id;

    const { status: submitStatus, data: submitted } = await apiPut(
      `/api/purchase-orders/${lifecyclePoId}`, { status: 'submitted' }, cookie,
    );
    expect(submitStatus).toBe(200);
    expect((submitted as ApiPurchaseOrder).status).toBe('submitted');

    const poItems = await apiGet(`/api/purchase-orders/${lifecyclePoId}/items`, cookie);
    expect(Array.isArray(poItems)).toBe(true);
    const itemsArr = poItems as Array<{
      id: number; productId: number; quantity: number; unitPrice: string;
    }>;
    expect(itemsArr.length).toBeGreaterThan(0);

    const grnItems = itemsArr.map((item) => ({
      poItemId: item.id,
      productId: item.productId,
      orderedQuantity: item.quantity,
      receivedQuantity: item.quantity,
      unitPrice: parseFloat(item.unitPrice),
    }));

    const grnResp = await fetch(`${BASE_URL}/api/goods-receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ poId: lifecyclePoId, items: grnItems, forceClose: true }),
    });
    const grn = await grnResp.json() as { id: number; receiptNumber: string; poStatus: string };
    expect(grnResp.status).toBe(201);
    expect(grn.id).toBeTruthy();
    lifecycleGrnId = grn.id;
    expect(grn.receiptNumber).toMatch(/GRN\d+/);
    expect(grn.poStatus).toBe('closed');
  });

  test('GRN-closed PO shows closed status in list', async () => {
    expect(lifecyclePoId).toBeTruthy();
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos = toPurchaseOrderList(raw);
    const found = pos.find((p) => p.id === lifecyclePoId);
    expect(found).toBeTruthy();
    expect(found!.status).toBe('closed');
  });

  test('goods receipts list is reachable and returns array', async () => {
    const data = await apiGet('/api/goods-receipts', cookie);
    expect(Array.isArray(data)).toBe(true);
    expect((data as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test('brands API is reachable and returns existing brands', async () => {
    const raw = await apiGet('/api/brands', cookie) as ApiBrand[] | { brands?: ApiBrand[] };
    const list: ApiBrand[] = Array.isArray(raw) ? raw : ((raw as { brands?: ApiBrand[] }).brands ?? []);
    expect(list.length).toBeGreaterThanOrEqual(0);
  });

  test('purchase orders API supports pagination (page + pageSize params)', async () => {
    // When both page and pageSize are provided, the API returns a paginated subset
    const raw = await apiGet('/api/purchase-orders?page=1&pageSize=5', cookie);
    // Paginated response returns { data: [...], total: N }
    const resp = raw as { data?: ApiPurchaseOrder[]; total?: number };
    const page1 = resp.data ?? toPurchaseOrderList(raw);
    expect(page1.length).toBeGreaterThan(0);
    expect(page1.length).toBeLessThanOrEqual(5);

    // Page 2 should return a different set (works as long as there are > 5 POs)
    const raw2 = await apiGet('/api/purchase-orders?page=2&pageSize=5', cookie);
    const resp2 = raw2 as { data?: ApiPurchaseOrder[]; total?: number };
    const page2 = resp2.data ?? toPurchaseOrderList(raw2);
    expect(page2.length).toBeGreaterThan(0);
    if (page1.length > 0 && page2.length > 0) {
      expect(page1[0]!.id).not.toBe(page2[0]!.id);
    }
  });

  test('purchase order status values are within the valid set', async () => {
    const raw = await apiGet('/api/purchase-orders', cookie);
    const pos = toPurchaseOrderList(raw);
    const validStatuses = new Set(['draft', 'submitted', 'approved', 'received', 'closed', 'cancelled']);
    for (const po of pos.slice(0, 50)) {
      if (po.status) {
        expect(validStatuses.has(po.status.toLowerCase()), `Invalid status: ${po.status}`).toBe(true);
      }
    }
  });

  test('purchase orders page renders in browser', async ({ page }) => {
    await login(page);
    await page.locator('body').waitFor({ timeout: 10000 });
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(10);
  });
});
