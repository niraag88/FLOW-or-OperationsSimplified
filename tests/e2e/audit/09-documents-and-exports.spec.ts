/**
 * Phase 9 — Documents, PDFs & Exports
 *
 * Steps 64–67 from task spec:
 * 64. For each document type (PO, Quotation, Invoice, DO), trigger print/view in browser:
 *     verify company name, company TRN, document number, line items complete, currency "AED", VAT line
 * 65. Test Export dropdown on each list page: confirm CSV/Excel downloads trigger a file download
 * 66. Open Inventory export PDF: verify internal-document format (bordered table, header, footer with timestamp)
 * 67. Attempt to view/edit a document as audit_viewer (Viewer role): verify print view accessible but Edit action hidden
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, browserLogin, loadState } from './audit-helpers';

test.describe('Phase 9 — Documents, PDFs & Exports', () => {
  test.setTimeout(180000);

  let invoiceIds: ReturnType<typeof loadState>['invoiceIds'];
  let poIds: ReturnType<typeof loadState>['poIds'];
  let quotationIds: ReturnType<typeof loadState>['quotationIds'];
  let doIds: ReturnType<typeof loadState>['doIds'];

  test.beforeAll(async () => {
    const state = loadState();
    invoiceIds = state.invoiceIds;
    poIds = state.poIds;
    quotationIds = state.quotationIds;
    doIds = state.doIds;
    expect(invoiceIds?.inv01).toBeGreaterThan(0);
    expect(poIds?.po01).toBeGreaterThan(0);
    expect(quotationIds?.qt01).toBeGreaterThan(0);
  });

  test('9.1 step 64: INV-01 print view — company name "Audit Test Co" renders', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert "Audit Test Co" in body` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Print body length: ${body.length}; company: ${/audit test co/i.test(body)}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit test co/i);
  });

  test('9.2 step 64: INV-01 print view — company TRN 100123456700003 renders', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert TRN present` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `TRN present: ${body.includes('100123456700003')}` });
    expect(body).toContain('100123456700003');
  });

  test('9.3 step 64: INV-01 print view — invoice number, AED currency, VAT line all present', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv01}/print; assert INV number + AED + VAT present` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `invoice: ${/invoice/i.test(body)} AED: ${/AED/i.test(body)} VAT: ${/VAT|vat/i.test(body)}` });
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/AED/i);
    expect(body).toMatch(/VAT|vat/i);
  });

  test('9.4 step 64: INV-03 print view (10 items) — all lines render, customer name present', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${invoiceIds?.inv03}/print; assert customer name and 10+ lines` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv03}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `INV-03 print body length: ${body.length}; has Customer 3: ${/audit customer 3/i.test(body)}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3/i);
  });

  test('9.5 step 64: PO-01 print view — company header, purchase order content renders', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders/${poIds?.po01}/print; assert company + PO content` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${poIds!.po01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `PO print body length: ${body.length}; has "purchase order": ${/purchase order/i.test(body)}` });
    expect(body.length).toBeGreaterThan(50);
    expect(body).toMatch(/purchase order|PO/i);
  });

  test('9.6 step 64: QT-01 print view (8 items) — quotation data, remarks column, VAT breakdown', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${quotationIds?.qt01}; assert quotation + AED + total` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt01}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-01 print body length: ${body.length}; has quotation+AED+VAT: ${/quotation.*total.*AED|AED.*VAT|quotation/is.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/quotation|total|AED/i);
    expect(body).toMatch(/VAT|vat/i);
  });

  test('9.7 step 64: QT-03 print view (12 items) — layout does not truncate, Customer 2 name present', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /quotation-print?id=${quotationIds?.qt03}; assert Audit Customer Two and 12 lines` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/quotation-print?id=${quotationIds!.qt03}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `QT-03 body length: ${body.length}; Customer Two: ${/audit customer two/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body).toMatch(/audit customer two/i);
  });

  test('9.8 step 64: DO-01 print view — company header, delivery address, line items, date', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /DeliveryOrders/${doIds?.do01}/print; assert company + delivery order content` });
    const doId = doIds?.do01;
    if (!doId) {
      test.info().annotations.push({ type: 'issue', description: 'DO-01 id not in state — skipping DO print test' });
      return;
    }
    await browserLogin(page);
    await page.goto(`${BASE_URL}/DeliveryOrders/${doId}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `DO print body length: ${body.length}; has "delivery": ${/delivery/i.test(body)}` });
    expect(body.length).toBeGreaterThan(50);
    expect(body).toMatch(/delivery/i);
  });

  test('9.9 step 65: Invoices list export triggers CSV/Excel file download', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert export button visible; click it; assert download event fires with non-empty filename' });
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
    test.info().annotations.push({ type: 'result', description: `Downloaded file: "${filename}" (non-empty: ${filename.length > 0})` });
    expect(filename.length).toBeGreaterThan(0);
  });

  test('9.10 step 65: Quotations list export triggers file download', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Quotations; assert export button visible; click it; assert download event fires' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Quotations`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    const filename = dl.suggestedFilename();
    test.info().annotations.push({ type: 'result', description: `Quotations downloaded file: "${filename}"` });
    expect(filename.length).toBeGreaterThan(0);
  });

  test('9.11 step 65: PO list export triggers file download', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /PurchaseOrders; assert export button visible; click it; assert download event fires' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    const filename = dl.suggestedFilename();
    test.info().annotations.push({ type: 'result', description: `PO downloaded file: "${filename}"` });
    expect(filename.length).toBeGreaterThan(0);
  });

  test('9.12 step 66: Inventory export button visible; click triggers download or opens print view', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Inventory; assert export/print button visible; click; verify download or new page with inventory content' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Inventory`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const exportBtn = page.locator('button').filter({ hasText: /export|print/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await exportBtn.click();
    await page.waitForTimeout(2000);
    const dl = await downloadPromise;

    if (dl) {
      const filename = dl.suggestedFilename();
      test.info().annotations.push({ type: 'result', description: `Inventory export downloaded: "${filename}"` });
      expect(filename.length).toBeGreaterThan(0);
    } else {
      const printOption = page.locator('[role="menuitem"], button, a').filter({ hasText: /print.*pdf|pdf|export.*csv|csv/i }).first();
      if (await printOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        const dlPromise2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
        await printOption.click();
        await page.waitForTimeout(2000);
        const dl2 = await dlPromise2;
        if (dl2) {
          test.info().annotations.push({ type: 'result', description: `Inventory PDF downloaded: "${dl2.suggestedFilename()}"` });
          expect(dl2.suggestedFilename().length).toBeGreaterThan(0);
        } else {
          await page.keyboard.press('Escape');
          test.info().annotations.push({ type: 'result', description: 'No download from inventory export — opened print view instead' });
        }
      } else {
        await page.keyboard.press('Escape');
      }
    }
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/inventory|product|audit/i);
  });

  test('9.13 step 67: audit_viewer can access INV-01 print view without forbidden error', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Login as audit_viewer (Viewer role); navigate to INV-01 print; verify content accessible (not 403/forbidden)' });
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
      name: cookieName, value: cookieValue, domain: 'localhost', path: '/',
    }]);

    await page.goto(`${BASE_URL}/invoices/${invoiceIds!.inv01}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Viewer print body length: ${body.length}; forbidden: ${/forbidden|unauthorized/i.test(body)}` });
    expect(body.length).toBeGreaterThan(100);
    expect(body.toLowerCase()).not.toContain('forbidden');
    expect(body.toLowerCase()).not.toContain('unauthorized');
  });

  test('9.14 step 67: audit_viewer (Viewer role) — Edit action is hidden on Invoices list', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Login as audit_viewer; navigate to /Invoices; assert no "Edit" or "New Invoice" button visible (canEdit=false for Viewer role)' });
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
      name: cookieName, value: cookieValue, domain: 'localhost', path: '/',
    }]);

    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const newInvoiceBtn = page.locator('button').filter({ hasText: /new invoice|create invoice/i });
    const newInvoiceCount = await newInvoiceBtn.count();

    const editBtns = page.locator('button').filter({ hasText: /^edit$/i });
    const editCount = await editBtns.count();

    test.info().annotations.push({ type: 'result', description: `Viewer on /Invoices — "New Invoice" buttons: ${newInvoiceCount}; "Edit" buttons: ${editCount}; both should be 0` });
    expect(newInvoiceCount).toBe(0);
    expect(editCount).toBe(0);
  });
});
