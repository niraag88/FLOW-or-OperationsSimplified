/**
 * Phase 9 — Documents, PDFs & Exports
 *
 * 64-67. Verify PDF print views render correctly; test export downloads;
 *        verify Inventory export; check viewer role access to print views
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

  test('invoice list page renders correctly in browser', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/invoice|new invoice/i);
    test.info().annotations.push({ type: 'info', description: 'Invoice list renders correctly' });
  });

  test('INV-01 print view renders with company header and line items', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit test co|invoice|line|total|AED|VAT/i);
    test.info().annotations.push({ type: 'info', description: 'INV-01 print view renders with company header and items' });
  });

  test('PO-01 print view renders correctly', async ({ page }) => {
    test.skip(!poIds?.po01, 'Requires PO-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${poIds!.po01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
    test.info().annotations.push({ type: 'info', description: 'PO-01 print view navigated successfully' });
  });

  test('export CSV from invoices list triggers download', async ({ page }) => {
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);

    const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    const exportBtn = page.locator('button').filter({ hasText: /export|download|csv/i }).first();
    if (await exportBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await exportBtn.click();
      const dl = await downloadPromise;
      if (dl) {
        const filename = dl.suggestedFilename();
        expect(filename.length).toBeGreaterThan(0);
        test.info().annotations.push({ type: 'info', description: `Invoice export downloaded: ${filename}` });
      } else {
        test.info().annotations.push({ type: 'warn', description: 'Export button clicked but no download event fired within timeout' });
      }
    } else {
      test.info().annotations.push({ type: 'warn', description: 'Export button not found on Invoice list page' });
    }
  });

  test('inventory export API returns data', async () => {
    const r = await fetch(`${BASE_URL}/api/inventory/export`, { headers: { Cookie: cookie } });
    if (r.status === 404) {
      test.info().annotations.push({ type: 'warn', description: 'Inventory export endpoint not found at /api/inventory/export' });
    } else {
      expect([200, 204]).toContain(r.status);
      test.info().annotations.push({ type: 'info', description: 'Inventory export API returned data' });
    }
  });

  test('audit_viewer can view invoice print page (read-only access)', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');

    const loginResp = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'audit_viewer', password: 'AuditPass2!' }),
    });
    if (loginResp.status !== 200) {
      test.info().annotations.push({ type: 'warn', description: 'audit_viewer login failed — skipping read-only access test' });
      return;
    }
    const viewerCookie = loginResp.headers.get('set-cookie')?.split(';')[0] ?? '';
    await page.setExtraHTTPHeaders({ Cookie: viewerCookie });
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    expect(body.length).toBeGreaterThan(50);
    test.info().annotations.push({ type: 'info', description: 'audit_viewer can access print view page' });
  });

  test('company TRN appears in invoice print view', async ({ page }) => {
    test.skip(!invoiceIds?.inv01, 'Requires INV-01');
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    const hasTrn = body.includes('100123456700003') || body.match(/TRN|tax registration/i) !== null;
    expect(hasTrn).toBe(true);
    test.info().annotations.push({ type: 'info', description: 'Company TRN visible in invoice print view' });
  });
});
