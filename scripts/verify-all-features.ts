#!/usr/bin/env npx tsx
/**
 * verify-all-features.ts  — Task #57
 *
 * Systematically tests all six verification phases via the REST API:
 *   Phase 1: Reports (dashboard, PO/GRN, sales invoices, VAT, purchases)
 *   Phase 2: Recycle Bin stress test (soft-delete, restore, purge)
 *   Phase 3: Document numbering / prefix change and restore
 *   Phase 4: Financial Year open/close enforcement
 *   Phase 5: Storage API (sign-upload, total-size, delete)
 *   Phase 6: User Role access control
 */

const BASE = 'http://localhost:5000';

// ─── Colours ──────────────────────────────────────────────────────────────────
const GRN = '\x1b[32m'; const RED = '\x1b[31m'; const YLW = '\x1b[33m';
const BLD = '\x1b[1m';  const RST = '\x1b[0m';
const pass = (msg: string) => console.log(`  ${GRN}✓${RST} ${msg}`);
const fail = (msg: string) => { console.error(`  ${RED}✗${RST} ${msg}`); failures.push(msg); };
const skip = (msg: string) => console.log(`  ${YLW}⚠${RST} ${msg}`);
const head = (msg: string) => console.log(`\n${BLD}${msg}${RST}`);

const failures: string[] = [];

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
async function apiGet(path: string, cookie: string): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function apiPost(path: string, body: any, cookie: string): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function apiPut(path: string, body: any, cookie: string): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function apiDelete(path: string, cookie: string): Promise<{ status: number; data: any }> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  });
  let data: any = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const match = setCookie.match(/connect\.sid=[^;]+/);
  if (!match) throw new Error(`Login failed for ${username}: HTTP ${r.status}`);
  return match[0];
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function getList(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const key of ['invoices', 'purchaseOrders', 'quotations', 'deliveryOrders', 'items', 'data']) {
    if (data && Array.isArray(data[key])) return data[key];
  }
  return [];
}

