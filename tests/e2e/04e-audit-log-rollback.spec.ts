import { test, expect } from '@playwright/test';
import { apiLogin, apiGet, apiPost, apiPut, apiDelete, BASE_URL } from './helpers';

/**
 * Task #375 — durable audit logging integration test.
 *
 * Proves that when the audit-log insert fails inside a sensitive
 * action's transaction, the WHOLE action rolls back: the invoice
 * status stays "delivered", and the stock that was deducted at
 * delivery time is NOT returned to the product (because the
 * cancellation never committed).
 *
 * The server exposes a dev-only test seam at
 *   POST /api/__test__/audit-fault-inject  { enabled: boolean }
 * that toggles a module-level flag making writeAuditLogSync throw
 * synthetically. The cancel route wraps its stock-reversal +
 * status-flip + audit insert in a single db.transaction(), so the
 * thrown error from the audit insert MUST roll back the entire tx.
 *
 * If this test ever fails it means a destructive route is writing
 * its audit row outside the transaction — that is a regression that
 * would let an audit-log outage produce silent gaps in the trail
 * for sensitive operations.
 */
test.describe('Sensitive-action audit-log rollback (Task #375)', () => {
  let cookie: string;
  const created: {
    brandId?: number;
    customerId?: number;
    productId?: number;
    invoiceId?: number;
  } = {};
  const tag = `AUDIT375-${Date.now()}`;

  const setFaultInject = async (enabled: boolean) => {
    const res = await fetch(`${BASE_URL}/api/__test__/audit-fault-inject`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    expect(res.status, 'fault-inject toggle should be available in non-prod').toBe(200);
  };

  const stockOf = async (productId: number): Promise<number> => {
    const p = (await apiGet(`/api/products/${productId}`, cookie)) as { stockQuantity?: number };
    return Number(p.stockQuantity ?? 0);
  };

  const invoiceStatusOf = async (invoiceId: number): Promise<string> => {
    const inv = (await apiGet(`/api/invoices/${invoiceId}`, cookie)) as { status?: string };
    return String(inv.status ?? '');
  };

  test.beforeAll(async () => {
    cookie = await apiLogin();

    const brand = await apiPost('/api/brands', { name: `Audit Brand ${tag}` }, cookie);
    expect(brand.status).toBe(201);
    created.brandId = (brand.data as { id: number }).id;

    const customer = await apiPost(
      '/api/customers',
      { name: `Audit Cust ${tag}`, dataSource: 'e2e_test' },
      cookie,
    );
    expect(customer.status).toBe(201);
    created.customerId = (customer.data as { id: number }).id;

    const product = await apiPost(
      '/api/products',
      {
        name: `Audit Prod ${tag}`,
        sku: `AUD-${tag}`,
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

    // Create + deliver an invoice so cancel has stock to reverse.
    const create = await apiPost(
      '/api/invoices',
      {
        customer_id: created.customerId,
        invoice_date: '2026-04-29',
        status: 'delivered',
        tax_amount: '25',
        total_amount: '525',
        items: [
          {
            product_id: created.productId,
            quantity: 5,
            unit_price: 100,
            line_total: 500,
            description: `Audit ${tag}`,
          },
        ],
      },
      cookie,
    );
    expect(create.status).toBe(201);
    created.invoiceId = (create.data as { id: number }).id;

    // Sanity: stock was deducted by 5.
    expect(await stockOf(created.productId!)).toBe(15);
    expect(await invoiceStatusOf(created.invoiceId!)).toBe('delivered');
  });

  test.afterAll(async () => {
    // Leave no fault-inject state on the server even if a test failed mid-way.
    try {
      await setFaultInject(false);
    } catch {
      /* ignore — server might be down at teardown */
    }
    if (created.invoiceId) {
      // Final, real cancel so the test invoice can be deleted cleanly.
      await fetch(`${BASE_URL}/api/invoices/${created.invoiceId}/cancel`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      await apiDelete(`/api/invoices/${created.invoiceId}`, cookie);
    }
    if (created.productId) await apiDelete(`/api/products/${created.productId}`, cookie);
    if (created.customerId) await apiDelete(`/api/customers/${created.customerId}`, cookie);
    if (created.brandId) await apiDelete(`/api/brands/${created.brandId}`, cookie);
  });

  test('audit-log insert failure during invoice cancel rolls back stock + status', async () => {
    // Arm the fault: writeAuditLogSync will throw on the next call.
    await setFaultInject(true);

    let cancelStatus = 0;
    let cancelBody: unknown = null;
    try {
      const res = await fetch(`${BASE_URL}/api/invoices/${created.invoiceId}/cancel`, {
        method: 'PATCH',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: '{}',
      });
      cancelStatus = res.status;
      cancelBody = await res.json().catch(() => null);
    } finally {
      // Disarm BEFORE assertions so a later assertion failure can't leave
      // the server in fault-inject mode and break unrelated tests.
      await setFaultInject(false);
    }

    // Cancel should NOT have succeeded — the audit insert threw inside
    // the tx, so the route should return a 5xx and report nothing changed.
    expect(cancelStatus, `cancel response body=${JSON.stringify(cancelBody)}`).toBeGreaterThanOrEqual(500);

    // The whole tx rolled back: stock is still 15 (NOT 20 — the +5
    // reversal would only land if the cancel committed) and the invoice
    // status is still "delivered" (NOT "cancelled").
    expect(await stockOf(created.productId!)).toBe(15);
    expect(await invoiceStatusOf(created.invoiceId!)).toBe('delivered');
  });

  test('after the fault is cleared, a real cancel commits and reverses stock', async () => {
    // Belt-and-braces: confirm the fault flag is off.
    await setFaultInject(false);

    const res = await fetch(`${BASE_URL}/api/invoices/${created.invoiceId}/cancel`, {
      method: 'PATCH',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);

    // Stock returned, status flipped to cancelled.
    expect(await stockOf(created.productId!)).toBe(20);
    expect(await invoiceStatusOf(created.invoiceId!)).toBe('cancelled');
  });
});
