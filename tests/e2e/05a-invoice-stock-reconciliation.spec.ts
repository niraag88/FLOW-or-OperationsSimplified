import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, BASE_URL } from './helpers';

/**
 * Stock reconciliation when editing an already-delivered invoice.
 *
 * Covers Task #284 acceptance:
 *  - delivered invoice qty raised → extra stock deducted
 *  - delivered invoice qty lowered → stock returned
 *  - product added to a delivered invoice → stock deducted
 *  - product removed from a delivered invoice → stock returned in full
 *  - same product on multiple lines is aggregated, not double-applied
 *  - header-only edits leave stock untouched
 *  - PUT with status='cancelled' is rejected (must use cancel endpoint)
 *  - reverting a delivered invoice to draft/submitted is rejected with 400
 *  - the stock-movement ledger contains the right adjustment entries
 */
test.describe('Invoice stock reconciliation on edit (Task #284)', () => {
  let cookie: string;
  const created: { brandId?: number; customerId?: number; productAId?: number; productBId?: number; invoiceId?: number } = {};
  const tag = `RECON-${Date.now()}`;

  const stockOf = async (productId: number): Promise<number> => {
    const p = await apiGet(`/api/products/${productId}`, cookie) as { stockQuantity?: number };
    return Number(p.stockQuantity ?? 0);
  };

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const brand = await apiPost('/api/brands', { name: `Recon Brand ${tag}` }, cookie);
    expect(brand.status).toBe(201);
    created.brandId = (brand.data as { id: number }).id;

    const customer = await apiPost('/api/customers', { name: `Recon Cust ${tag}`, dataSource: 'e2e_test' }, cookie);
    expect(customer.status).toBe(201);
    created.customerId = (customer.data as { id: number }).id;

    const productA = await apiPost('/api/products', {
      name: `Recon A ${tag}`, sku: `REC-A-${tag}`, brandId: created.brandId,
      stockQuantity: 10, costPrice: '50', unitPrice: '100', unitOfMeasure: 'PCS',
      dataSource: 'e2e_test',
    }, cookie);
    expect(productA.status).toBe(201);
    created.productAId = (productA.data as { id: number }).id;

    const productB = await apiPost('/api/products', {
      name: `Recon B ${tag}`, sku: `REC-B-${tag}`, brandId: created.brandId,
      stockQuantity: 10, costPrice: '40', unitPrice: '80', unitOfMeasure: 'PCS',
      dataSource: 'e2e_test',
    }, cookie);
    expect(productB.status).toBe(201);
    created.productBId = (productB.data as { id: number }).id;
  });

  test.afterAll(async () => {
    // Cancel any delivered invoice first so it (and its stock) can be cleaned up
    if (created.invoiceId) {
      await fetch(`${BASE_URL}/api/invoices/${created.invoiceId}/cancel`, {
        method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}',
      });
      await apiDelete(`/api/invoices/${created.invoiceId}`, cookie);
    }
    if (created.productAId) await apiDelete(`/api/products/${created.productAId}`, cookie);
    if (created.productBId) await apiDelete(`/api/products/${created.productBId}`, cookie);
    if (created.customerId) await apiDelete(`/api/customers/${created.customerId}`, cookie);
    if (created.brandId) await apiDelete(`/api/brands/${created.brandId}`, cookie);
  });

  test('a draft invoice does not deduct stock; first delivery deducts (10 → 8)', async () => {
    const create = await apiPost('/api/invoices', {
      customer_id: created.customerId,
      invoice_date: '2026-04-25',
      status: 'draft',
      tax_amount: '10',
      total_amount: '210',
      items: [{ product_id: created.productAId, quantity: 2, unit_price: 100, line_total: 200, description: 'A' }],
    }, cookie);
    expect(create.status).toBe(201);
    created.invoiceId = (create.data as { id: number }).id;

    expect(await stockOf(created.productAId!)).toBe(10);

    const deliver = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '10',
      total_amount: '210',
      items: [{ product_id: created.productAId, quantity: 2, unit_price: 100, line_total: 200, description: 'A' }],
    }, cookie);
    expect(deliver.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(8);
  });

  test('raising qty on a delivered invoice deducts more (8 → 5)', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '25',
      total_amount: '525',
      items: [{ product_id: created.productAId, quantity: 5, unit_price: 100, line_total: 500, description: 'A' }],
    }, cookie);
    expect(r.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(5);
  });

  test('lowering qty on a delivered invoice returns stock (5 → 7)', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '15',
      total_amount: '315',
      items: [{ product_id: created.productAId, quantity: 3, unit_price: 100, line_total: 300, description: 'A' }],
    }, cookie);
    expect(r.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(7);
  });

  test('adding a new product to a delivered invoice deducts that product only', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '31',
      total_amount: '651',
      items: [
        { product_id: created.productAId, quantity: 3, unit_price: 100, line_total: 300, description: 'A' },
        { product_id: created.productBId, quantity: 4, unit_price: 80, line_total: 320, description: 'B' },
      ],
    }, cookie);
    expect(r.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(7);
    expect(await stockOf(created.productBId!)).toBe(6);
  });

  test('removing a product from a delivered invoice returns its stock fully', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '16',
      total_amount: '336',
      items: [{ product_id: created.productBId, quantity: 4, unit_price: 80, line_total: 320, description: 'B' }],
    }, cookie);
    expect(r.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(10);
    expect(await stockOf(created.productBId!)).toBe(6);
  });

  test('header-only edit (no items) does not change stock', async () => {
    const a0 = await stockOf(created.productAId!);
    const b0 = await stockOf(created.productBId!);

    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      notes: 'header-only edit',
      tax_amount: '16',
      total_amount: '336',
    }, cookie);
    expect(r.status).toBe(200);
    expect(await stockOf(created.productAId!)).toBe(a0);
    expect(await stockOf(created.productBId!)).toBe(b0);
  });

  test('same product split across two lines is aggregated (B 2+3=5, was 4 → 5)', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'delivered',
      invoice_date: '2026-04-25',
      tax_amount: '20',
      total_amount: '420',
      items: [
        { product_id: created.productBId, quantity: 2, unit_price: 80, line_total: 160, description: 'B-l1' },
        { product_id: created.productBId, quantity: 3, unit_price: 80, line_total: 240, description: 'B-l2' },
      ],
    }, cookie);
    expect(r.status).toBe(200);
    // Was: B qty 4 (stock 6). New aggregated qty 5 → 1 more deducted → stock 5
    expect(await stockOf(created.productBId!)).toBe(5);
  });

  test('reverting a delivered invoice back to draft is rejected with 400', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'draft',
    }, cookie);
    expect(r.status).toBe(400);
    expect((r.data as { error?: string }).error).toMatch(/Delivered invoices cannot be reverted/i);
  });

  test('cancelling via the normal PUT endpoint is rejected with 400', async () => {
    const r = await apiPut(`/api/invoices/${created.invoiceId}`, {
      customer_id: created.customerId,
      status: 'cancelled',
    }, cookie);
    expect(r.status).toBe(400);
    expect((r.data as { error?: string }).error).toMatch(/cancel/i);
  });

  test('the stock movement ledger contains adjustment entries with clear notes', async () => {
    const raw = await apiGet(`/api/stock-movements?referenceType=invoice&referenceId=${created.invoiceId}`, cookie);
    const arr = Array.isArray(raw)
      ? raw as Array<{ movementType?: string; productId?: number; quantity?: number; notes?: string }>
      : ((raw as { data?: unknown[]; movements?: unknown[] }).data ?? (raw as { movements?: unknown[] }).movements ?? []) as Array<{ movementType?: string; productId?: number; quantity?: number; notes?: string }>;

    // Initial deduction was 'sale'; subsequent edits produced 'adjustment' entries
    const sales = arr.filter((m) => m.movementType === 'sale');
    const adjustments = arr.filter((m) => m.movementType === 'adjustment');
    expect(sales.length).toBeGreaterThanOrEqual(1);
    expect(adjustments.length).toBeGreaterThanOrEqual(1);

    // Every adjustment for this invoice references reconciliation in its note
    for (const m of adjustments) {
      expect(String(m.notes ?? '')).toMatch(/reconciled.*invoice/i);
    }
  });
});