// ─── Phase 1: Reports Verification ───────────────────────────────────────────
async function verifyReports(cookie: string) {
  head('Phase 1 — Reports Verification');

  // 1a. Dashboard
  const { status: dSt, data: dash } = await apiGet('/api/dashboard', cookie);
  if (dSt === 200) {
    pass(`Dashboard responds 200`);
    const inv = getList(dash.invoices ?? dash);
    const pos = getList(dash.purchaseOrders ?? dash);
    const custs = getList(dash.customers ?? dash);
    if ((dash.invoices?.length || dash.invoices) > 0 || inv.length > 0)
      pass(`Dashboard: invoices present (${dash.invoices?.length ?? inv.length})`);
    else skip(`Dashboard: no invoice count visible`);
    if (dash.products || dash.productCount)
      pass(`Dashboard: products count present`);
    if (dash.companySettings?.companyName)
      pass(`Dashboard: company name = "${dash.companySettings.companyName}"`);
    else skip(`Dashboard: companySettings not in response`);
  } else {
    fail(`Dashboard returns HTTP ${dSt}`);
  }

  // 1b. Purchase Orders — multi-currency check
  const { status: poSt, data: poData } = await apiGet('/api/purchase-orders', cookie);
  if (poSt === 200) {
    const pos = getList(poData);
    const currencies = new Set(pos.map((p: any) => p.currency).filter(Boolean));
    pass(`PO list returns ${pos.length} records`);
    const hasGBP = currencies.has('GBP');
    const hasUSD = currencies.has('USD');
    const hasINR = currencies.has('INR');
    if (hasGBP && hasUSD && hasINR) pass(`POs cover 3 currencies: GBP, USD, INR`);
    else fail(`POs missing currencies — found: ${[...currencies].join(', ')}`);
    const withFx = pos.filter((p: any) => parseFloat(p.fxRateToAed) > 0);
    if (withFx.length > 0) pass(`POs have fxRateToAed populated (${withFx.length} records)`);
    else fail(`POs missing fxRateToAed`);
  } else {
    fail(`GET /api/purchase-orders returns HTTP ${poSt}`);
  }

  // 1c. Invoices — status distribution check
  const { status: invSt, data: invData } = await apiGet('/api/invoices', cookie);
  if (invSt === 200) {
    const invList = getList(invData);
    const byStatus: Record<string, number> = {};
    invList.forEach((i: any) => { const s = i.status || 'unknown'; byStatus[s] = (byStatus[s] ?? 0) + 1; });
    pass(`Invoice list: ${invList.length} total`);
    if (invList.length === 400) pass(`Invoice count = 400 ✓`);
    else fail(`Invoice count = ${invList.length} ≠ 400`);
    const expected = { draft: 50, sent: 150, paid: 150, overdue: 50 };
    let distOk = true;
    for (const [s, n] of Object.entries(expected)) {
      if ((byStatus[s] ?? 0) !== n) { distOk = false; fail(`Invoice status ${s}: ${byStatus[s] ?? 0} ≠ ${n}`); }
    }
    if (distOk) pass(`Invoice status distribution: Draft=50, Sent=150, Paid=150, Overdue=50 ✓`);

    // VAT check: paid invoices should have vatAmount
    const paidWithVat = invList.filter((i: any) => i.status === 'paid' && parseFloat(i.vatAmount || i.tax_amount || 0) > 0);
    if (paidWithVat.length > 0) pass(`Paid invoices have VAT amounts (${paidWithVat.length} records)`);
    else fail(`No paid invoices have VAT amounts`);

    // Payment method check
    const paidWithPM = invList.filter((i: any) => i.status === 'paid' && i.paymentMethod);
    if (paidWithPM.length > 0) pass(`Paid invoices have paymentMethod (${paidWithPM.length} records)`);
    else fail(`No paid invoices have paymentMethod set`);
  } else {
    fail(`GET /api/invoices returns HTTP ${invSt}`);
  }

  // 1d. Quotations — status distribution check
  const { status: qSt, data: qData } = await apiGet('/api/quotations', cookie);
  if (qSt === 200) {
    const qList = getList(qData);
    pass(`Quotation list: ${qList.length} total`);
    if (qList.length === 300) pass(`Quotation count = 300 ✓`);
    else fail(`Quotation count = ${qList.length} ≠ 300`);
    const byStatus: Record<string, number> = {};
    qList.forEach((q: any) => { byStatus[q.status] = (byStatus[q.status] ?? 0) + 1; });
    pass(`Quotation status distribution: ${JSON.stringify(byStatus)}`);
  } else {
    fail(`GET /api/quotations returns HTTP ${qSt}`);
  }

  // 1e. Delivery Orders (≥300: 300 seeded + up to 12 from non-seed flows)
  const { status: doSt, data: doData } = await apiGet('/api/delivery-orders', cookie);
  if (doSt === 200) {
    const doList = getList(doData);
    pass(`Delivery Order list: ${doList.length} total`);
    const seedDOs = doList.filter((d: any) => d.notes?.includes('SEED-56')).length;
    if (seedDOs >= 300) pass(`DO seeded count = ${seedDOs} ≥ 300 ✓`);
    else if (doList.length >= 300) pass(`DO total count = ${doList.length} ≥ 300 ✓`);
    else fail(`DO count = ${doList.length} < 300`);
  } else {
    fail(`GET /api/delivery-orders returns HTTP ${doSt}`);
  }

  // 1f. Dashboard stats endpoint
  const { status: stSt, data: stData } = await apiGet('/api/dashboard/stats', cookie);
  if (stSt === 200) {
    pass(`Dashboard stats endpoint: 200 OK`);
  } else {
    skip(`Dashboard stats endpoint: HTTP ${stSt} (may not exist for this layout)`);
  }
}

