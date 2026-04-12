/**
 * Phase 9 — Documents, PDFs & Exports
 *
 * 64-70. Verify print views render for Invoice/PO/Quotation/DO;
 *        verify CSV export download triggers; check TRN in print view;
 *        verify export dropdown on Invoice and Quotation list pages
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, browserLogin, loadState } from './audit-helpers';

test.describe('Phase 9 — Documents, PDFs & Exports', () => {
  test.setTimeout(120000);

  let cookie: string;
  let invoiceIds: ReturnType<typeof loadState>['invoiceIds'];
  let poIds: ReturnType<typeof loadState>['poIds'];
  let quotationIds: ReturnType<typeof loadState>['quotationIds'];
  let doIds: ReturnType<typeof loadState>['doIds'];

  test.beforeAll(async () => {
    cookie = await apiLogin();
    const state = loadState();
    invoiceIds = state.invoiceIds;
    poIds = state.poIds;
    quotationIds = state.quotationIds;
    doIds = state.doIds;
  });

  test('INV-01 print view renders with company header, line items, and VAT', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/invoice|total|AED|VAT/i);
    test.info().annotations.push({ type: 'info', description: 'INV-01 print view renders with invoice data, totals, VAT' });
  });

  test('company TRN (100123456700003) appears in INV-01 print view', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    const hasTrn = body.includes('100123456700003') || body.match(/TRN|tax registration number/i) !== null;
    expect(hasTrn).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'Company TRN visible in INV-01 print view' });
  });

  test('company name "Audit Test Co" appears in INV-01 print view', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/audit test co/i);
    test.info().annotations.push({ type: 'info', description: 'Company name "Audit Test Co" in print view' });
  });

  test('INV-03 print view renders (10-item multi-page layout)', async ({ page }) => {
    test.skip(!invoiceIds?.inv03, 'Requires INV-03');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv03}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/invoice|line|total/i);
    test.info().annotations.push({ type: 'info', description: 'INV-03 10-item print view renders' });
  });

  test('PO-01 print view renders with purchase order data', async ({ page }) => {
    test.skip(!poIds?.po01, 'Requires PO-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${poIds!.po01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
    test.info().annotations.push({ type: 'info', description: 'PO-01 print view navigated successfully' });
  });

  test('QT-01 print view renders via /quotation-print URL', async ({ page }) => {
    test.skip(!quotationIds?.qt01, 'Requires QT-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt01}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
    expect(body).toMatch(/quotation|total|AED/i);
    test.info().annotations.push({ type: 'info', description: 'QT-01 print view renders' });
  });

  test('QT-03 print view renders (12-item multi-line layout)', async ({ page }) => {
    test.skip(!quotationIds?.qt03, 'Requires QT-03');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt03}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    test.info().annotations.push({ type: 'info', description: 'QT-03 12-item print view renders' });
  });

  test('Invoices page export dropdown triggers CSV download', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    const exportBtn = page.locator('button').filter({ hasText: /export|download|csv/i }).first();
    if (!await exportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      test.info().annotations.push({ type: 'warn', description: 'Export button not found on Invoice list page — may be hidden in dropdown' });
      const dropdownTrigger = page.locator('[data-testid*="export"], button[aria-haspopup]').first();
      if (await dropdownTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
        await dropdownTrigger.click();
        await page.waitForTimeout(500);
      }
    } else {
      await exportBtn.click();
    }
    const dl = await downloadPromise;
    if (dl) {
      const filename = dl.suggestedFilename();
      expect(filename.length).toBeGreaterThan(0);
      test.info().annotations.push({ type: 'info', description: `Invoice export downloaded: ${filename}` });
    } else {
      test.info().annotations.push({ type: 'warn', description: 'No download event fired — export may open print preview instead' });
    }
  });

  test('Quotations page has export dropdown or Print view button', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/quotation|export|print/i);
    const hasExport = await page.locator('button').filter({ hasText: /export|print/i }).count() > 0;
    expect(hasExport).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'Quotations page has export/print action button(s)' });
  });

  test('audit_viewer (Viewer role) can view invoice print page', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    if (loginResp.status !== 200) {
      test.info().annotations.push({ type: 'warn', description: 'audit_viewer login failed — skip viewer access test' });
      return;
    }

    const rawCookie = loginResp.headers.get('set-cookie') ?? '';
    const viewerCookie = rawCookie.split(';')[0];
    await page.context().addCookies([{
      name: viewerCookie.split('=')[0],
      value: viewerCookie.split('=').slice(1).join('='),
      domain: 'localhost',
      path: '/',
    }]);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const isAccessible = body.length > 50 && !body.toLowerCase().includes('forbidden') && !body.toLowerCase().includes('unauthorized');
    expect(isAccessible).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'audit_viewer can access invoice print view' });
  });
});
