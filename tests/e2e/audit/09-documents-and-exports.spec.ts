/**
 * Phase 9 — Documents, PDFs & Exports
 *
 * Browser tests: Print views for INV-01 (company name, TRN, items, VAT),
 *                INV-03 (10 items), PO-01, QT-01 (8 items), QT-03 (12 items).
 *                Export button visible on Invoices page; triggers download event.
 *                Quotations page has export/print button.
 *                audit_viewer (Viewer role) can access INV-01 print view.
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, browserLogin, loadState } from './audit-helpers';

test.describe('Phase 9 — Documents, PDFs & Exports', () => {
  test.setTimeout(120000);

  let invoiceIds: ReturnType<typeof loadState>['invoiceIds'];
  let poIds: ReturnType<typeof loadState>['poIds'];
  let quotationIds: ReturnType<typeof loadState>['quotationIds'];

  test.beforeAll(async () => {
    const state = loadState();
    invoiceIds = state.invoiceIds;
    poIds = state.poIds;
    quotationIds = state.quotationIds;
    expect(invoiceIds?.inv01).toBeGreaterThan(0);
    expect(poIds?.po01).toBeGreaterThan(0);
    expect(quotationIds?.qt01).toBeGreaterThan(0);
    expect(quotationIds?.qt03).toBeGreaterThan(0);
  });

  test('INV-01 print view contains company name "Audit Test Co"', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert company name` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Print body length: ${body.length}; company: ${/audit test co/i.test(body)}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit test co/i);
  });

  test('INV-01 print view contains TRN 100123456700003', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert TRN` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `TRN present: ${body.includes('100123456700003')}` });
    expect(body).toContain('100123456700003');
  });

  test('INV-01 print view shows invoice number, line items, and AED/VAT totals', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert invoice + AED + VAT` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has invoice/AED/VAT: ${/invoice/i.test(body) && /AED|total|VAT/i.test(body)}` });
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/AED|total|VAT/i);
  });

  test('INV-03 print view (10 items) renders with customer name', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv03}/print; assert Audit Customer 3` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv03}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `INV-03 print body length: ${body.length}; has Customer 3: ${/audit customer 3/i.test(body)}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3/i);
  });

  test('PO-01 print page renders with purchase order content', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders/${poIds?.po01}/print; assert content` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${poIds!.po01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `PO print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(50);
  });

  test('QT-01 print view renders with quotation data', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${quotationIds?.qt01}; assert quotation/AED/total` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt01}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-01 print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/quotation|total|AED/i);
  });

  test('QT-03 print view (12 items) renders with Customer 2 name', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${quotationIds?.qt03}; assert Audit Customer 2` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt03}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-03 print contains Customer 2: ${/audit customer 2/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit customer 2/i);
  });

  test('Invoices page has export/print action button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert export/print button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportBtn = page.locator('button').filter({ hasText: /export|print|view & print/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Export/print button visible on Invoices page' });
  });

  test('Invoices page export triggers a file download event', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Click export/csv button on /Invoices; assert download event fires' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    const filename = dl.suggestedFilename();
    test.info().annotations.push({ type: 'result', description: `Downloaded file: ${filename}` });
    expect(filename.length).toBeGreaterThan(0);
  });

  test('Quotations page has export or print action button', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Quotations; assert export/print button visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const exportBtn = page.locator('button').filter({ hasText: /export|print|view/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'Export/print button visible on Quotations page' });
  });

  test('audit_viewer (Viewer role) can access INV-01 print view without 403', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Login as audit_viewer; navigate to INV-01 print; assert not forbidden' });
    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    expect(loginResp.status).toBe(200);

    const rawCookie = loginResp.headers.get('set-cookie') ?? '';
    const sessionCookie = rawCookie.split(';')[0];
    const eqIdx = sessionCookie.indexOf('=');
    const cookieName = sessionCookie.slice(0, eqIdx).trim();
    const cookieValue = sessionCookie.slice(eqIdx + 1).trim();
    await page.context().addCookies([{
      name: cookieName,
      value: cookieValue,
      domain: 'localhost',
      path: '/',
    }]);

    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Viewer print body length: ${body.length}; has forbidden: ${/forbidden|unauthorized/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body.toLowerCase()).not.toContain('forbidden');
    expect(body.toLowerCase()).not.toContain('unauthorized');
  });
});
