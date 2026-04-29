import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, BASE_URL } from './helpers';

/**
 * Task #365 (RF-2): Atomic master-data recycle-bin deletes.
 *
 * Brand, customer, and supplier delete handlers used to insert a
 * recycle_bin row first and then call the live delete *outside* any
 * transaction. If the live delete failed because the record was still
 * referenced (FK violation), the recycle-bin row stayed behind while
 * the live record also stayed behind — the list view showed a
 * "deleted" entry that was still alive.
 *
 * Acceptance:
 *   - DELETE on a referenced record returns 400 with a friendly
 *     message; recycle_bin has no entry for it; the record stays
 *     live.
 *   - DELETE on an unused record returns 200; recycle_bin has the
 *     entry; the record is gone from the live list.
 *
 * Test strategy: for each entity, create a fresh record (no other
 * test references it so the unused-delete path is reachable), and a
 * second fresh record that we wire up as a FK reference (product for
 * brand, invoice for customer, PO for supplier) so the FK-error path
 * is also reachable.
 */

interface RecycleBinRow {
  id: number;
  document_type?: string;
  documentType?: string;
  document_id?: string | number;
  documentId?: string | number;
}

async function recycleBinHas(
  cookie: string,
  documentType: string,
  documentId: number,
): Promise<boolean> {
  const rows = (await apiGet('/api/recycle-bin', cookie)) as RecycleBinRow[];
  if (!Array.isArray(rows)) return false;
  return rows.some((r) => {
    const dt = r.document_type ?? r.documentType;
    const did = r.document_id ?? r.documentId;
    return dt === documentType && String(did) === String(documentId);
  });
}

async function liveListHas(
  cookie: string,
  endpoint: string,
  id: number,
): Promise<boolean> {
  const rows = (await apiGet(endpoint, cookie)) as Array<{ id: number }>;
  return Array.isArray(rows) && rows.some((r) => r.id === id);
}

async function deleteAndStatus(
  cookie: string,
  path: string,
): Promise<{ status: number; body: { error?: string } }> {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  const body = (await r.json().catch(() => ({}))) as { error?: string };
  return { status: r.status, body };
}