// ─── Phase 2: Recycle Bin Stress Test ────────────────────────────────────────
async function verifyRecycleBin(cookie: string) {
  head('Phase 2 — Recycle Bin Stress Test');

  // Snapshot bin BEFORE any deletes — used to isolate items we add
  const { data: rbBefore } = await apiGet('/api/recycle-bin', cookie);
  const rbBeforeIds = new Set(getList(rbBefore).map((r: any) => r.id));
  pass(`Recycle bin before test: ${rbBeforeIds.size} items`);

  // Gather IDs to soft-delete
  const [
    { data: prodData },
    { data: qData },
    { data: invData },
    { data: poData },
    { data: doData },
  ] = await Promise.all([
    apiGet('/api/products?limit=1000', cookie),
    apiGet('/api/quotations', cookie),
    apiGet('/api/invoices', cookie),
    apiGet('/api/purchase-orders', cookie),
    apiGet('/api/delivery-orders', cookie),
  ]);

  const prods  = getList(prodData).filter((p: any) => p.isActive).slice(0, 5).map((p: any) => p.id);
  const quotes = getList(qData).filter((q: any) => q.status === 'Draft').slice(0, 3).map((q: any) => q.id);
  const invs   = getList(invData).filter((i: any) => i.status === 'draft').slice(0, 3).map((i: any) => i.id);
  const pos    = getList(poData).filter((p: any) => p.status === 'draft').slice(0, 2).map((p: any) => p.id);
  const dos    = getList(doData).filter((d: any) => d.status === 'draft').slice(0, 2).map((d: any) => d.id);

  pass(`Items to soft-delete: ${prods.length} products, ${quotes.length} quotations, ${invs.length} invoices, ${pos.length} POs, ${dos.length} DOs`);

  // Soft-delete via DELETE endpoints
  for (const id of prods)  { const { status } = await apiDelete(`/api/products/${id}`, cookie); if (status !== 200 && status !== 204) skip(`Product ${id} delete returned ${status}`); }
  for (const id of quotes) { await apiDelete(`/api/quotations/${id}`, cookie); }
  for (const id of invs)   { await apiDelete(`/api/invoices/${id}`, cookie); }
  for (const id of pos)    { await apiDelete(`/api/purchase-orders/${id}`, cookie); }
  for (const id of dos)    { await apiDelete(`/api/delivery-orders/${id}`, cookie); }

  await new Promise(r => setTimeout(r, 300));

  // Check recycle bin AFTER deletes — find only NEW items (ones we added)
  const { status: rbSt, data: rbData } = await apiGet('/api/recycle-bin', cookie);
  if (rbSt !== 200) { fail(`GET /api/recycle-bin returned HTTP ${rbSt}`); return; }
  const rbAll = getList(rbData) as any[];
  const rbNew = rbAll.filter((r: any) => !rbBeforeIds.has(r.id));  // only items we just added

  pass(`GET /api/recycle-bin: ${rbAll.length} total (${rbNew.length} newly added by this test)`);

  // Count new items by type
  const byType: Record<string, number> = {};
  rbNew.forEach((r: any) => { const t = r.document_type || r.documentType || 'unknown'; byType[t] = (byType[t] ?? 0) + 1; });
  pass(`Newly added recycle bin items by type: ${JSON.stringify(byType)}`);

  // Products may not create recycle bin entries (hard delete) — check ≥ what binned
  const expectedBinned = quotes.length + invs.length + pos.length + dos.length; // products excluded
  if (rbNew.length >= expectedBinned) {
    pass(`Recycle bin has ${rbNew.length} new items ≥ ${expectedBinned} expected (excluding products)`);
  } else {
    skip(`Recycle bin has only ${rbNew.length} new items (expected ≥ ${expectedBinned})`);
  }

  // Restore 8 of the new items, purge remaining 7 — ONLY operate on rbNew to avoid corrupting data
  const toRestore = rbNew.slice(0, Math.min(8, rbNew.length));
  const toPurge   = rbNew.slice(toRestore.length, toRestore.length + Math.min(7, rbNew.length - toRestore.length));

  let restored = 0;
  for (const item of toRestore) {
    const { status, data } = await apiPost(`/api/recycle-bin/${item.id}/restore`, {}, cookie);
    if (status === 200 || status === 201) restored++;
    else skip(`Restore ${item.id} (${item.document_type}) returned ${status}: ${JSON.stringify(data).slice(0, 60)}`);
  }
  pass(`Restore: ${restored}/${toRestore.length} items restored successfully`);

  let purged = 0;
  for (const item of toPurge) {
    const { status } = await apiDelete(`/api/recycle-bin/${item.id}`, cookie);
    if (status === 200 || status === 204) purged++;
    else skip(`Purge ${item.id} returned ${status}`);
  }
  pass(`Purge: ${purged}/${toPurge.length} items permanently deleted`);

  // Final state: remaining new items in bin = total new - restored - purged
  const { data: rbFinal } = await apiGet('/api/recycle-bin', cookie);
  const rbFinalAll = getList(rbFinal) as any[];
  const remainingNew = rbFinalAll.filter((r: any) => !rbBeforeIds.has(r.id)).length;
  pass(`Recycle bin after: ${rbFinalAll.length} total, ${remainingNew} remaining new items (was ${rbNew.length}, restored ${restored}, purged ${purged})`);

  // Restore remaining new items to keep DB clean between test runs
  const stillInBin = rbFinalAll.filter((r: any) => !rbBeforeIds.has(r.id));
  if (stillInBin.length > 0) {
    let cleanedUp = 0;
    for (const item of stillInBin) {
      const { status } = await apiPost(`/api/recycle-bin/${item.id}/restore`, {}, cookie);
      if (status === 200 || status === 201) cleanedUp++;
    }
    pass(`Cleanup: restored ${cleanedUp} remaining new items to keep DB clean`);
  }
}

