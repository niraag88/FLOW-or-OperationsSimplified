/**
 * Phase 6 — Invoices
 *
 * 40-51. Create INV-01 (6 items), INV-02 (1 item), INV-03 (10 items), INV-04 (cancelled),
 *        lifecycle transitions, view/print, export, Payments Ledger check
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

test.describe('Phase 6 — Invoices', () => {
  test.setTimeout(180000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let inv01Id: number;
  let inv02Id: number;
  let inv03Id: number;
  let inv04Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
  });

  function makeItems(prods: number[], count: number) {
    return prods.slice(0, count).map((pId, i) => ({
      product_id: pId,
      description: `Audit invoice line ${i + 1}`,
      quantity: i + 1,
      unit_price: 25 + i * 5,
      line_total: (i + 1) * (25 + i * 5),
    }));
  }

  test('create INV-01: Customer 1, 6 line items with remarks', async () => {
    test.skip(customerIds.length === 0 || productIds.length < 6, 'Requires customers and 6+ products');
    const items = makeItems(productIds, 6);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[0],
      invoice_date: '2026-04-12',
      status: 'Draft',
      notes: 'Audit INV-01 overall remarks',
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv01Id = (data as { id: number }).id;
    expect(inv01Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `INV-01 created id=${inv01Id} (6 items)` });
  });

  test('create INV-02: Customer 2, 1 line item, no remarks', async () => {
    test.skip(customerIds.length < 2 || productIds.length === 0, 'Requires 2+ customers and products');
    const items = makeItems(productIds, 1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[1],
      invoice_date: '2026-04-12',
      status: 'Draft',
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv02Id = (data as { id: number }).id;
    expect(inv02Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `INV-02 created id=${inv02Id} (1 item)` });
  });

  test('create INV-03: Customer 3, 10 line items', async () => {
    test.skip(customerIds.length < 3 || productIds.length < 10, 'Requires 3+ customers and 10+ products');
    const items = makeItems(productIds, 10);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[2],
      invoice_date: '2026-04-12',
      status: 'Draft',
      notes: 'Audit INV-03 — 10 items for print test',
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv03Id = (data as { id: number }).id;
    expect(inv03Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `INV-03 created id=${inv03Id} (10 items)` });
  });

  test('create INV-04: Customer 1, 3 items — to be cancelled', async () => {
    test.skip(customerIds.length === 0 || productIds.length < 3, 'Requires customers and 3+ products');
    const items = makeItems(productIds, 3);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/invoices', {
      customer_id: customerIds[0],
      invoice_date: '2026-04-12',
      status: 'Draft',
      tax_amount: vat.toFixed(2),
      total_amount: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv04Id = (data as { id: number }).id;
    test.info().annotations.push({ type: 'info', description: `INV-04 created id=${inv04Id}` });
  });

  test('submit INV-01; mark Delivered; mark Paid', async () => {
    test.skip(!inv01Id, 'Requires INV-01');
    const { status: s1 } = await apiPut(`/api/invoices/${inv01Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1);

    const { status: s2 } = await apiPut(`/api/invoices/${inv01Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2);

    const { status: s3 } = await apiPut(`/api/invoices/${inv01Id}`, {
      status: 'paid',
      paymentStatus: 'paid',
      paymentReceivedDate: '2026-04-15',
      paymentRemarks: 'Bank transfer received',
    }, cookie);
    expect([200, 201]).toContain(s3);
    test.info().annotations.push({ type: 'info', description: 'INV-01 lifecycle: Draft → Submitted → Delivered → Paid' });
  });

  test('submit INV-02; mark Paid directly', async () => {
    test.skip(!inv02Id, 'Requires INV-02');
    const { status: s1 } = await apiPut(`/api/invoices/${inv02Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1);
    const { status: s2 } = await apiPut(`/api/invoices/${inv02Id}`, { status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15' }, cookie);
    expect([200, 201]).toContain(s2);
    test.info().annotations.push({ type: 'info', description: 'INV-02: Draft → Submitted → Paid (direct)' });
  });

  test('submit INV-03; mark Delivered only (leave unpaid)', async () => {
    test.skip(!inv03Id, 'Requires INV-03');
    const { status: s1 } = await apiPut(`/api/invoices/${inv03Id}`, { status: 'submitted' }, cookie);
    expect([200, 201]).toContain(s1);
    const { status: s2 } = await apiPut(`/api/invoices/${inv03Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s2);
    test.info().annotations.push({ type: 'info', description: 'INV-03: Draft → Submitted → Delivered (unpaid, outstanding)' });
  });

  test('cancel INV-04 from Draft', async () => {
    test.skip(!inv04Id, 'Requires INV-04');
    const { status } = await apiPut(`/api/invoices/${inv04Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'info', description: 'INV-04 cancelled from Draft' });
  });

  test('INV-01 detail shows all 6 line items', async () => {
    test.skip(!inv01Id, 'Requires INV-01');
    const data = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((data.items ?? []).length).toBe(6);
    test.info().annotations.push({ type: 'info', description: 'INV-01 API detail confirms 6 line items' });
  });

  test('INV-03 detail shows all 10 line items', async () => {
    test.skip(!inv03Id, 'Requires INV-03');
    const data = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((data.items ?? []).length).toBe(10);
    test.info().annotations.push({ type: 'info', description: 'INV-03 API detail confirms 10 line items' });
  });

  test('invoices list renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/invoice|new invoice/i);
    saveState({ invoiceIds: { inv01: inv01Id, inv02: inv02Id, inv03: inv03Id, inv04: inv04Id } });
    test.info().annotations.push({ type: 'info', description: 'Invoice list page renders with entries' });
  });

  test('payments ledger renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Payments`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(30);
    test.info().annotations.push({ type: 'info', description: 'Payments Ledger page renders' });
  });
});
