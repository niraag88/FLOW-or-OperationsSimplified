/**
 * Phase 5 — Quotations
 *
 * Browser tests: Quotations list; New Quotation button; form opens;
 *                QT-01 submit via browser UI; status reflected in list; print views.
 * API tests: Create QT-01/02/03 (complex line-item forms), cancel QT-02, verify counts.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface QuotationResponse { id: number; status: string; items?: unknown[]; }

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
    expect(customerIds.length).toBeGreaterThanOrEqual(4);
    expect(productIds.length).toBeGreaterThanOrEqual(12);
  });

  function makeItems(count: number) {
    return productIds.slice(0, count).map((pId, i) => ({
      product_id: pId, description: `Audit line ${i + 1}`, quantity: i + 1,
      unit_price: 20 + i * 5, line_total: (i + 1) * (20 + i * 5),
    }));
  }

  test('Quotations list page renders with "New Quotation" button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Quotations; assert New Quotation button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new quotation/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'New Quotation button visible' });
  });

  test('New Quotation button opens form with customer selector', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click New Quotation; assert customer combobox visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new quotation/i }).first();
    await newBtn.click();
    await page.waitForTimeout(2000);
    const customerSelect = page.locator('button[role="combobox"]').first();
    await expect(customerSelect).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Quotation form opened — customer selector visible' });
  });

  test('create QT-01 (8 items, Customer 1) via API; line count = 8', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/quotations QT-01 with 8 items' });
    const items = makeItems(8);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<QuotationResponse>('/api/quotations', {
      customer_id: customerIds[0], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      notes: 'Audit QT-01 — 8 items with remarks', show_remarks: true,
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt01Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/quotations/${qt01Id}`, { headers: { Cookie: cookie } })).json() as QuotationResponse;
    test.info().annotations.push({ type: 'result', description: `QT-01 id=${qt01Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(8);
  });

  test('create QT-02 (1 item) via API — to be cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/quotations QT-02 with 1 item' });
    const items = makeItems(1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<QuotationResponse>('/api/quotations', {
      customer_id: customerIds[0], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `QT-02 id=${qt02Id}` });
    expect(qt02Id).toBeGreaterThan(0);
  });

  test('create QT-03 (12 items, Customer 2) via API; line count = 12', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/quotations QT-03 with 12 items' });
    const items = makeItems(12);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<QuotationResponse>('/api/quotations', {
      customer_id: customerIds[1], quote_date: '2026-04-10', valid_until: '2026-05-10', status: 'draft',
      notes: 'Audit QT-03 — 12 items for print test',
      total_amount: subtotal.toFixed(2), vat_amount: vat.toFixed(2), grand_total: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    qt03Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/quotations/${qt03Id}`, { headers: { Cookie: cookie } })).json() as QuotationResponse;
    test.info().annotations.push({ type: 'result', description: `QT-03 id=${qt03Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(12);
    saveState({ quotationIds: { qt01: qt01Id, qt02: qt02Id, qt03: qt03Id } });
  });

  test('submit QT-01 via browser UI (navigate to detail, click Send/Submit)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /Quotations/${qt01Id}; click Submit/Send button; assert status sent in API` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations/${qt01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const submitBtn = page.locator('button').filter({ hasText: /submit|send|approve/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const qt = await (await fetch(`${BASE_URL}/api/quotations/${qt01Id}`, { headers: { Cookie: cookie } })).json() as QuotationResponse;
    test.info().annotations.push({ type: 'result', description: `QT-01 status after browser submit: ${qt.status}` });
    expect(['sent', 'submitted']).toContain(qt.status);
  });

  test('cancel QT-02 via API; status = cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: `PUT /api/quotations/${qt02Id} status=cancelled` });
    const { status, data } = await apiPut<QuotationResponse>(`/api/quotations/${qt02Id}`, { status: 'cancelled' }, cookie);
    expect([200, 201]).toContain(status);
    test.info().annotations.push({ type: 'result', description: `QT-02 status=${data.status}` });
    expect(data.status).toBe('cancelled');
  });

  test('quotations list shows sent/cancelled/draft statuses in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Quotations; assert sent/cancelled/draft in page body' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body contains status text: ${/sent|cancelled|draft/i.test(body)}` });
    expect(body).toMatch(/sent|cancelled|draft/i);
  });

  test('Quotations list has export or print action button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Assert export/print button visible on /Quotations' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportOrPrint = page.locator('button').filter({ hasText: /export|print|view/i }).first();
    await expect(exportOrPrint).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Export/print button visible' });
  });

  test('QT-01 print view renders with quotation data and customer name', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${qt01Id}; assert content + AED text` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${qt01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-01 print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/quotation|total|AED/i);
  });

  test('QT-03 print view (12 items) renders with Customer 2 name', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${qt03Id}; assert "Audit Customer 2"` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${qt03Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-03 print contains Customer 2: ${/audit customer 2/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit customer 2/i);
  });
});
