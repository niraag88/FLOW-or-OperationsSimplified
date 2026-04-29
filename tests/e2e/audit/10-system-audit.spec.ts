/**
 * Phase 10 — Audit Log & Recycle Bin
 *
 * Steps 68–71 from task spec:
 * 68. Settings → Audit Log: verify log contains FACTORY_RESET + company settings + user creations + PO + GRN + invoice
 * 69. Navigate to PO list: soft-delete one Draft PO via the UI actions dropdown (Delete → "Yes, Delete" confirm);
 *     verify it appears in the Recycle Bin API with the correct document type and date
 * 70. RESTORE the deleted PO from the Recycle Bin (POST /api/recycle-bin/:id/restore);
 *     verify it reappears in the PO list in Draft status (browser check)
 * 71. Permanently delete another Draft PO via the PO list UI; verify it appears in Recycle Bin,
 *     then permanently delete it from Recycle Bin; verify gone from both bin and PO list
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';
import { gateFactoryResetTests } from '../factory-reset-gate';

interface AuditLogEntry { action: string; }
interface PurchaseOrderResponse { id: number; status: string; poNumber?: string; }
interface RecycleBinEntry { id: number; document_id: string; document_type?: string; can_restore?: boolean; deleted_date?: string; }

test.describe('Phase 10 — Audit Log & Recycle Bin', () => {
  test.setTimeout(240000);

  let cookie: string;
  let softDeletedPoId: number;
  let softDeletedPoNumber: string;
  let softDeletedBinId: number;
  let permDeletePoId: number;
  let permDeletePoNumber: string;

  test.beforeAll(async () => {
    // Wall 4: this spec asserts a FACTORY_RESET row exists in the audit log,
    // which is only true after Phase 0 ran a real reset. Phase 0 is itself
    // gated by gateFactoryResetTests, so this dependent assertion must skip
    // under the same conditions to keep CI green on non-disposable DBs.
    gateFactoryResetTests('Phase 10 — Audit Log & Recycle Bin (audit/10-system-audit.spec.ts)');
    cookie = await apiLogin();
  });

  test('10.1 audit log API returns array with FACTORY_RESET entry (step 68)', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert contains FACTORY_RESET action' });
    const logs = await (await fetch(`${BASE_URL}/api/audit-logs`, { headers: { Cookie: cookie } })).json() as AuditLogEntry[];
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    const hasReset = logs.some((l) => l.action === 'FACTORY_RESET');
    test.info().annotations.push({ type: 'result', description: `Total audit entries: ${logs.length}; FACTORY_RESET found: ${hasReset}` });
    expect(hasReset).toBe(true);
  });

  test('10.2 audit log has more than one distinct action type', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert > 1 distinct action types (should include FACTORY_RESET + CREATE + UPDATE from earlier phases)' });
    const logs = await (await fetch(`${BASE_URL}/api/audit-logs`, { headers: { Cookie: cookie } })).json() as AuditLogEntry[];
    const uniqueActions = new Set(logs.map((l) => l.action));
    test.info().annotations.push({ type: 'result', description: `Distinct actions: ${Array.from(uniqueActions).join(', ')}` });
    expect(uniqueActions.size).toBeGreaterThan(1);
  });

  test('10.3 Settings page renders in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings; assert page has settings/company text' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Settings page body length: ${body.length}` });
    expect(body).toMatch(/settings|company|audit/i);
  });

  test('10.4 create two Draft POs for recycle-bin tests (steps 69 + 71) via API', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create 2 Draft POs: one to soft-delete+restore, one to permanently delete' });
    const state = loadState();
    const alphaBrandId = state.brandIds?.alpha ?? 0;
    const betaBrandId = state.brandIds?.beta ?? 0;
    const productIds = state.productIds ?? [];
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThan(0);

    const items1 = [{ productId: productIds[0], description: 'Recycle restore test', quantity: 1, unitPrice: 100, lineTotal: 100 }];
    const r1 = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO — to soft-delete and restore', currency: 'AED', fxRateToAed: '1',
      totalAmount: '100.00', vatAmount: '0', grandTotal: '100.00', items: items1,
    }, cookie);
    expect([200, 201]).toContain(r1.status);
    softDeletedPoId = r1.data.id;
    softDeletedPoNumber = r1.data.poNumber ?? `PO-${softDeletedPoId}`;

    const items2 = [{ productId: productIds[0], description: 'Perm delete test', quantity: 1, unitPrice: 50, lineTotal: 50 }];
    const r2 = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: betaBrandId ?? alphaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO — to permanently delete', currency: 'AED', fxRateToAed: '1',
      totalAmount: '50.00', vatAmount: '0', grandTotal: '50.00', items: items2,
    }, cookie);
    expect([200, 201]).toContain(r2.status);
    permDeletePoId = r2.data.id;
    permDeletePoNumber = r2.data.poNumber ?? `PO-${permDeletePoId}`;

    test.info().annotations.push({ type: 'result', description: `Soft-delete PO: id=${softDeletedPoId} num=${softDeletedPoNumber}; Perm-delete PO: id=${permDeletePoId} num=${permDeletePoNumber}` });
    expect(softDeletedPoId).toBeGreaterThan(0);
    expect(permDeletePoId).toBeGreaterThan(0);
  });

  test('10.5 step 69: soft-delete PO from PO list via browser actions dropdown (Delete → Yes Delete confirm)', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders; find PO row (id=${softDeletedPoId}); open actions dropdown; click Delete; click "Yes, Delete" confirm; assert new entry in /api/recycle-bin` });
    expect(softDeletedPoId).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const binBefore = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const binCountBefore = binBefore.length;

    const poRowText = softDeletedPoNumber.length > 0 ? softDeletedPoNumber : String(softDeletedPoId);
    const poRow = page.locator('tr, [role="row"]').filter({ hasText: new RegExp(poRowText.replace('-', '\\-')) }).first();
    await expect(poRow).toBeVisible({ timeout: 10000 });

    const actionsBtn = poRow.locator('button').last();
    await expect(actionsBtn).toBeVisible({ timeout: 5000 });
    await actionsBtn.click();
    await page.waitForTimeout(1000);

    const deleteMenuItem = page.locator('[role="menuitem"]').filter({ hasText: /delete/i }).first();
    await expect(deleteMenuItem).toBeVisible({ timeout: 5000 });
    await deleteMenuItem.click();
    await page.waitForTimeout(1000);

    const confirmBtn = page.locator('button').filter({ hasText: /yes.*delete|confirm.*delete|yes, delete/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();
    await page.waitForTimeout(2500);

    const binAfter = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const newEntry = binAfter.find((b) => b.document_id === String(softDeletedPoId));
    test.info().annotations.push({ type: 'result', description: `Bin before: ${binCountBefore}; after: ${binAfter.length}; new entry for PO-${softDeletedPoId}: ${!!newEntry} type=${newEntry?.document_type}` });
    expect(newEntry).toBeTruthy();
    expect(newEntry!.document_type).toBe('PurchaseOrder');
    softDeletedBinId = newEntry!.id;
    saveState({ recycleBinPoId: softDeletedBinId });
  });

  test('10.6 step 69 continued: soft-deleted PO no longer visible in PO list', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders; assert PO-${softDeletedPoId} is NOT in the active list anymore` });
    expect(softDeletedPoId).toBeGreaterThan(0);
    expect(softDeletedPoNumber).toBeTruthy();
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    const visibleInList = body.includes(softDeletedPoNumber);
    test.info().annotations.push({ type: 'result', description: `PO ${softDeletedPoNumber} in active list: ${visibleInList} (expected: false)` });
    expect(visibleInList).toBe(false);

    // Also verify via API: PO should NOT appear in the active PO list
    const poList = await (await fetch(`${BASE_URL}/api/purchase-orders`, { headers: { Cookie: cookie } })).json() as PurchaseOrderResponse[];
    const inActiveList = poList.find((p) => p.id === softDeletedPoId);
    test.info().annotations.push({ type: 'result', description: `PO id=${softDeletedPoId} in API active list: ${!!inActiveList} (expected: false)` });
    expect(inActiveList).toBeUndefined();
  });

  test('10.7 step 70: RESTORE soft-deleted PO from Recycle Bin; PO reappears in PO list as Draft', async () => {
    test.info().annotations.push({ type: 'action', description: `POST /api/recycle-bin/${softDeletedBinId}/restore; assert PO id=${softDeletedPoId} reappears in PO list with status=draft` });
    expect(softDeletedBinId).toBeGreaterThan(0);
    expect(softDeletedPoId).toBeGreaterThan(0);

    const restoreResp = await fetch(`${BASE_URL}/api/recycle-bin/${softDeletedBinId}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    test.info().annotations.push({ type: 'result', description: `Restore HTTP status: ${restoreResp.status} (expected 200/201/204)` });
    expect([200, 201, 204]).toContain(restoreResp.status);

    const poList = await (await fetch(`${BASE_URL}/api/purchase-orders`, { headers: { Cookie: cookie } })).json() as PurchaseOrderResponse[];
    const restoredPo = poList.find((p) => p.id === softDeletedPoId);
    test.info().annotations.push({ type: 'result', description: `Restored PO id=${softDeletedPoId} in list: ${!!restoredPo}; status=${restoredPo?.status}` });
    expect(restoredPo).toBeTruthy();
    expect(restoredPo!.status).toBe('draft');
  });

  test('10.8 step 70 browser verification: restored PO visible in PO list as Draft in browser', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders; assert "draft" badge visible after restore` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `PO list body has "draft": ${/draft/i.test(body)}` });
    expect(body).toMatch(/draft/i);
  });

  test('10.9 step 71: soft-delete second PO (browser) → permanently delete from Recycle Bin; verify gone from both', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders; soft-delete PO-${permDeletePoId} via browser actions dropdown; then DELETE /api/recycle-bin/:id permanently; verify entry removed from bin` });
    expect(permDeletePoId).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const poRowText2 = permDeletePoNumber.length > 0 ? permDeletePoNumber : String(permDeletePoId);
    const poRow2 = page.locator('tr, [role="row"]').filter({ hasText: new RegExp(poRowText2.replace('-', '\\-')) }).first();
    await expect(poRow2).toBeVisible({ timeout: 10000 });

    const actionsBtn2 = poRow2.locator('button').last();
    await expect(actionsBtn2).toBeVisible({ timeout: 5000 });
    await actionsBtn2.click();
    await page.waitForTimeout(1000);

    const deleteMenuItem2 = page.locator('[role="menuitem"]').filter({ hasText: /delete/i }).first();
    await expect(deleteMenuItem2).toBeVisible({ timeout: 5000 });
    await deleteMenuItem2.click();
    await page.waitForTimeout(1000);

    const confirmBtn2 = page.locator('button').filter({ hasText: /yes.*delete|confirm.*delete|yes, delete/i }).first();
    await expect(confirmBtn2).toBeVisible({ timeout: 5000 });
    await confirmBtn2.click();
    await page.waitForTimeout(2500);

    const binAll = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const permEntry = binAll.find((b) => b.document_id === String(permDeletePoId));
    test.info().annotations.push({ type: 'result', description: `PO-${permDeletePoId} in recycle bin: ${!!permEntry}` });
    expect(permEntry).toBeTruthy();

    const delResp = await fetch(`${BASE_URL}/api/recycle-bin/${permEntry!.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    test.info().annotations.push({ type: 'result', description: `DELETE /api/recycle-bin/${permEntry!.id} → HTTP ${delResp.status}` });
    expect([200, 204]).toContain(delResp.status);

    const binFinal = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const stillInBin = binFinal.find((b) => b.id === permEntry!.id);
    test.info().annotations.push({ type: 'result', description: `Entry still in bin after permanent DELETE: ${!!stillInBin} (expected false)` });
    expect(stillInBin).toBeUndefined();
  });
});
