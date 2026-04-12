/**
 * Phase 5 — Quotations
 *
 * Browser tests: Quotations list renders; New Quotation button visible and opens form;
 *                Print view renders with totals/VAT.
 * API tests: Create QT-01/02/03, submit QT-01, cancel QT-02, verify line counts.
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
    expect(customerIds.length).toBeGreaterThanOrEqual(5);
    expect(productIds.length).toBeGreaterThanOrEqual(12);
  });

  function makeItems(count: number) {
    return productIds.slice(0, count).map((pId, i) => ({
      product_id: pId, description: `Audit line ${i + 1}`, quantity: i + 1,
      unit_price: 20 + i * 5, line_total: (i + 1) * (20 + i * 5),
    }));
  }

  test('Quotations list page renders with "New Quotation" button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new quotation/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
  });

  test('New Quotation button opens form with customer selector', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new quotation/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const customerSelect = page.locator('button[role="combobox"]').first();
    await expect(customerSelect).toBeVisible({ timeout: 10000 });
  });

  test('create QT-01 (8 items) via API; line count = 8', async () => {
    const items = makeItems(8);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[0], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      notes: 'Audit QT-01 — 8 items with remarks', show_remarks: true,
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt01Id = (data as { id: number }).id;
    expect(qt01Id).toBeGreaterThan(0);

    const detail = await (await fetch(`${BASE_URL}/api/quotations/${qt01Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((detail.items ?? []).length).toBe(8);
  });

  test('create QT-02 (1 item) via API — to be cancelled', async () => {
    const items = makeItems(1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[0], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt02Id = (data as { id: number }).id;
    expect(qt02Id).toBeGreaterThan(0);
  });

  test('create QT-03 (12 items, Customer 2) via API; line count = 12', async () => {
    const items = makeItems(12);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost('/api/quotations', {
      customer_id: customerIds[1], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      notes: 'Audit QT-03 — 12 items for print test',
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt03Id = (data as { id: number }).id;
    expect(qt03Id).toBeGreaterThan(0);

    const detail = await (await fetch(`${BASE_URL}/api/quotations/${qt03Id}`, { headers: { Cookie: cookie } })).json() as { items?: unknown[] };
    expect((detail.items ?? []).length).toBe(12);

    saveState({ quotationIds: { qt01: qt01Id, qt02: qt02Id, qt03: qt03Id } });
  });

  test('submit QT-01 via API; status becomes sent/submitted', async () => {
    const { status, data } = await apiPut(`/api/quotations/${qt01Id}`, { status: 'sent' }, cookie);
    expect([200, 201]).toContain(status);
    expect(['sent', 'submitted']).toContain((data as { status: string }).status);
  });

  test('cancel QT-02 from Draft via API; status = cancelled', async () => {
    const { status, data } = await apiPut(`/api/quotations/${qt02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    expect((data as { status: string }).status).toBe('cancelled');
  });

  test('quotations list shows sent/cancelled/draft statuses in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/sent|cancelled|draft/i);
  });

  test('Quotations list has export or print action button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportOrPrint = page.locator('button').filter({ hasText: /export|print|view/i }).first();
    await expect(exportOrPrint).toBeVisible({ timeout: 10000 });
  });

  test('QT-01 print view (/quotation-print?id=) renders with quotation data', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${qt01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/quotation|total|AED/i);
  });

  test('QT-03 print view renders (12-item layout)', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${qt03Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit customer 2/i);
  });
});