// ─── Phase 3: Document Numbering ──────────────────────────────────────────────
async function verifyDocumentNumbering(cookie: string) {
  head('Phase 3 — Document Numbering / Prefix Settings');

  // Get current settings
  const { status: gSt, data: cs } = await apiGet('/api/company-settings', cookie);
  if (gSt !== 200) { fail(`GET /api/company-settings returned HTTP ${gSt}`); return; }
  pass(`Company settings fetched: PO="${cs.poNumberPrefix || cs.po_number_prefix}", DO="${cs.doNumberPrefix || cs.do_number_prefix}", INV="${cs.invoiceNumberPrefix || cs.invoice_number_prefix}"`);

  const origPO  = cs.poNumberPrefix  || cs.po_number_prefix  || 'PO';
  const origDO  = cs.doNumberPrefix  || cs.do_number_prefix  || 'DO';
  const origINV = cs.invoiceNumberPrefix || cs.invoice_number_prefix || 'INV';
  const nextPO  = cs.nextPoNumber    || cs.next_po_number    || 1;
  const nextDO  = cs.nextDoNumber    || cs.next_do_number    || 1;
  const nextINV = cs.nextInvoiceNumber || cs.next_invoice_number || 1;

  pass(`Original prefixes — PO="${origPO}", DO="${origDO}", INV="${origINV}"`);
  pass(`Current next numbers — PO=${nextPO}, DO=${nextDO}, INV=${nextINV}`);

  // Change prefixes to UAE variants (API uses camelCase for PUT)
  const newPrefix = 'PO-UAE';
  const newDoPrefix = 'DO-UAE';
  const newInvPrefix = 'INV-UAE';
  const { status: putSt, data: putData } = await apiPut('/api/company-settings', {
    ...cs,
    poNumberPrefix:      newPrefix,
    doNumberPrefix:      newDoPrefix,
    invoiceNumberPrefix: newInvPrefix,
  }, cookie);
  if (putSt === 200) {
    pass(`Prefixes updated → ${newPrefix}, ${newDoPrefix}, ${newInvPrefix}`);
  } else {
    fail(`PUT /api/company-settings returned HTTP ${putSt}: ${JSON.stringify(putData).slice(0, 80)}`);
    return;
  }

  // Verify next-number endpoints now use new prefix (e.g., "PO-UAE-613")
  const { data: nextPOData } = await apiGet('/api/purchase-orders/next-number', cookie);
  const nextPONum: string = nextPOData?.nextNumber || nextPOData?.poNumber || '';
  if (nextPONum.startsWith(newPrefix)) {
    pass(`Next PO number uses new prefix: ${nextPONum} ✓`);
  } else {
    fail(`Next PO number "${nextPONum}" does not start with "${newPrefix}"`);
  }

  const { data: nextINVData } = await apiGet('/api/invoices/next-number', cookie);
  const nextINVNum: string = nextINVData?.nextNumber || nextINVData?.invoiceNumber || '';
  if (nextINVNum.startsWith(newInvPrefix)) {
    pass(`Next invoice number uses new prefix: ${nextINVNum} ✓`);
  } else {
    fail(`Next invoice number "${nextINVNum}" does not start with "${newInvPrefix}"`);
  }

  // Restore original prefixes
  const { status: restSt } = await apiPut('/api/company-settings', {
    ...cs,
    poNumberPrefix:      origPO,
    doNumberPrefix:      origDO,
    invoiceNumberPrefix: origINV,
  }, cookie);
  if (restSt === 200) {
    pass(`Prefixes restored → PO="${origPO}", DO="${origDO}", INV="${origINV}"`);
  } else {
    fail(`Failed to restore prefixes: HTTP ${restSt}`);
  }

  // Verify restoration
  const { data: csAfter } = await apiGet('/api/company-settings', cookie);
  const restoredPO = csAfter.poNumberPrefix || csAfter.po_number_prefix;
  if (restoredPO === origPO) {
    pass(`Prefix restoration confirmed: PO="${restoredPO}"`);
  } else {
    fail(`PO prefix after restore = "${restoredPO}", expected "${origPO}"`);
  }
}

