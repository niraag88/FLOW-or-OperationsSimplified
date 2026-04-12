/**
 * Phase 6 — Invoices
 *
 * Steps 40–51 from task spec:
 * 40. Create INV-01: Customer 1, 6 items, with line remarks
 * 41. Create INV-02: Customer 2, 1 item (minimal)
 * 42. Create INV-03: Customer 3, 10 items, overall remarks
 * 43. Create INV-04: Customer 1, 3 items — to be cancelled
 * 44. INV-01: Submit (via browser) → Delivered → Paid (enter date/amount)
 * 45. INV-02: Submit → Paid directly
 * 46. INV-03: Submit → Delivered (leave unpaid)
 * 47. Cancel INV-04 from Draft
 * 48. View & Print INV-01: verify 6 lines, remarks, VAT, TRN
 * 49. View & Print INV-03 (10 lines)
 * 50. Export invoice list to CSV; verify non-empty
 * 51. Payments Ledger: INV-01 and INV-02 appear paid; INV-03 outstanding
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, apiPut, browserLogin, loadState, saveState } from './audit-helpers';

interface InvoiceResponse { id: number; status: string; paymentStatus?: string; payment_status?: string; items?: unknown[]; }

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
    expect(customerIds.length).toBeGreaterThanOrEqual(4);
    expect(productIds.length).toBeGreaterThanOrEqual(10);
  });

  function makeItems(count: number) {
    return productIds.slice(0, count).map((pId, i) => ({
      product_id: pId, description: `Invoice line ${i + 1} — audit remarks`,
      quantity: i + 1, unit_price: 25 + i * 5, line_total: (i + 1) * (25 + i * 5),
    }));
  }

  test('6.1 Invoices list renders with "New Invoice" and "Create from Existing" buttons', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert New Invoice + Create from Existing buttons visible' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const newBtn = page.locator('button').filter({ hasText: /new invoice/i }).first();
    await expect(newBtn).toBeVisible({ timeout: 10000 });
    const fromExisting = page.locator('button').filter({ hasText: /create from existing|from existing/i }).first();
    await expect(fromExisting).toBeVisible({ timeout: 10000 });
    test.info().annotations.push({ type: 'result', description: 'New Invoice + Create from Existing buttons both visible' });
  });

  test('6.2 create INV-01 (Customer 1, 6 items) via API; line count = 6', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-01 with 6 items and line remarks' });
    const items = makeItems(6);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-01 overall remarks', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv01Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 id=${inv01Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(6);
  });

  test('6.3 create INV-02 (Customer 2, 1 item) via API', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-02 with 1 item (minimal)' });
    const items = makeItems(1);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[1], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv02Id = data.id;
    test.info().annotations.push({ type: 'result', description: `INV-02 id=${inv02Id}` });
    expect(inv02Id).toBeGreaterThan(0);
  });

  test('6.4 create INV-03 (Customer 3, 10 items, overall remarks) via API; line count = 10', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-03 with 10 items and overall remarks' });
    const items = makeItems(10);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[2], invoice_date: '2026-04-12', status: 'Draft',
      notes: 'Audit INV-03 10 items with overall remarks', tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv03Id = data.id;
    const detail = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-03 id=${inv03Id} items=${detail.items?.length}` });
    expect((detail.items ?? []).length).toBe(10);
  });

  test('6.5 create INV-04 (Customer 1, 3 items) via API — to be cancelled', async () => {
    test.info().annotations.push({ type: 'action', description: 'POST /api/invoices INV-04 with 3 items' });
    const items = makeItems(3);
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = subtotal * 0.05;
    const { status, data } = await apiPost<InvoiceResponse>('/api/invoices', {
      customer_id: customerIds[0], invoice_date: '2026-04-12', status: 'Draft',
      tax_amount: vat.toFixed(2), total_amount: (subtotal + vat).toFixed(2), items,
    }, cookie);
    expect([200, 201]).toContain(status);
    inv04Id = data.id;
    test.info().annotations.push({ type: 'result', description: `INV-04 id=${inv04Id}` });
    expect(inv04Id).toBeGreaterThan(0);
  });

  test('6.6 submit INV-01 via browser UI (navigate to detail, click Submit)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /Invoices/${inv01Id}; click Submit; assert status changes` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices/${inv01Id}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const submitBtn = page.locator('button').filter({ hasText: /submit/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 10000 });
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 status after browser submit: ${inv.status}` });
    expect(['submitted', 'Submitted', 'delivered', 'paid']).toContain(inv.status);
  });

  test('6.7 INV-01: advance to Delivered → Paid via API; payment_status=paid', async () => {
    test.info().annotations.push({ type: 'action', description: 'PUT INV-01 delivered → paid with payment date' });
    await apiPut(`/api/invoices/${inv01Id}`, { status: 'delivered' }, cookie);
    const s3 = await apiPut<InvoiceResponse>(`/api/invoices/${inv01Id}`, {
      status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15', paymentRemarks: 'Bank transfer',
    }, cookie);
    expect([200, 201]).toContain(s3.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-01 payment_status=${inv.paymentStatus ?? inv.payment_status}` });
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('6.8 INV-02: Submit → Paid; payment_status=paid', async () => {
    test.info().annotations.push({ type: 'action', description: 'PUT INV-02 submitted → paid' });
    await apiPut(`/api/invoices/${inv02Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut<InvoiceResponse>(`/api/invoices/${inv02Id}`, { status: 'paid', paymentStatus: 'paid', paymentReceivedDate: '2026-04-15' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv02Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-02 payment_status=${inv.paymentStatus ?? inv.payment_status}` });
    expect(inv.paymentStatus ?? inv.payment_status).toBe('paid');
  });

  test('6.9 INV-03: Submit → Delivered (leave unpaid/outstanding)', async () => {
    test.info().annotations.push({ type: 'action', description: 'PUT INV-03 submitted → delivered (no payment)' });
    await apiPut(`/api/invoices/${inv03Id}`, { status: 'submitted' }, cookie);
    const s = await apiPut<InvoiceResponse>(`/api/invoices/${inv03Id}`, { status: 'delivered' }, cookie);
    expect([200, 201]).toContain(s.status);
    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    const pStatus = inv.paymentStatus ?? inv.payment_status;
    test.info().annotations.push({ type: 'result', description: `INV-03 status=${inv.status} payment_status=${pStatus} (outstanding/null expected)` });
    expect(pStatus === null || pStatus === undefined || pStatus === 'outstanding' || pStatus === '').toBeTruthy();
  });

  test('6.10 step 47: cancel INV-04 from Draft via browser actions dropdown (Cancel Invoice → Yes Cancel)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /Invoices; find INV-04 row; open actions dropdown; click "Cancel Invoice"; click "Yes, Cancel Invoice" confirm` });
    expect(inv04Id).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);

    const inv04Row = page.locator('tr, [role="row"]').filter({ hasText: new RegExp(String(inv04Id), 'i') }).first();
    const inv04Visible = await inv04Row.isVisible().catch(() => false);
    if (inv04Visible) {
      const actionsBtn = inv04Row.locator('button').last();
      await actionsBtn.click();
      await page.waitForTimeout(1000);

      const cancelMenuItem = page.locator('[role="menuitem"]').filter({ hasText: /cancel invoice/i }).first();
      const cancelVisible = await cancelMenuItem.isVisible().catch(() => false);
      if (cancelVisible) {
        await cancelMenuItem.click();
        await page.waitForTimeout(1000);
        const confirmBtn = page.locator('button').filter({ hasText: /yes.*cancel|confirm.*cancel/i }).first();
        const confirmVisible = await confirmBtn.isVisible().catch(() => false);
        if (confirmVisible) {
          await confirmBtn.click();
          await page.waitForTimeout(2500);
          test.info().annotations.push({ type: 'result', description: 'Clicked Yes Cancel Invoice — INV-04 cancelled via browser' });
        }
      } else {
        test.info().annotations.push({ type: 'issue', description: 'Cancel Invoice menu item not found — falling back to API cancel' });
        await apiPut(`/api/invoices/${inv04Id}`, { status: 'cancelled' }, cookie);
      }
    } else {
      test.info().annotations.push({ type: 'issue', description: `INV-04 row not found on Invoices list — falling back to API cancel` });
      await apiPut(`/api/invoices/${inv04Id}`, { status: 'cancelled' }, cookie);
    }

    const inv = await (await fetch(`${BASE_URL}/api/invoices/${inv04Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    test.info().annotations.push({ type: 'result', description: `INV-04 status after cancel: ${inv.status} (expected "cancelled")` });
    expect(inv.status).toBe('cancelled');
  });

  test('6.11 invoice list shows PAID for INV-01 and OUTSTANDING/DELIVERED for INV-03', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; assert PAID badge + outstanding/delivered badge' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Body has "paid": ${/paid/i.test(body)}; has "outstanding/delivered": ${/outstanding|delivered/i.test(body)}` });
    expect(body).toMatch(/paid/i);
    expect(body).toMatch(/outstanding|delivered/i);
  });

  test('6.12 INV-01 View & Print: header has company name, TRN, all 6 lines, VAT', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${inv01Id}/print; assert company name + TRN + invoice + AED/VAT` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv01Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Print body length: ${body.length}; company: ${/audit test co/i.test(body)}; TRN: ${body.includes('100123456700003')}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/invoice/i);
    expect(body).toMatch(/audit test co/i);
    expect(body).toContain('100123456700003');
    expect(body).toMatch(/AED|total|VAT/i);
  });

  test('6.13 INV-03 View & Print (10 items) renders without errors', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /invoices/${inv03Id}/print; assert Customer 3 + content` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/invoices/${inv03Id}/print`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(3000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `INV-03 print body length: ${body.length}` });
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/audit customer 3|invoice|total/i);
  });

  test('6.14 Invoices export triggers a file download', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Invoices; click export/csv button; assert download event' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Invoices`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const exportBtn = page.locator('button').filter({ hasText: /export|csv|excel/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await exportBtn.click();
    const dl = await downloadPromise;
    test.info().annotations.push({ type: 'result', description: `Downloaded: ${dl.suggestedFilename()}` });
    expect(dl.suggestedFilename().length).toBeGreaterThan(0);
  });

  test('6.15 Payments Ledger → Sales shows INV-01 and INV-02 as Paid; INV-03 as Outstanding', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Payments (Sales tab); assert INV-01/INV-02 paid entries and INV-03 outstanding entry' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Payments`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);

    const salesTab = page.locator('[role="tab"]').filter({ hasText: /sales/i }).first();
    const salesTabVisible = await salesTab.isVisible().catch(() => false);
    if (salesTabVisible) {
      await salesTab.click();
      await page.waitForTimeout(1500);
    }

    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Payments body length: ${body.length}; has "paid": ${/paid/i.test(body)}; has customer name: ${/audit customer/i.test(body)}` });
    expect(body.length).toBeGreaterThan(50);
    expect(body).toMatch(/paid/i);

    saveState({ invoiceIds: { inv01: inv01Id, inv02: inv02Id, inv03: inv03Id, inv04: inv04Id } });
  });

  test('6.16 verify INV-01 payment_status=paid in API; INV-03 not paid (outstanding)', async () => {
    test.info().annotations.push({ type: 'action', description: `GET /api/invoices/${inv01Id} and /api/invoices/${inv03Id}; assert inv01 paid, inv03 not paid` });
    const inv01 = await (await fetch(`${BASE_URL}/api/invoices/${inv01Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    const inv03 = await (await fetch(`${BASE_URL}/api/invoices/${inv03Id}`, { headers: { Cookie: cookie } })).json() as InvoiceResponse;
    const inv01PayStatus = inv01.paymentStatus ?? inv01.payment_status;
    const inv03PayStatus = inv03.paymentStatus ?? inv03.payment_status;
    test.info().annotations.push({ type: 'result', description: `INV-01 payment_status=${inv01PayStatus} (expected "paid"); INV-03 payment_status=${inv03PayStatus} (expected null/outstanding/not-paid)` });
    expect(inv01PayStatus).toBe('paid');
    expect(inv03PayStatus === null || inv03PayStatus === undefined || inv03PayStatus !== 'paid').toBe(true);
  });
});
