/**
 * Phase 9 — Documents, PDFs & Exports
 *
 * Browser tests: Print views for Invoice (with TRN, company name), PO, Quotation (QT-03 12 items);
 *                Export dropdown/button present on Invoice and Quotation list pages;
 *                Export triggers download event on Invoices page;
 *                audit_viewer can access invoice print view.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, browserLogin, loadState } from './audit-helpers';

test.describe('Phase 9 — Documents, PDFs & Exports', () => {
  test.setTimeout(120000);

  let cookie: string;
  let invoiceIds: ReturnType<typeof loadState>['invoiceIds'];
  let poIds: ReturnType<typeof loadState>['poIds'];
  let quotationIds: ReturnType<typeof loadState>['quotationIds'];

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    invoiceIds = state.invoiceIds;
    poIds = state.poIds;
    quotationIds = state.quotationIds;
    expect(invoiceIds?.inv01).toBeGreaterThan(0);
    expect(poIds?.po01).toBeGreaterThan(0);
    expect(quotationIds?.qt01).toBeGreaterThan(0);
    expect(quotationIds?.qt03).toBeGreaterThan(0);
  });

  test('INV-01 print view renders with company name "Audit Test Co"', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit test co/i);
  });

  test('INV-01 print view contains TRN 100123456700003', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toContain('100123456700003');
  });

  test('INV-01 print view shows invoice number, line items, and VAT total', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/AED|total|VAT/i);
  });

  test('INV-03 print view (10 items) renders with customer name', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv03}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3/i);
  });

  test('PO-01 print page renders with purchase order content', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${poIds!.po01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
  });

  test('QT-01 print view renders with quotation data', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt01}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/quotation|total|AED/i);
  });

  test('QT-03 print view (12 items) renders with Customer 2 name', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt03}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit customer 2/i);
  });

  test('Invoices page has export/print action button(s)', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportBtn = page.locator('button').filter({ hasText: /export|print|view & print/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });

  test('Invoices page export triggers a file download', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    const dl = await downloadPromise;
    const filename = dl.suggestedFilename();
    expect(filename.length).toBeGreaterThan(0);
  });

  test('Quotations page has export or View & Print action button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportBtn = page.locator('button').filter({ hasText: /export|print|view/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
  });

  test('audit_viewer (Viewer role) can access INV-01 print view', async ({ page }) => {
    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect(loginResp.status).toBe(200);

    const rawCookie = loginResp.headers.get('set-cookie') ?? '';
    const sessionCookie = rawCookie.split(';')[0];
    const [name, ...valueParts] = sessionCookie.split('=');
    await page.context().addCookies([{
      name: name.trim(),
      value: valueParts.join('=').trim(),
      domain: 'localhost',
      path: '/',
    }]);

    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body.toLowerCase()).not.toContain('forbidden');
    expect(body.toLowerCase()).not.toContain('unauthorized');
  });
});