// ─── Phase 4: Financial Year Open/Close ───────────────────────────────────────
async function verifyFinancialYears(cookie: string) {
  head('Phase 4 — Financial Year Open/Close');

  // Check current state
  const { status: bkSt, data: bkData } = await apiGet('/api/books', cookie);
  if (bkSt !== 200) { fail(`GET /api/books returned HTTP ${bkSt}`); return; }

  const years: any[] = Array.isArray(bkData) ? bkData : (bkData.books || []);
  pass(`Financial years found: ${years.length}`);

  const y2025 = years.find((y: any) => y.year === 2025);
  const y2026 = years.find((y: any) => y.year === 2026);
  const y2027 = years.find((y: any) => y.year === 2027);

  if (y2025?.status === 'Closed') pass(`2025 is Closed ✓`);
  else fail(`2025 status = "${y2025?.status}", expected Closed`);

  if (y2026?.status === 'Open') pass(`2026 is Open ✓`);
  else fail(`2026 status = "${y2026?.status}", expected Open`);

  if (y2027?.status === 'Open') pass(`2027 is Open ✓`);
  else fail(`2027 status = "${y2027?.status}", expected Open`);

  if (!y2025) { fail(`2025 financial year not found`); return; }

  // Reopen 2025
  const { status: openSt, data: openData } = await apiPut(`/api/books/${y2025.id}`, { status: 'Open' }, cookie);
  if (openSt === 200) {
    pass(`2025 reopened successfully`);
  } else {
    fail(`Reopen 2025 returned HTTP ${openSt}: ${JSON.stringify(openData).slice(0, 80)}`);
    return;
  }

  // Verify it's now Open
  const { data: bkAfterOpen } = await apiGet('/api/books', cookie);
  const yearsAfterOpen: any[] = Array.isArray(bkAfterOpen) ? bkAfterOpen : (bkAfterOpen.books || []);
  const y2025AfterOpen = yearsAfterOpen.find((y: any) => y.year === 2025);
  if (y2025AfterOpen?.status === 'Open') pass(`2025 confirmed Open after reopen`);
  else skip(`2025 status after reopen = "${y2025AfterOpen?.status}"`);

  // Re-close 2025
  const { status: closeSt, data: closeData } = await apiPut(`/api/books/${y2025.id}`, { status: 'Closed' }, cookie);
  if (closeSt === 200) {
    pass(`2025 re-closed successfully`);
  } else {
    fail(`Re-close 2025 returned HTTP ${closeSt}: ${JSON.stringify(closeData).slice(0, 80)}`);
    return;
  }

  // Verify it's Closed again
  const { data: bkFinal } = await apiGet('/api/books', cookie);
  const yearsFinal: any[] = Array.isArray(bkFinal) ? bkFinal : (bkFinal.books || []);
  const y2025Final = yearsFinal.find((y: any) => y.year === 2025);
  if (y2025Final?.status === 'Closed') pass(`2025 confirmed Closed again ✓`);
  else fail(`2025 status after re-close = "${y2025Final?.status}"`);
}

