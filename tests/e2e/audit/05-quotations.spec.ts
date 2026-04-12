/**
 * Phase 5 — Quotations
 *
 * 31-39. Create QT-01 (8 items), QT-02 (1 item), QT-03 (12 items),
 *        submit QT-01, cancel QT-02, view/print, export, convert QT-01 to invoice
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

test.describe('Phase 5 — Quotations', () => {
  test.setTimeout(180000);

  let cookie: string;
  let customerIds: number[];
  let productIds: number[];
  let qt01Id: number;
  let qt02Id: number;
  let qt03Id: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    customerIds = state.customerIds ?? [];
    productIds = state.productIds ?? [];
  });

  function makeItems(prods: number[], count: number, withRemarks = false) {
    return prods.slice(0, count).map((pId, i) => ({
      product_id: pId,
      description: `Audit line ${i + 1}${withRemarks ? ' — special notes' : ''}`,
      quantity: i + 1,
      unit_price: 20 + i * 5,
      line_total: (i + 1) * (20 + i * 5),
    }));
  }

  test('create QT-01: 8 line items with remarks', async () => {
    test.skip(customerIds.length === 0 || productIds.length < 8, 'Requires customers and 8+ products');
    const items = makeItems(productIds, 8, true);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[0],
      quote_date: '2026-04-10',
      valid_until: '2026-05-10',
      status: 'draft',
      notes: 'Audit QT-01 overall remarks',
      show_remarks: true,
      total_amount: subtotal.toFixed(2),
      vat_amount: vat.toFixed(2),
      grand_total: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt01Id = (data as { id: number }).id;
    expect(qt01Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `QT-01 created id=${qt01Id} (8 items)` });
  });

  test('create QT-02: 1 line item, no remarks', async () => {
    test.skip(customerIds.length === 0 || productIds.length === 0, 'Requires customers and products');
    const items = makeItems(productIds, 1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[0],
      quote_date: '2026-04-10',
      valid_until: '2026-05-10',
      status: 'draft',
      total_amount: subtotal.toFixed(2),
      vat_amount: vat.toFixed(2),
      grand_total: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt02Id = (data as { id: number }).id;
    expect(qt02Id).toBeTruthy();
    test.info().annotations.push({ type: 'info', description: `QT-02 created id=${qt02Id} (1 item, minimal)` });
  });

  test('create QT-03: 12 line items, different customer', async () => {
    test.skip(customerIds.length < 2 || productIds.length < 12, 'Requires 2+ customers and 12+ products');
    const items = makeItems(productIds, 12);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;

    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[1],
      quote_date: '2026-04-10',
      valid_until: '2026-05-10',
      status: 'draft',
      notes: 'Audit QT-03 — 12 line items for print test',
      total_amount: subtotal.toFixed(2),
      vat_amount: vat.toFixed(2),
      grand_total: (subtotal + vat).toFixed(2),
      items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt03Id = (data as { id: number }).id;
    expect(qt03Id).toBeTruthy();
    saveState({ quotationIds: { qt01: qt01Id, qt02: qt02Id, qt03: qt03Id } });
    test.info().annotations.push({ type: 'info', description: `QT-03 created id=${qt03Id} (12 items)` });
  });

  test('submit QT-01; status changes to sent', async () => {
    test.skip(!qt01Id, 'Requires QT-01');
    const { status, data } = await apiPut(`/api/quotations/${qt01Id}`, { status: 'sent' }, cookie);
    expect([200, 201]).toContain(status);
    const updated = data as { status?: string };
    expect(['sent', 'submitted']).toContain(updated.status);
    test.info().annotations.push({ type: 'info', description: 'QT-01 submitted/sent' });
  });

  test('cancel QT-02 from Draft', async () => {
    test.skip(!qt02Id, 'Requires QT-02');
    const { status, data } = await apiPut(`/api/quotations/${qt02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    const updated = data as { status?: string };
    expect(updated.status).toBe('cancelled');
    test.info().annotations.push({ type: 'info', description: 'QT-02 cancelled from Draft' });
  });

  test('quotations list page renders in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/quotation|quote|new/i);
    test.info().annotations.push({ type: 'info', description: 'Quotations list page renders' });
  });

  test('QT-01 detail shows all 8 items', async () => {
    test.skip(!qt01Id, 'Requires QT-01');
    const data = await (await fetch(`${BASE_URL}/api/quotations/${qt01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((data.items ?? []).length).toBe(8);
    test.info().annotations.push({ type: 'info', description: 'QT-01 detail API confirms 8 line items' });
  });

  test('QT-03 detail shows all 12 items', async () => {
    test.skip(!qt03Id, 'Requires QT-03');
    const data = await (await fetch(`${BASE_URL}/api/quotations/${qt03Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((data.items ?? []).length).toBe(12);
    test.info().annotations.push({ type: 'info', description: 'QT-03 detail API confirms 12 line items' });
  });

  test('convert QT-01 to invoice via API (if endpoint exists)', async () => {
    test.skip(!qt01Id, 'Requires QT-01');
    const r = await fetch(`${BASE_URL}/api/quotations/${qt01Id}/convert-to-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
    });
    if (r.status === 404) {
      test.info().annotations.push({ type: 'warn', description: 'Convert-to-invoice endpoint does not exist — manual creation required' });
    } else {
      expect([200, 201]).toContain(r.status);
      test.info().annotations.push({ type: 'info', description: 'QT-01 converted to invoice via API endpoint' });
    }
  });
});