test.describe('Master-data DELETE atomicity (Task #365, RF-2)', () => {
  let cookie: string;
  const stamp = Date.now();

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  // ─── Brand ───────────────────────────────────────────────────────
  test('brand: DELETE on a brand still referenced by a product → 400 + no recycle-bin row + brand stays live', async () => {
    const brandRes = await apiPost('/api/brands', { name: `RF2 Brand FK ${stamp}` }, cookie);
    expect(brandRes.status).toBe(201);
    const brandId = (brandRes.data as { id: number }).id;

    const prodRes = await apiPost('/api/products', {
      name: `RF2 Product FK ${stamp}`,
      sku: `RF2-PFK-${stamp}`,
      category: 'Essential Oils',
      unitPrice: '10.00',
      costPrice: '5.00',
      vatRate: '0.05',
      unit: 'Unit',
      stockQuantity: 0,
      minStockLevel: 0,
      brandId,
      dataSource: 'e2e_test',
    }, cookie);
    expect(prodRes.status).toBe(201);

    const { status, body } = await deleteAndStatus(cookie, `/api/brands/${brandId}`);
    expect(status).toBe(400);
    expect(body.error).toMatch(/cannot delete brand/i);

    // No orphan recycle-bin row, brand still live.
    expect(await recycleBinHas(cookie, 'Brand', brandId)).toBe(false);
    expect(await liveListHas(cookie, '/api/brands', brandId)).toBe(true);
  });

  test('brand: DELETE on an unused brand → 200 + recycle-bin row + brand removed from live list', async () => {
    const brandRes = await apiPost('/api/brands', { name: `RF2 Brand Unused ${stamp}` }, cookie);
    expect(brandRes.status).toBe(201);
    const brandId = (brandRes.data as { id: number }).id;

    const { status } = await deleteAndStatus(cookie, `/api/brands/${brandId}`);
    expect(status).toBe(200);

    expect(await recycleBinHas(cookie, 'Brand', brandId)).toBe(true);
    expect(await liveListHas(cookie, '/api/brands', brandId)).toBe(false);
  });

  // ─── Customer ────────────────────────────────────────────────────
  test('customer: DELETE on a customer still referenced by a quotation → 400 + no recycle-bin row + customer stays live', async () => {
    // NOTE: invoices.customerId has no FK constraint at the schema
    // level (column is a bare integer), so deleting a customer with
    // invoices does NOT raise a 23503. Quotations DO have the FK
    // (shared/schema.ts: quotations.customerId references customers
    // with .notNull()), so we use a quotation to exercise the
    // FK-violation path that this task is about.
    const custRes = await apiPost('/api/customers', { name: `RF2 Customer FK ${stamp}` }, cookie);
    expect(custRes.status).toBe(201);
    const customerId = (custRes.data as { id: number }).id;

    const prodsRaw = (await apiGet('/api/products?pageSize=1', cookie)) as
      | Array<{ id: number; name?: string }>
      | { products?: Array<{ id: number; name?: string }> };
    const list = Array.isArray(prodsRaw) ? prodsRaw : (prodsRaw.products ?? []);
    test.skip(list.length === 0, 'Requires at least one product to seed a quotation line');
    const p = list[0];

    const quoteRes = await apiPost('/api/quotations', {
      customerId,
      customerName: `RF2 Customer FK ${stamp}`,
      quoteDate: '2026-04-29',
      validUntil: '2026-05-29',
      status: 'Draft',
      notes: 'RF2 customer-FK quotation',
      totalAmount: '10.00',
      vatAmount: '0.50',
      grandTotal: '10.50',
      items: [{
        product_id: p.id,
        description: p.name ?? 'RF2',
        product_code: '',
        quantity: 1,
        unit_price: 10,
        discount: 0,
        line_total: 10,
      }],
    }, cookie);
    expect(quoteRes.status).toBe(201);

    const { status, body } = await deleteAndStatus(cookie, `/api/customers/${customerId}`);
    expect(status).toBe(400);
    expect(body.error).toMatch(/cannot delete customer/i);

    expect(await recycleBinHas(cookie, 'Customer', customerId)).toBe(false);
    expect(await liveListHas(cookie, '/api/customers', customerId)).toBe(true);
  });

  test('customer: DELETE on an unused customer → 200 + recycle-bin row + customer removed from live list', async () => {
    const custRes = await apiPost('/api/customers', { name: `RF2 Customer Unused ${stamp}` }, cookie);
    expect(custRes.status).toBe(201);
    const customerId = (custRes.data as { id: number }).id;

    const { status } = await deleteAndStatus(cookie, `/api/customers/${customerId}`);
    expect(status).toBe(200);

    expect(await recycleBinHas(cookie, 'Customer', customerId)).toBe(true);
    expect(await liveListHas(cookie, '/api/customers', customerId)).toBe(false);
  });

  // ─── Supplier ────────────────────────────────────────────────────
  test('supplier: DELETE on a supplier still referenced by a purchase order → 400 + no recycle-bin row + supplier stays live', async () => {
    // Need a brand for the PO too — create a fresh one.
    const brandRes = await apiPost('/api/brands', { name: `RF2 Supplier-FK Brand ${stamp}` }, cookie);
    expect(brandRes.status).toBe(201);
    const brandId = (brandRes.data as { id: number }).id;

    const supRes = await apiPost('/api/suppliers', { name: `RF2 Supplier FK ${stamp}` }, cookie);
    expect(supRes.status).toBe(201);
    const supplierId = (supRes.data as { id: number }).id;

    const poRes = await apiPost('/api/purchase-orders', {
      brandId,
      supplierId,
      orderDate: '2026-04-29',
      expectedDelivery: '2026-05-29',
      status: 'draft',
      notes: 'RF2 supplier-FK PO',
      totalAmount: '0',
      vatAmount: '0',
      grandTotal: '0',
      items: [],
    }, cookie);
    // Same fallback as invoices.
    if (poRes.status !== 201) {
      const prods = (await apiGet('/api/products?pageSize=1', cookie)) as
        | Array<{ id: number; name?: string }>
        | { products?: Array<{ id: number; name?: string }> };
      const list = Array.isArray(prods) ? prods : (prods.products ?? []);
      test.skip(list.length === 0, 'Requires at least one product to seed a PO line');
      const p = list[0];
      const retry = await apiPost('/api/purchase-orders', {
        brandId,
        supplierId,
        orderDate: '2026-04-29',
        expectedDelivery: '2026-05-29',
        status: 'draft',
        notes: 'RF2 supplier-FK PO retry',
        totalAmount: '10.00',
        vatAmount: '0',
        grandTotal: '10.00',
        items: [{
          productId: p.id,
          description: p.name ?? 'RF2',
          quantity: 1,
          unitPrice: 10,
          lineTotal: 10,
        }],
      }, cookie);
      expect(retry.status).toBe(201);
    }

    const { status, body } = await deleteAndStatus(cookie, `/api/suppliers/${supplierId}`);
    expect(status).toBe(400);
    expect(body.error).toMatch(/cannot delete supplier/i);

    expect(await recycleBinHas(cookie, 'Supplier', supplierId)).toBe(false);
    expect(await liveListHas(cookie, '/api/suppliers', supplierId)).toBe(true);
  });

  test('supplier: DELETE on an unused supplier → 200 + recycle-bin row + supplier removed from live list', async () => {
    const supRes = await apiPost('/api/suppliers', { name: `RF2 Supplier Unused ${stamp}` }, cookie);
    expect(supRes.status).toBe(201);
    const supplierId = (supRes.data as { id: number }).id;

    const { status } = await deleteAndStatus(cookie, `/api/suppliers/${supplierId}`);
    expect(status).toBe(200);

    expect(await recycleBinHas(cookie, 'Supplier', supplierId)).toBe(true);
    expect(await liveListHas(cookie, '/api/suppliers', supplierId)).toBe(false);
  });
});