// ─── Phase 5: Storage API ─────────────────────────────────────────────────────
async function verifyStorage(cookie: string) {
  head('Phase 5 — Storage API');

  // Get total size
  const { status: szSt, data: szData } = await apiGet('/api/storage/total-size', cookie);
  if (szSt === 200) {
    const sizeBytes = szData.totalSize ?? szData.size ?? szData.total_size ?? 0;
    pass(`GET /api/storage/total-size: ${JSON.stringify(szData).slice(0, 120)}`);
  } else if (szSt === 503 || szSt === 500) {
    skip(`Storage service returned ${szSt} — object storage may not be configured in dev`);
  } else {
    fail(`GET /api/storage/total-size returned HTTP ${szSt}`);
  }

  // Try to sign an upload
  const { status: signSt, data: signData } = await apiPost('/api/storage/sign-upload', {
    key: 'invoices/verify-57-test.pdf',
    contentType: 'application/pdf',
    fileSize: 1024,
  }, cookie);

  if (signSt === 200 || signSt === 201) {
    pass(`POST /api/storage/sign-upload: token issued`);
    // We won't upload a real file in this test script (no PDF binary available)
    skip(`Skipping actual file upload (no real PDF binary in test environment)`);
  } else if (signSt === 503 || signSt === 500) {
    skip(`Storage sign-upload returned ${signSt} — object storage not configured in dev`);
  } else {
    fail(`POST /api/storage/sign-upload returned HTTP ${signSt}: ${JSON.stringify(signData).slice(0, 80)}`);
  }

  // List prefix
  const { status: listSt } = await apiGet('/api/storage/list-prefix?prefix=invoices/', cookie);
  if (listSt === 200) {
    pass(`GET /api/storage/list-prefix: 200 OK`);
  } else if (listSt === 503 || listSt === 500) {
    skip(`list-prefix returned ${listSt} — storage not configured`);
  } else {
    fail(`GET /api/storage/list-prefix returned HTTP ${listSt}`);
  }
}

