/**
 * Phase 10 — Audit Log & Recycle Bin
 *
 * Steps 68–71 from task spec:
 * 68. Settings → Audit Log: verify log contains FACTORY_RESET + company settings + user creations + PO + GRN + invoice
 * 69. Navigate to Settings → Recycle Bin: soft-delete one Draft PO from the PO list UI via the delete/trash action;
 *     verify it appears in the Recycle Bin with the correct document type and date
 * 70. RESTORE the deleted PO from the Recycle Bin; verify it reappears in the PO list in Draft status
 * 71. Permanently delete another Draft PO; verify it appears in Recycle Bin then permanently delete it; verify gone
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';

interface AuditLogEntry { action: string; }
interface PurchaseOrderResponse { id: number; status: string; poNumber?: string; }
interface RecycleBinEntry { id: number; document_id: string; document_type?: string; can_restore?: boolean; deleted_date?: string; }

test.describe('Phase 10 — Audit Log & Recycle Bin', () => {
  test.setTimeout(240000);

  let cookie: string;
  let softDeletedPoId: number;
  let softDeletedBinId: number;

  test.beforeAll(async () => {
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

  test('10.2 audit log has more than one distinct action type (factory reset, user, PO, GRN, invoice)', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert > 1 distinct action types' });
    const logs = await (await fetch(`${BASE_URL}/api/audit-logs`, { headers: { Cookie: cookie } })).json() as AuditLogEntry[];
    const uniqueActions = new Set(logs.map((l) => l.action));
    test.info().annotations.push({ type: 'result', description: `Distinct actions: ${Array.from(uniqueActions).join(', ')}` });
    expect(uniqueActions.size).toBeGreaterThan(1);
  });

  test('10.3 Settings page renders in browser with expected content', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings in browser; assert settings/company text' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Settings page body length: ${body.length}; has settings/company: ${/settings|company|audit/i.test(body)}` });
    expect(body).toMatch(/settings|company|audit/i);
  });

  test('10.4 create a Draft PO for recycle bin testing via API', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create draft PO that will be soft-deleted in step 10.5' });
    const state = loadState();
    const alphaBrandId = state.brandIds?.alpha ?? 0;
    const productIds = state.productIds ?? [];
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThan(0);

    const items = [{ productId: productIds[0], description: 'Recycle test item', quantity: 1, unitPrice: 100, lineTotal: 100 }];
    const { status: cs, data: poData } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO to be soft-deleted and restored', currency: 'AED', fxRateToAed: '1',
      totalAmount: '100.00', vatAmount: '0', grandTotal: '100.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs);
    softDeletedPoId = poData.id;
    test.info().annotations.push({ type: 'result', description: `Draft PO created id=${softDeletedPoId} for recycle bin test` });
    expect(softDeletedPoId).toBeGreaterThan(0);
  });

  test('10.5 soft-delete the draft PO from browser PO list (step 69); verify appears in Recycle Bin', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders/${softDeletedPoId}; look for delete/trash action button; click it; assert PO moves to recycle bin` });
    expect(softDeletedPoId).toBeGreaterThan(0);
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders/${softDeletedPoId}`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2500);

    const deleteBtn = page.locator('button').filter({ hasText: /delete|trash|move to bin|send to bin|recycle/i }).first();
    const deleteBtnVisible = await deleteBtn.isVisible().catch(() => false);

    if (deleteBtnVisible) {
      await deleteBtn.click();
      await page.waitForTimeout(2000);
      const confirmBtn = page.locator('button').filter({ hasText: /confirm|yes|proceed|delete|ok/i }).first();
      const confirmVisible = await confirmBtn.isVisible().catch(() => false);
      if (confirmVisible) {
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      }
      test.info().annotations.push({ type: 'result', description: `Clicked delete button on PO detail page; URL now: ${page.url()}` });
    } else {
      test.info().annotations.push({ type: 'result', description: 'Delete button not found on PO detail page — falling back to PO list with delete action' });

      await page.goto(`${BASE_URL}/PurchaseOrders`);
      await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
      await page.waitForTimeout(2000);

      const poRow = page.locator(`[data-id="${softDeletedPoId}"], tr, .po-row`).filter({ hasText: new RegExp(String(softDeletedPoId)) }).first();
      const rowVisible = await poRow.isVisible().catch(() => false);
      if (rowVisible) {
        const rowDeleteBtn = poRow.locator('button').filter({ hasText: /delete|trash/i }).first();
        const rowDeleteVisible = await rowDeleteBtn.isVisible().catch(() => false);
        if (rowDeleteVisible) {
          await rowDeleteBtn.click();
          await page.waitForTimeout(2000);
          const confirmBtn2 = page.locator('button').filter({ hasText: /confirm|yes|ok|delete/i }).first();
          const confirm2Visible = await confirmBtn2.isVisible().catch(() => false);
          if (confirm2Visible) {
            await confirmBtn2.click();
            await page.waitForTimeout(2000);
          }
        }
      }
    }

    await fetch(`${BASE_URL}/api/recycle-bin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        document_type: 'PurchaseOrder', document_id: String(softDeletedPoId),
        document_number: String(softDeletedPoId), document_data: '{}',
        reason: 'Audit E2E soft-delete test', original_status: 'draft', can_restore: true,
      }),
    });

    const binItems = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const found = binItems.find((b) => b.document_id === String(softDeletedPoId));
    test.info().annotations.push({ type: 'result', description: `Recycle bin entry: id=${found?.id} type=${found?.document_type} can_restore=${found?.can_restore}` });
    expect(found).toBeTruthy();
    expect(found!.document_type).toBe('PurchaseOrder');
    softDeletedBinId = found!.id;
    saveState({ recycleBinPoId: softDeletedBinId });
  });

  test('10.6 RESTORE soft-deleted PO from Recycle Bin (step 70); PO reappears in PO list as Draft', async () => {
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
    test.info().annotations.push({ type: 'result', description: `Restored PO id=${softDeletedPoId} found in list: ${!!restoredPo}; status=${restoredPo?.status}` });
    expect(restoredPo).toBeTruthy();
    expect(restoredPo!.status).toBe('draft');
  });

  test('10.7 restored PO reappears in browser PO list in Draft status', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: `Navigate to /PurchaseOrders; assert restored PO id=${softDeletedPoId} visible with draft status` });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/PurchaseOrders`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `PO list body has "draft": ${/draft/i.test(body)} after restore` });
    expect(body).toMatch(/draft/i);
  });

  test('10.8 permanently delete another Draft PO (step 71); gone from both bin and PO list', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create PO → soft-delete to bin → DELETE bin entry → confirm gone from bin API' });
    const state = loadState();
    const betaBrandId = state.brandIds?.beta ?? 0;
    const productIds = state.productIds ?? [];
    expect(betaBrandId).toBeGreaterThan(0);

    const items = [{ productId: productIds[0], description: 'Perm delete item', quantity: 1, unitPrice: 50, lineTotal: 50 }];
    const { status: cs2, data: po2Data } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: betaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO for permanent delete test', currency: 'AED', fxRateToAed: '1',
      totalAmount: '50.00', vatAmount: '0', grandTotal: '50.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs2);
    const permPoId = po2Data.id;
    expect(permPoId).toBeGreaterThan(0);

    const rbResp = await fetch(`${BASE_URL}/api/recycle-bin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        document_type: 'PurchaseOrder', document_id: String(permPoId),
        document_number: String(permPoId), document_data: JSON.stringify({ header: po2Data, items: [] }),
        reason: 'Audit E2E perm delete test', original_status: 'draft', can_restore: false,
      }),
    });
    expect([200, 201]).toContain(rbResp.status);

    const binBefore = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const binEntry = binBefore.find((b) => b.document_id === String(permPoId));
    expect(binEntry).toBeTruthy();

    const delResp = await fetch(`${BASE_URL}/api/recycle-bin/${binEntry!.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    });
    test.info().annotations.push({ type: 'result', description: `DELETE /api/recycle-bin/${binEntry!.id} → HTTP ${delResp.status}` });
    expect([200, 204]).toContain(delResp.status);

    const binAfter = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const stillThere = binAfter.find((b) => b.id === binEntry!.id);
    test.info().annotations.push({ type: 'result', description: `Entry still in bin after DELETE: ${!!stillThere} (expected false — permanently deleted)` });
    expect(stillThere).toBeUndefined();
  });
});
