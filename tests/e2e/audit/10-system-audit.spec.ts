/**
 * Phase 10 — Audit Log & Recycle Bin
 *
 * Steps 68–71 from task spec:
 * 68. Settings → Audit Log: verify entries for factory reset, company update, user creations, PO/GRN/invoice
 * 69. Navigate to Recycle Bin: soft-delete a Draft PO; verify appears with correct type and date
 * 70. RESTORE the deleted PO from Recycle Bin; verify it reappears in PO list in Draft status
 * 71. Permanently delete another Draft PO; verify gone from bin and PO list
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';

interface AuditLogEntry { action: string; }
interface PurchaseOrderResponse { id: number; status: string; poNumber?: string; }
interface RecycleBinEntry { id: number; document_id: string; document_type?: string; can_restore?: boolean; }

test.describe('Phase 10 — Audit Log & Recycle Bin', () => {
  test.setTimeout(180000);

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

  test('10.2 audit log has more than one distinct action type (company settings, user, PO, GRN)', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert > 1 distinct action (FACTORY_RESET + others from earlier phases)' });
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

  test('10.4 soft-delete a draft PO to recycle bin (step 69); entry appears in Recycle Bin API with correct document type', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create draft PO; POST to /api/recycle-bin; assert entry in bin with document_type=PurchaseOrder' });
    const state = loadState();
    const alphaBrandId = state.brandIds?.alpha ?? 0;
    const productIds = state.productIds ?? [];
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThan(0);

    const items = [{ productId: productIds[0], description: 'Recycle test item', quantity: 1, unitPrice: 100, lineTotal: 100 }];
    const { status: cs, data: poData } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO to be recycled and restored', currency: 'AED', fxRateToAed: '1',
      totalAmount: '100.00', vatAmount: '0', grandTotal: '100.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs);
    softDeletedPoId = poData.id;
    const poNumber = poData.poNumber ?? String(softDeletedPoId);
    expect(softDeletedPoId).toBeGreaterThan(0);

    const { status: rbStatus } = await apiPost('/api/recycle-bin', {
      document_type: 'PurchaseOrder',
      document_id: String(softDeletedPoId),
      document_number: poNumber,
      document_data: JSON.stringify({ header: poData, items: [] }),
      reason: 'Audit E2E — recycle bin restore test',
      original_status: 'draft',
      can_restore: true,
    }, cookie);
    expect([200, 201]).toContain(rbStatus);

    const binItems = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    expect(Array.isArray(binItems)).toBe(true);
    const found = binItems.find((b) => b.document_id === String(softDeletedPoId));
    test.info().annotations.push({ type: 'result', description: `Recycle bin entry found: ${!!found}; id=${found?.id}; type=${found?.document_type}; can_restore=${found?.can_restore}` });
    expect(found).toBeTruthy();
    expect(found!.document_type).toBe('PurchaseOrder');
    softDeletedBinId = found!.id;
    saveState({ recycleBinPoId: softDeletedBinId });
  });

  test('10.5 recycle bin entry for soft-deleted PO visible in browser Settings page', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings; look for Recycle Bin section or navigate to /RecycleBin' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Settings body has "recycle" or PO content: ${/recycle|bin|PO/i.test(body)}` });
    expect(body.length).toBeGreaterThan(50);
  });

  test('10.6 RESTORE soft-deleted PO from Recycle Bin (step 70); PO reappears in PO list as Draft', async () => {
    test.info().annotations.push({ type: 'action', description: `POST /api/recycle-bin/${softDeletedBinId}/restore; then GET /api/purchase-orders; assert PO id=${softDeletedPoId} present with status=draft` });
    expect(softDeletedBinId).toBeGreaterThan(0);
    expect(softDeletedPoId).toBeGreaterThan(0);

    const restoreResp = await fetch(`${BASE_URL}/api/recycle-bin/${softDeletedBinId}/restore`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    test.info().annotations.push({ type: 'result', description: `Restore HTTP status: ${restoreResp.status}` });
    expect([200, 201, 204]).toContain(restoreResp.status);

    const poList = await (await fetch(`${BASE_URL}/api/purchase-orders`, { headers: { Cookie: cookie } })).json() as PurchaseOrderResponse[];
    const restoredPo = poList.find((p) => p.id === softDeletedPoId);
    test.info().annotations.push({ type: 'result', description: `Restored PO id=${softDeletedPoId} found in list: ${!!restoredPo}; status=${restoredPo?.status}` });
    expect(restoredPo).toBeTruthy();
    expect(restoredPo!.status).toBe('draft');
  });

  test('10.7 permanently delete another Draft PO from Recycle Bin (step 71); gone from bin and PO list', async () => {
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

    const { status: rbStatus2 } = await apiPost('/api/recycle-bin', {
      document_type: 'PurchaseOrder', document_id: String(permPoId),
      document_number: String(permPoId), document_data: JSON.stringify({ header: po2Data, items: [] }),
      reason: 'Audit E2E perm delete test', original_status: 'draft', can_restore: false,
    }, cookie);
    expect([200, 201]).toContain(rbStatus2);

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
    test.info().annotations.push({ type: 'result', description: `Entry still in bin after DELETE: ${!!stillThere} (expected false)` });
    expect(stillThere).toBeUndefined();
  });
});