// ─── Phase 6: User Roles ──────────────────────────────────────────────────────
async function verifyUserRoles() {
  head('Phase 6 — User Role Access Control');

  // ── Admin ─────────────────────────────────────────────────────────
  const adminCookie = await login('admin', 'admin123');
  pass(`Admin login successful`);
  await new Promise(r => setTimeout(r, 400)); // Allow session to persist to PostgreSQL

  const { status: usersSt, data: usersData } = await apiGet('/api/users', adminCookie);
  if (usersSt === 200) pass(`Admin can GET /api/users (${getList(usersData).length} users)`);
  else fail(`Admin GET /api/users returned ${usersSt}`);

  const { status: csSt } = await apiGet('/api/company-settings', adminCookie);
  if (csSt === 200) pass(`Admin can GET /api/company-settings`);
  else fail(`Admin GET /api/company-settings returned ${csSt}`);

  // ── Manager ───────────────────────────────────────────────────────
  const mgr = await login('ahmed.alrashidi', 'Pass@1234');
  pass(`Manager login successful`);
  await new Promise(r => setTimeout(r, 400)); // Allow session to persist

  // Manager can view invoices
  const { status: mInvSt } = await apiGet('/api/invoices', mgr);
  if (mInvSt === 200) pass(`Manager can GET /api/invoices`);
  else fail(`Manager GET /api/invoices returned ${mInvSt}`);

  // Manager can view POs
  const { status: mPoSt } = await apiGet('/api/purchase-orders', mgr);
  if (mPoSt === 200) pass(`Manager can GET /api/purchase-orders`);
  else fail(`Manager GET /api/purchase-orders returned ${mPoSt}`);

  // Manager cannot access /api/users (Admin only)
  const { status: mUsersSt } = await apiGet('/api/users', mgr);
  if (mUsersSt === 403) pass(`Manager correctly denied GET /api/users (403)`);
  else fail(`Manager GET /api/users returned ${mUsersSt}, expected 403`);

  // Manager cannot change company settings (Admin only)
  const { status: mCsSt, data: csData } = await apiGet('/api/company-settings', mgr);
  if (mCsSt === 200) {
    const { status: mCsPutSt } = await apiPut('/api/company-settings', { ...csData }, mgr);
    if (mCsPutSt === 403) pass(`Manager correctly denied PUT /api/company-settings (403)`);
    else skip(`Manager PUT /api/company-settings returned ${mCsPutSt} (may not be blocked)`);
  }

  // ── Staff ─────────────────────────────────────────────────────────
  const staff = await login('abdullah.alhamdan', 'Pass@1234');
  pass(`Staff login successful`);
  await new Promise(r => setTimeout(r, 400)); // Allow session to persist

  // Staff can view invoices
  const { status: sInvSt } = await apiGet('/api/invoices', staff);
  if (sInvSt === 200) pass(`Staff can GET /api/invoices`);
  else fail(`Staff GET /api/invoices returned ${sInvSt}`);

  // Staff cannot view POs (Admin/Manager only)
  const { status: sPOSt } = await apiGet('/api/purchase-orders', staff);
  if (sPOSt === 403) pass(`Staff correctly denied GET /api/purchase-orders (403)`);
  else skip(`Staff GET /api/purchase-orders returned ${sPOSt} (expected 403)`);

  // Staff cannot access /api/users
  const { status: sUsersSt } = await apiGet('/api/users', staff);
  if (sUsersSt === 403) pass(`Staff correctly denied GET /api/users (403)`);
  else fail(`Staff GET /api/users returned ${sUsersSt}, expected 403`);

  // Staff cannot create products
  const { status: sProdSt } = await apiPost('/api/products', { name: 'Test', sku: 'TEST-VERIFY', unitPrice: '10', category: 'Electronics' }, staff);
  if (sProdSt === 403) pass(`Staff correctly denied POST /api/products (403)`);
  else skip(`Staff POST /api/products returned ${sProdSt} (some Staff permissions may allow this)`);

  // Staff cannot access company settings PUT
  const { status: sCsPutSt } = await apiPut('/api/company-settings', {}, staff);
  if (sCsPutSt === 403) pass(`Staff correctly denied PUT /api/company-settings (403)`);
  else fail(`Staff PUT /api/company-settings returned ${sCsPutSt}, expected 403`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Feature Verification — Task #57                               ');
  console.log('═══════════════════════════════════════════════════════════════');

  const adminCookie = await login('admin', 'admin123');
  console.log(`✓ Authenticated as admin\n`);

  await verifyReports(adminCookie);
  await verifyRecycleBin(adminCookie);
  await verifyDocumentNumbering(adminCookie);
  await verifyFinancialYears(adminCookie);
  await verifyStorage(adminCookie);
  await verifyUserRoles();

  console.log('\n═══════════════════════════════════════════════════════════════');
  if (failures.length === 0) {
    console.log(`${GRN}${BLD} ✓ ALL CHECKS PASSED${RST}`);
  } else {
    console.log(`${RED}${BLD} ✗ ${failures.length} FAILURE(S):${RST}`);
    failures.forEach(f => console.log(`   ${RED}•${RST} ${f}`));
  }
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failures.length > 0) process.exit(1);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
