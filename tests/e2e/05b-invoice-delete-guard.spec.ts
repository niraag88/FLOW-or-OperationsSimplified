import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, BASE_URL } from './helpers';

/**
 * Task #363 (RF-1): Block delivered invoice deletion.
 *
 * Until this task, DELETE /api/invoices/:id only refused cancelled
 * invoices. A delivered invoice — which has already produced stock
 * movements (`stockDeducted = true`) — could be silently moved to the
 * recycle bin, bypassing the dedicated PATCH /api/invoices/:id/cancel
 * flow that reverses stock and preserves audit. The fix routes
 * delivered invoices through Cancel Invoice instead.
 *
 * Coverage:
 *  - DELETE on a delivered invoice -> 400, invoice still present, no
 *    recycle-bin row written, stock unchanged.
 *  - DELETE on a draft invoice (control) -> 200, invoice is moved to
 *    the recycle bin exactly as before.
 *  - PATCH /api/invoices/:id/cancel still works on a delivered invoice
 *    and reverses stock — proving we only blocked the wrong path, not
 *    the legitimate one.
 *
 * Defence-in-depth (`stockDeducted=true` on a non-delivered status) is
 * impossible to construct via the public API without raw SQL — every
 * code path that flips stockDeducted true also flips status to
 * delivered — so the server check on `stockDeducted` is exercised by
 * the unit reading of the route, and is documented inline.
 */

interface RecycleBinRow {
  id: number;
  document_type: string;
  document_id: string;
  document_number: string;
}

async function recycleBinHasInvoice(invoiceId: number, cookie: string): Promise<boolean> {
  const rows = (await apiGet('/api/recycle-bin', cookie)) as RecycleBinRow[];
  return Array.isArray(rows) && rows.some(
    r => r.document_type === 'Invoice' && String(r.document_id) === String(invoiceId),
  );
}

async function stockOf(productId: number, cookie: string): Promise<number> {
  const p = (await apiGet(`/api/products/${productId}`, cookie)) as { stockQuantity?: number };
  return Number(p.stockQuantity ?? 0);
}

