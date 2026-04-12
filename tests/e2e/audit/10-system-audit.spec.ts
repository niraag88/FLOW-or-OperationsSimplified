/**
 * Phase 10 — Audit Log & Recycle Bin
 *
 * Tests:
 * - Audit log API has FACTORY_RESET entry and diverse actions
 * - Settings page renders in browser
 * - Recycle bin: soft-delete a PO, confirm in bin API, confirm removal after perm delete
 */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiLogin, apiPost, browserLogin, loadState, saveState } from './audit-helpers';

interface AuditLogEntry { action: string; }
interface PurchaseOrderResponse { id: number; poNumber?: string; }
interface RecycleBinEntry { id: number; document_id: string; }

test.describe('Phase 10 — Audit Log & Recycle Bin', () => {
  test.setTimeout(120000);

  let cookie: string;
  let recycleBinId: number;

  test.beforeAll(async () => {
    cookie = await apiLogin();
  });

  test('audit log API returns array with FACTORY_RESET entry', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert contains FACTORY_RESET action' });
    const logs = await (await fetch(`${BASE_URL}/api/audit-logs`, { headers: { Cookie: cookie } })).json() as AuditLogEntry[];
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
    const hasReset = logs.some((l) => l.action === 'FACTORY_RESET');
    test.info().annotations.push({ type: 'result', description: `Total audit entries: ${logs.length}; FACTORY_RESET found: ${hasReset}` });
    expect(hasReset).toBe(true);
  });

  test('audit log has more than one distinct action type', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/audit-logs; assert > 1 distinct action' });
    const logs = await (await fetch(`${BASE_URL}/api/audit-logs`, { headers: { Cookie: cookie } })).json() as AuditLogEntry[];
    const uniqueActions = new Set(logs.map((l) => l.action));
    test.info().annotations.push({ type: 'result', description: `Distinct actions: ${Array.from(uniqueActions).join(', ')}` });
    expect(uniqueActions.size).toBeGreaterThan(1);
  });

  test('Settings page renders in browser with expected content', async ({ page }) => {
    test.info().annotations.push({ type: 'action', description: 'Navigate to /Settings in browser; assert settings/company text' });
    await browserLogin(page);
    await page.goto(`${BASE_URL}/Settings`);
    await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const body = await page.locator('body').innerText();
    test.info().annotations.push({ type: 'result', description: `Settings page body length: ${body.length}; has settings/company: ${/settings|company|audit/i.test(body)}` });
    expect(body).toMatch(/settings|company|audit/i);
  });

  test('soft-delete a draft PO to recycle bin; entry appears in bin API', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create draft PO; POST to /api/recycle-bin; assert entry in bin' });
    const state = loadState();
    const alphaBrandId = state.brandIds?.alpha ?? 0;
    const productIds = state.productIds ?? [];
    expect(alphaBrandId).toBeGreaterThan(0);
    expect(productIds.length).toBeGreaterThan(0);

    const items = [{ productId: productIds[0], description: 'Recycle test item', quantity: 1, unitPrice: 100, lineTotal: 100 }];
    const { status: cs, data: poData } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: alphaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO to be recycled', currency: 'AED', fxRateToAed: '1',
      totalAmount: '100.00', vatAmount: '0', grandTotal: '100.00', items,
    }, cookie);
    expect([200, 201]).toContain(cs);
    const newPoId = poData.id;
    const poNumber = poData.poNumber ?? String(newPoId);
    expect(newPoId).toBeGreaterThan(0);

    const { status: rbStatus } = await apiPost('/api/recycle-bin', {
      document_type: 'PurchaseOrder',
      document_id: String(newPoId),
      document_number: poNumber,
      document_data: JSON.stringify({ header: poData, items: [] }),
      reason: 'Audit E2E recycle bin test',
      original_status: 'draft',
      can_restore: true,
    }, cookie);
    expect([200, 201]).toContain(rbStatus);

    const binItems = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    expect(Array.isArray(binItems)).toBe(true);
    const found = binItems.find((b) => b.document_id === String(newPoId));
    test.info().annotations.push({ type: 'result', description: `Recycle bin entry found: ${!!found}; binId=${found?.id}` });
    expect(found).toBeTruthy();
    recycleBinId = found!.id;
    saveState({ recycleBinPoId: recycleBinId });
  });

  test('recycle bin API lists the soft-deleted PO entry', async () => {
    test.info().annotations.push({ type: 'action', description: 'GET /api/recycle-bin; assert entry with recycleBinId present' });
    expect(recycleBinId).toBeGreaterThan(0);
    const binItems = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const found = binItems.find((b) => b.id === recycleBinId);
    test.info().annotations.push({ type: 'result', description: `Bin entry found: ${!!found}` });
    expect(found).toBeTruthy();
  });

  test('permanently delete a separate PO from recycle bin; confirm removed from bin API', async () => {
    test.info().annotations.push({ type: 'action', description: 'Create PO → recycle bin → DELETE bin entry → confirm gone' });
    const state = loadState();
    const betaBrandId = state.brandIds?.beta ?? 0;
    const productIds = state.productIds ?? [];
    expect(betaBrandId).toBeGreaterThan(0);

    const items = [{ productId: productIds[0], description: 'Perm delete item', quantity: 1, unitPrice: 50, lineTotal: 50 }];
    const { status: cs2, data: po2Data } = await apiPost<PurchaseOrderResponse>('/api/purchase-orders', {
      brandId: betaBrandId, orderDate: '2026-04-20', expectedDelivery: '2026-05-20', status: 'draft',
      notes: 'Audit PO perm delete', currency: 'AED', fxRateToAed: '1',
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
    expect([200, 204]).toContain(delResp.status);

    const binAfter = await (await fetch(`${BASE_URL}/api/recycle-bin`, { headers: { Cookie: cookie } })).json() as RecycleBinEntry[];
    const stillThere = binAfter.find((b) => b.id === binEntry!.id);
    test.info().annotations.push({ type: 'result', description: `Entry still in bin after DELETE: ${!!stillThere}` });
    expect(stillThere).toBeUndefined();
  });
});