test.describe('Invoice DELETE guard — delivered invoices must use Cancel (Task #363, RF-1)', () => {
  let cookie: string;
  const created: {
    brandId?: number;
    customerId?: number;
    productId?: number;
    deliveredInvoiceId?: number;
    draftInvoiceId?: number;
    cancelDeliveredInvoiceId?: number;
  } = {};
  const tag = `RF1-${Date.now()}`;

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const brand = await apiPost('/api/brands', { name: `RF1 Brand ${tag}` }, cookie);
    expect(brand.status).toBe(201);
    created.brandId = (brand.data as { id: number }).id;

    const customer = await apiPost(
      '/api/customers',
      { name: `RF1 Cust ${tag}`, dataSource: 'e2e_test' },
      cookie,
    );
    expect(customer.status).toBe(201);
    created.customerId = (customer.data as { id: number }).id;

    const product = await apiPost(
      '/api/products',
      {
        name: `RF1 Product ${tag}`,
        sku: `RF1-${tag}`,
        brandId: created.brandId,
        stockQuantity: 20,
        costPrice: '50',
        unitPrice: '100',
        unitOfMeasure: 'PCS',
        dataSource: 'e2e_test',
      },
      cookie,
    );
    expect(product.status).toBe(201);
    created.productId = (product.data as { id: number }).id;
  });

  test.afterAll(async () => {
    // Cancel any delivered invoice still in 'delivered' status before
    // attempting to clean it up so its stock effect is reversed.
    for (const id of [created.deliveredInvoiceId, created.cancelDeliveredInvoiceId]) {
      if (!id) continue;
      await fetch(`${BASE_URL}/api/invoices/${id}/cancel`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      await apiDelete(`/api/invoices/${id}`, cookie);
    }
    // The draft invoice should already be in the recycle bin from the
    // control test below; if anything failed mid-test, best-effort
    // cleanup follows.
    if (created.draftInvoiceId) await apiDelete(`/api/invoices/${created.draftInvoiceId}`, cookie);
    if (created.productId) await apiDelete(`/api/products/${created.productId}`, cookie);
    if (created.customerId) await apiDelete(`/api/customers/${created.customerId}`, cookie);
    if (created.brandId) await apiDelete(`/api/brands/${created.brandId}`, cookie);
  });

  test('DELETE on a delivered invoice is rejected with 400 invoice_delete_requires_cancel', async () => {
    // Create an invoice and deliver it so stock is deducted.
    const create = await apiPost(
      '/api/invoices',
      {
        customer_id: created.customerId,
        invoice_date: '2026-04-25',
        status: 'draft',
        tax_amount: '10',
        total_amount: '210',
        items: [
          {
            product_id: created.productId,
            quantity: 2,
            unit_price: 100,
            line_total: 200,
            description: 'RF1',
          },
        ],
      },
      cookie,
    );
    expect(create.status).toBe(201);
    created.deliveredInvoiceId = (create.data as { id: number }).id;

    const stockBeforeDelivery = await stockOf(created.productId!, cookie);

    const deliver = await apiPut(
      `/api/invoices/${created.deliveredInvoiceId}`,
      {
        customer_id: created.customerId,
        status: 'delivered',
        invoice_date: '2026-04-25',
        tax_amount: '10',
        total_amount: '210',
        items: [
          {
            product_id: created.productId,
            quantity: 2,
            unit_price: 100,
            line_total: 200,
            description: 'RF1',
          },
        ],
      },
      cookie,
    );
    expect(deliver.status).toBe(200);

    const stockAfterDelivery = await stockOf(created.productId!, cookie);
    expect(stockAfterDelivery).toBe(stockBeforeDelivery - 2);

    // Attempt to delete the delivered invoice. The server must refuse.
    const r = await fetch(`${BASE_URL}/api/invoices/${created.deliveredInvoiceId}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error?: string; message?: string };
    expect(body.error).toBe('invoice_delete_requires_cancel');
    expect(body.message).toMatch(/Cancel Invoice/i);

    // Invoice still present, status unchanged, no recycle-bin row written.
    const stillThere = (await apiGet(
      `/api/invoices/${created.deliveredInvoiceId}`,
      cookie,
    )) as { id?: number; status?: string };
    expect(stillThere.id).toBe(created.deliveredInvoiceId);
    expect(stillThere.status).toBe('delivered');

    expect(await recycleBinHasInvoice(created.deliveredInvoiceId!, cookie)).toBe(false);

    // Stock unchanged by the rejected delete.
    expect(await stockOf(created.productId!, cookie)).toBe(stockAfterDelivery);
  });

  test('DELETE on a draft invoice still soft-deletes to the recycle bin (control)', async () => {
    const create = await apiPost(
      '/api/invoices',
      {
        customer_id: created.customerId,
        invoice_date: '2026-04-26',
        status: 'draft',
        tax_amount: '5',
        total_amount: '105',
        items: [
          {
            product_id: created.productId,
            quantity: 1,
            unit_price: 100,
            line_total: 100,
            description: 'RF1 draft',
          },
        ],
      },
      cookie,
    );
    expect(create.status).toBe(201);
    created.draftInvoiceId = (create.data as { id: number }).id;

    const status = await apiDelete(`/api/invoices/${created.draftInvoiceId}`, cookie);
    expect(status).toBe(200);

    expect(await recycleBinHasInvoice(created.draftInvoiceId!, cookie)).toBe(true);

    // The invoice row itself is gone after soft-delete.
    const lookup = await fetch(`${BASE_URL}/api/invoices/${created.draftInvoiceId}`, {
      headers: { Cookie: cookie },
    });
    expect(lookup.status).toBe(404);
  });

  test('PATCH /api/invoices/:id/cancel still cancels a delivered invoice and reverses stock', async () => {
    // Fresh invoice so the previous delivered-but-blocked-from-delete
    // one in test 1 is unaffected.
    const create = await apiPost(
      '/api/invoices',
      {
        customer_id: created.customerId,
        invoice_date: '2026-04-27',
        status: 'draft',
        tax_amount: '15',
        total_amount: '315',
        items: [
          {
            product_id: created.productId,
            quantity: 3,
            unit_price: 100,
            line_total: 300,
            description: 'RF1 cancel-path',
          },
        ],
      },
      cookie,
    );
    expect(create.status).toBe(201);
    created.cancelDeliveredInvoiceId = (create.data as { id: number }).id;

    const stockBefore = await stockOf(created.productId!, cookie);

    const deliver = await apiPut(
      `/api/invoices/${created.cancelDeliveredInvoiceId}`,
      {
        customer_id: created.customerId,
        status: 'delivered',
        invoice_date: '2026-04-27',
        tax_amount: '15',
        total_amount: '315',
        items: [
          {
            product_id: created.productId,
            quantity: 3,
            unit_price: 100,
            line_total: 300,
            description: 'RF1 cancel-path',
          },
        ],
      },
      cookie,
    );
    expect(deliver.status).toBe(200);
    expect(await stockOf(created.productId!, cookie)).toBe(stockBefore - 3);

    const cancel = await fetch(
      `${BASE_URL}/api/invoices/${created.cancelDeliveredInvoiceId}/cancel`,
      {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      },
    );
    expect(cancel.status).toBe(200);

    // Stock fully restored, status flipped to cancelled.
    expect(await stockOf(created.productId!, cookie)).toBe(stockBefore);
    const after = (await apiGet(
      `/api/invoices/${created.cancelDeliveredInvoiceId}`,
      cookie,
    )) as { status?: string };
    expect(after.status).toBe('cancelled');
  });
});
