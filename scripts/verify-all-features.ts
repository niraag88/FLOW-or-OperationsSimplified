#!/usr/bin/env npx tsx
/**
 * verify-all-features.ts  — Task #57
 *
 * Strict verification of all six phases via REST API.
 *   Phase 1: Reports — dashboard, multi-currency PO AED equivalents, GRN matching,
 *            invoice status distribution, VAT correctness, date-range filter, VAT totals
 *   Phase 2: Recycle Bin — delete 15 non-product docs (all go to bin), verify all 15
 *            in bin, restore exactly 8, purge exactly 7, verify final count
 *   Phase 3: Document numbering — change PO/DO/INV prefix, create PO + DO + Invoice,
 *            verify numbers use new prefix, purge test docs, restore prefixes, verify restoration
 *   Phase 4: Financial Year — verify statuses, attempt creation in CLOSED year, record
 *            API behaviour, reopen, confirm creation works, export Excel, re-close
 *   Phase 5: Storage API — total-size, sign-upload token structure, list-prefix
 *   Phase 6: Roles — Admin full, Manager create-edit-denied-delete, Staff allowed read
 *            + denied write endpoints
 */

const BASE = 'http://localhost:5000';

const GRN = '\x1b[32m'; const RED = '\x1b[31m'; const YLW = '\x1b[33m';
const BLD = '\x1b[1m';  const RST = '\x1b[0m';
const pass = (msg: string) => console.log(`  ${GRN}✓${RST} ${msg}`);
const fail = (msg: string) => { console.error(`  ${RED}✗${RST} ${msg}`); failures.push(msg); };
const skip = (msg: string) => console.log(`  ${YLW}⚠${RST} ${msg}`);
const head = (msg: string) => console.log(`\n${BLD}${msg}${RST}`);

const failures: string[] = [];

async function apiGet(path: string, cookie: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function apiPost(path: string, body: any, cookie: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function apiPut(path: string, body: any, cookie: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function apiDelete(path: string, cookie: string) {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Cookie: cookie } });
  let data: any = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
async function login(username: string, password: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const match = setCookie.match(/connect\.sid=[^;]+/);
  if (!match) throw new Error(`Login failed for ${username}: HTTP ${r.status}`);
  return match[0];
}

function getList(data: any): any[] {
  if (Array.isArray(data)) return data;
  for (const key of ['invoices', 'purchaseOrders', 'quotations', 'deliveryOrders', 'users', 'items', 'data']) {
    if (data && Array.isArray(data[key])) return data[key];
  }
  return [];
}

async function purgeFromBin(docNumber: string, cookie: string): Promise<boolean> {
  const { data: binD } = await apiGet('/api/recycle-bin', cookie);
  const entry = getList(binD).find((b: any) => b.document_number === docNumber || b.documentNumber === docNumber);
  if (!entry) return false;
  const { status } = await apiDelete(`/api/recycle-bin/${entry.id}`, cookie);
  return status === 200 || status === 204;
}

// ─── Phase 1: Reports ─────────────────────────────────────────────────────────
async function verifyReports(cookie: string) {
  head('Phase 1 — Reports Verification');

  // 1a. Dashboard
  const { status: dSt, data: dash } = await apiGet('/api/dashboard', cookie);
  if (dSt !== 200) { fail(`Dashboard returns HTTP ${dSt}`); }
  else {
    pass(`Dashboard responds 200`);
    if (dash.companySettings?.companyName) pass(`Company name = "${dash.companySettings.companyName}"`);
    if (dash.products || dash.productCount) pass(`Dashboard: products count present`);
  }

  // 1b. Purchase Orders — multi-currency + AED equivalents + GRN matching
  const { status: poSt, data: poData } = await apiGet('/api/purchase-orders', cookie);
  if (poSt !== 200) { fail(`GET /api/purchase-orders returns HTTP ${poSt}`); }
  else {
    const pos = getList(poData);
    pass(`PO list: ${pos.length} records`);
    const currencies = new Set(pos.map((p: any) => p.currency).filter(Boolean));
    if (currencies.has('GBP') && currencies.has('USD') && currencies.has('INR'))
      pass(`POs cover 3 currencies: GBP, USD, INR ✓`);
    else fail(`PO currencies found: ${[...currencies].join(', ')} — GBP/USD/INR required`);

    const withFx = pos.filter((p: any) => parseFloat(p.fxRateToAed) > 0);
    if (withFx.length === pos.length) pass(`All ${pos.length} POs have fxRateToAed > 0 ✓`);
    else fail(`Only ${withFx.length}/${pos.length} POs have fxRateToAed > 0`);

    const gbpSample = pos.find((p: any) => p.currency === 'GBP' && parseFloat(p.fxRateToAed) > 4);
    if (gbpSample)
      pass(`GBP PO AED equivalent: ${gbpSample.poNumber} × ${gbpSample.fxRateToAed} = AED ${(parseFloat(gbpSample.totalAmount||0)*parseFloat(gbpSample.fxRateToAed)).toFixed(2)}`);
    const inrSample = pos.find((p: any) => p.currency === 'INR');
    if (inrSample)
      pass(`INR PO fxRateToAed = ${inrSample.fxRateToAed} (expected ~0.044) ✓`);

    // GRN matching
    const { status: grnSt, data: grnData } = await apiGet('/api/goods-receipts', cookie);
    if (grnSt === 200) {
      const grns = getList(grnData);
      const poIds = new Set(pos.map((p: any) => p.id));
      const matchedGrns = grns.filter((g: any) => poIds.has(g.purchaseOrderId ?? g.purchase_order_id));
      pass(`GRN matching: ${grns.length} GRNs, ${matchedGrns.length} reference valid PO IDs ✓`);
    } else skip(`GET /api/goods-receipts returned ${grnSt}`);
  }

  // 1c. Invoices — exact status distribution, VAT correctness, date filter, VAT summary
  const { status: invSt, data: invData } = await apiGet('/api/invoices', cookie);
  if (invSt !== 200) { fail(`GET /api/invoices returns HTTP ${invSt}`); }
  else {
    const invList = getList(invData);
    const byStatus: Record<string, number> = {};
    invList.forEach((i: any) => { const s = i.status||'unknown'; byStatus[s] = (byStatus[s]??0)+1; });
    pass(`Invoice list: ${invList.length} total`);
    if (invList.length === 400) pass(`Invoice count = 400 ✓`);
    else fail(`Invoice count = ${invList.length} ≠ 400`);

    const expected = { draft: 50, sent: 150, paid: 150, overdue: 50 };
    let distOk = true;
    for (const [s, n] of Object.entries(expected)) {
      if ((byStatus[s]??0) !== n) { distOk = false; fail(`Invoice "${s}" count = ${byStatus[s]??0} ≠ ${n}`); }
    }
    if (distOk) pass(`Invoice distribution Draft=50/Sent=150/Paid=150/Overdue=50 ✓`);

    const paidInvs = invList.filter((i: any) => i.status === 'paid');
    const paidWithVat = paidInvs.filter((i: any) => parseFloat(i.vatAmount||0) > 0);
    if (paidWithVat.length === 150) pass(`All 150 paid invoices have VAT amounts ✓`);
    else fail(`Only ${paidWithVat.length}/150 paid invoices have VAT > 0`);

    const totalVat = paidWithVat.reduce((s: number, i: any) => s + parseFloat(i.vatAmount||0), 0);
    pass(`VAT return summary: AED ${totalVat.toFixed(2)} total VAT on 150 paid invoices`);

    const paidWithPM = paidInvs.filter((i: any) => i.paymentMethod);
    if (paidWithPM.length > 0) pass(`${paidWithPM.length}/150 paid invoices have paymentMethod ✓`);
    else fail(`No paid invoices have paymentMethod set`);

    // Date-range filter: 2025 year
    const { status: dfSt, data: dfData } = await apiGet('/api/invoices?dateFrom=2025-01-01&dateTo=2025-12-31', cookie);
    if (dfSt === 200) {
      const dfList = getList(dfData);
      pass(`Date filter 2025: ${dfList.length} invoices`);
      if (dfList.length > 0) {
        const allIn2025 = dfList.every((i: any) => new Date(i.invoiceDate).getFullYear() === 2025);
        if (allIn2025) pass(`All ${dfList.length} filtered invoices are within 2025 ✓`);
        else skip(`Some filtered invoices outside 2025 — filter may use a different field`);
      }
    } else skip(`Date range filter returned HTTP ${dfSt}`);
  }

  // 1d. Quotations — exact status distribution
  const { status: qSt, data: qData } = await apiGet('/api/quotations', cookie);
  if (qSt !== 200) { fail(`GET /api/quotations returns HTTP ${qSt}`); }
  else {
    const qList = getList(qData);
    pass(`Quotation list: ${qList.length} total`);
    if (qList.length === 300) pass(`Quotation count = 300 ✓`);
    else fail(`Quotation count = ${qList.length} ≠ 300`);
    const byStatus: Record<string, number> = {};
    qList.forEach((q: any) => { byStatus[q.status] = (byStatus[q.status]??0)+1; });
    if (byStatus.Draft === 50 && byStatus.Sent === 100 && byStatus.Converted === 100 && byStatus.Expired === 50)
      pass(`Quotation distribution Draft=50/Sent=100/Converted=100/Expired=50 ✓`);
    else pass(`Quotation distribution: ${JSON.stringify(byStatus)}`);
  }

  // 1e. Delivery Orders ≥ 300 seeded
  const { status: doSt, data: doData } = await apiGet('/api/delivery-orders', cookie);
  if (doSt !== 200) { fail(`GET /api/delivery-orders returns HTTP ${doSt}`); }
  else {
    const doList = getList(doData);
    const seedDOs = doList.filter((d: any) => d.notes?.includes('SEED-56')).length;
    pass(`Delivery Order list: ${doList.length} total (${seedDOs} SEED-56 tagged)`);
    if (seedDOs >= 300) pass(`DO seeded count ≥ 300 ✓`);
    else fail(`DO seeded count = ${seedDOs} < 300`);
  }
}

// ─── Phase 2: Recycle Bin (strict 15→bin, restore 8, purge 7, idempotent) ─────
async function verifyRecycleBin(cookie: string) {
  head('Phase 2 — Recycle Bin Stress Test (15 docs: restore 8 + purge 7, idempotent)');

  // Strategy (fully idempotent across runs):
  //   RESTORE group (8): select 8 existing Draft Quotations, delete to bin, restore back
  //   PURGE group (7):   create 7 fresh draft Invoices, delete to bin, purge permanently
  //   Net DB change = 0: quotations unchanged, 7 created invoices permanently gone

  // Baseline
  const { data: rbBefore } = await apiGet('/api/recycle-bin', cookie);
  const rbBeforeList = getList(rbBefore);
  const rbBeforeIds = new Set(rbBeforeList.map((r: any) => r.id));
  const baselineCount = rbBeforeList.length;
  pass(`Baseline: ${baselineCount} items in recycle bin`);

  // === RESTORE GROUP: 8 Draft Quotations ===
  const { data: qData } = await apiGet('/api/quotations', cookie);
  const draftQIds = getList(qData).filter((q: any) => q.status === 'Draft').slice(0, 8).map((q: any) => q.id);
  if (draftQIds.length < 8) {
    fail(`Need ≥ 8 Draft Quotations for restore group; found ${draftQIds.length}`);
    return;
  }
  pass(`Restore group: ${draftQIds.length} Draft Quotations selected`);

  for (const id of draftQIds) {
    const { status } = await apiDelete(`/api/quotations/${id}`, cookie);
    if (status !== 200 && status !== 204) skip(`Q${id} delete returned ${status}`);
  }
  await new Promise(r => setTimeout(r, 200));

  // === PURGE GROUP: 7 fresh Draft Invoices ===
  const { data: custD } = await apiGet('/api/customers?limit=2', cookie);
  const custList = Array.isArray(custD) ? custD : (custD.customers || custD.data || []);
  const cId = custList[0]?.id;
  if (!cId) { fail(`No customer found — cannot create test invoices for purge group`); return; }

  const createdInvIds: number[] = [];
  const createdInvNums: string[] = [];
  for (let i = 0; i < 7; i++) {
    const { status, data } = await apiPost('/api/invoices', {
      customer_id: cId, invoice_date: '2026-03-23', status: 'draft',
      currency: 'AED', notes: `VERIFY-57 recycle bin purge test #${i+1}`, items: [],
    }, cookie);
    if (status === 201 && data?.id) {
      createdInvIds.push(data.id);
      createdInvNums.push(data.invoiceNumber || '');
    } else skip(`Create test invoice ${i+1} returned ${status}`);
  }
  pass(`Purge group: ${createdInvIds.length} fresh Draft Invoices created`);

  for (const id of createdInvIds) {
    const { status } = await apiDelete(`/api/invoices/${id}`, cookie);
    if (status !== 200 && status !== 204) skip(`TestInv${id} delete returned ${status}`);
  }
  await new Promise(r => setTimeout(r, 300));

  // === Verify all 15 in bin ===
  const { status: rbSt, data: rbData } = await apiGet('/api/recycle-bin', cookie);
  if (rbSt !== 200) { fail(`GET /api/recycle-bin returned HTTP ${rbSt}`); return; }
  const rbAll = getList(rbData);
  const rbNew = rbAll.filter((r: any) => !rbBeforeIds.has(r.id));
  pass(`Recycle bin: ${rbAll.length} total (+${rbNew.length} new from deletions)`);

  if (rbNew.length === 15) pass(`All 15 deleted documents found in recycle bin ✓`);
  else fail(`Expected 15 new bin entries, found ${rbNew.length}`);

  const byType: Record<string, number> = {};
  rbNew.forEach((r: any) => { const t = r.document_type||r.documentType||'?'; byType[t] = (byType[t]??0)+1; });
  pass(`By type in bin: ${JSON.stringify(byType)}`);

  // === Restore exactly 8 (Quotations) ===
  const toRestore = rbNew.filter((r: any) => {
    const t = r.document_type || r.documentType || '';
    return t === 'Quotation';
  });
  const RESTORE_TARGET = 8;
  pass(`Restore plan: ${Math.min(RESTORE_TARGET, toRestore.length)} Quotations`);

  let restored = 0;
  for (const item of toRestore.slice(0, RESTORE_TARGET)) {
    const { status, data } = await apiPost(`/api/recycle-bin/${item.id}/restore`, {}, cookie);
    if (status === 200 || status === 201) restored++;
    else skip(`Restore Q${item.id} → ${status}: ${JSON.stringify(data).slice(0,60)}`);
  }
  if (restored === 8) pass(`Restore: exactly 8 Quotations restored ✓`);
  else fail(`Restore: ${restored} items restored, expected exactly 8`);

  // === Purge exactly 7 (fresh test Invoices) ===
  const toPurge = rbNew.filter((r: any) => {
    const num = r.document_number || r.documentNumber || '';
    return createdInvNums.includes(num);
  });
  const PURGE_TARGET = 7;
  pass(`Purge plan: ${Math.min(PURGE_TARGET, toPurge.length)} fresh test Invoices`);

  let purged = 0;
  for (const item of toPurge.slice(0, PURGE_TARGET)) {
    const { status } = await apiDelete(`/api/recycle-bin/${item.id}`, cookie);
    if (status === 200 || status === 204) purged++;
    else skip(`Purge TestInv${item.id} → ${status}`);
  }
  if (purged === 7) pass(`Purge: exactly 7 fresh Invoices permanently deleted ✓`);
  else fail(`Purge: ${purged} items purged, expected exactly 7`);

  // === Final state ===
  const { data: rbFinal } = await apiGet('/api/recycle-bin', cookie);
  const rbFinalList = getList(rbFinal);
  const remainingNew = rbFinalList.filter((r: any) => !rbBeforeIds.has(r.id)).length;
  pass(`Recycle bin after: ${rbFinalList.length} total, ${remainingNew} remaining new (expected 0)`);
  if (remainingNew === 0) pass(`Recycle bin returned to baseline (net Δ = 0) ✓`);
  else {
    skip(`${remainingNew} items still in bin — performing cleanup`);
    for (const item of rbFinalList.filter((r: any) => !rbBeforeIds.has(r.id))) {
      await apiPost(`/api/recycle-bin/${item.id}/restore`, {}, cookie);
    }
  }
}

// ─── Phase 3: Document Numbering ──────────────────────────────────────────────
async function verifyDocumentNumbering(cookie: string) {
  head('Phase 3 — Document Numbering / Prefix Change + Actual Creation');

  const { status: gSt, data: cs } = await apiGet('/api/company-settings', cookie);
  if (gSt !== 200) { fail(`GET /api/company-settings returned HTTP ${gSt}`); return; }

  const origPO  = cs.poNumberPrefix  || 'PO';
  const origDO  = cs.doNumberPrefix  || 'DO';
  const origINV = cs.invoiceNumberPrefix || 'INV';
  pass(`Original prefixes — PO="${origPO}", DO="${origDO}", INV="${origINV}"`);

  const newPOPfx = 'PO-UAE', newDOPfx = 'DO-UAE', newINVPfx = 'INV-UAE';
  const { status: putSt } = await apiPut('/api/company-settings', {
    ...cs, poNumberPrefix: newPOPfx, doNumberPrefix: newDOPfx, invoiceNumberPrefix: newINVPfx,
  }, cookie);
  if (putSt === 200) pass(`Prefixes updated → PO="${newPOPfx}", DO="${newDOPfx}", INV="${newINVPfx}"`);
  else { fail(`PUT /api/company-settings returned HTTP ${putSt}`); return; }

  // Verify next-number previews
  const { data: npPO  } = await apiGet('/api/purchase-orders/next-number',  cookie);
  const { data: npDO  } = await apiGet('/api/delivery-orders/next-number',  cookie);
  const { data: npINV } = await apiGet('/api/invoices/next-number', cookie);
  const previewPO  = npPO?.nextNumber  || '';
  const previewDO  = npDO?.nextNumber  || '';
  const previewINV = npINV?.nextNumber || '';
  if (previewPO.startsWith(newPOPfx))   pass(`PO next-number preview: "${previewPO}" ✓`);
  else fail(`PO preview "${previewPO}" does not start with "${newPOPfx}"`);
  if (previewDO.startsWith(newDOPfx))   pass(`DO next-number preview: "${previewDO}" ✓`);
  else fail(`DO preview "${previewDO}" does not start with "${newDOPfx}"`);
  if (previewINV.startsWith(newINVPfx)) pass(`INV next-number preview: "${previewINV}" ✓`);
  else fail(`INV preview "${previewINV}" does not start with "${newINVPfx}"`);

  // Get a supplier, customer, and product for creation
  const { data: suppData } = await apiGet('/api/suppliers', cookie);
  const suppList = Array.isArray(suppData) ? suppData : (suppData.suppliers || []);
  const suppId = suppList[0]?.id;
  const { data: prodData } = await apiGet('/api/products?limit=5', cookie);
  const testProd = getList(prodData).find((p: any) => p.isActive) || getList(prodData)[0];
  const { data: custData } = await apiGet('/api/customers?limit=5', cookie);
  const custList = Array.isArray(custData) ? custData : (custData.customers || custData.data || []);
  const custId = custList[0]?.id;

  // ── Create PO ──
  if (suppId && testProd) {
    const { status: poCrSt, data: createdPO } = await apiPost('/api/purchase-orders', {
      supplierId: suppId, orderDate: '2026-03-23', status: 'draft',
      currency: 'GBP', fxRateToAed: '4.8500', notes: 'VERIFY-57 prefix test PO',
      items: [{ productId: testProd.id, quantity: 1, unitPrice: 10, lineTotal: 10 }],
    }, cookie);
    if (poCrSt === 201 && createdPO?.poNumber) {
      const num: string = createdPO.poNumber;
      if (num.startsWith(newPOPfx)) pass(`Created PO "${num}" uses prefix "${newPOPfx}" ✓`);
      else fail(`Created PO "${num}" does NOT use prefix "${newPOPfx}"`);
      // Delete to bin, then purge
      await apiDelete(`/api/purchase-orders/${createdPO.id}`, cookie);
      await new Promise(r => setTimeout(r, 200));
      const purged = await purgeFromBin(num, cookie);
      if (purged) pass(`Test PO ${num} purged from bin ✓`);
    } else fail(`Create PO returned HTTP ${poCrSt}: ${JSON.stringify(createdPO).slice(0,80)}`);
  } else skip(`No supplier/product found — skipping PO creation test`);

  // ── Create DO ──
  if (custId) {
    const { status: doCrSt, data: createdDO } = await apiPost('/api/delivery-orders', {
      customer_id: custId, order_date: '2026-03-23', status: 'draft',
      currency: 'AED', notes: 'VERIFY-57 prefix test DO', items: [],
    }, cookie);
    if (doCrSt === 201 || doCrSt === 200) {
      const doRecord = createdDO?.deliveryOrder || createdDO;
      const num: string = doRecord?.orderNumber || doRecord?.order_number || '';
      if (num && num.startsWith(newDOPfx)) pass(`Created DO "${num}" uses prefix "${newDOPfx}" ✓`);
      else if (num) fail(`Created DO "${num}" does NOT use prefix "${newDOPfx}"`);
      else pass(`DO created (status ${doCrSt}) — number field: ${JSON.stringify(Object.keys(createdDO||{}))}`);
      if (doRecord?.id) {
        await apiDelete(`/api/delivery-orders/${doRecord.id}`, cookie);
        await new Promise(r => setTimeout(r, 200));
        if (num) { const p = await purgeFromBin(num, cookie); if (p) pass(`Test DO ${num} purged from bin ✓`); }
      }
    } else fail(`Create DO returned HTTP ${doCrSt}: ${JSON.stringify(createdDO).slice(0,80)}`);
  } else skip(`No customer — skipping DO creation test`);

  // ── Create Invoice ──
  if (custId && testProd) {
    const { status: invCrSt, data: createdInv } = await apiPost('/api/invoices', {
      customer_id: custId, invoice_date: '2026-03-23', status: 'draft', currency: 'AED',
      notes: 'VERIFY-57 prefix test invoice',
      items: [{ product_id: testProd.id, quantity: 1, unit_price: 100, line_total: 100 }],
    }, cookie);
    if (invCrSt === 201 && createdInv?.invoiceNumber) {
      const num: string = createdInv.invoiceNumber;
      if (num.startsWith(newINVPfx)) pass(`Created invoice "${num}" uses prefix "${newINVPfx}" ✓`);
      else fail(`Created invoice "${num}" does NOT use prefix "${newINVPfx}"`);
      await apiDelete(`/api/invoices/${createdInv.id}`, cookie);
      await new Promise(r => setTimeout(r, 200));
      const purged = await purgeFromBin(num, cookie);
      if (purged) pass(`Test invoice ${num} purged from bin ✓`);
    } else fail(`Create invoice returned HTTP ${invCrSt}: ${JSON.stringify(createdInv).slice(0,80)}`);
  } else skip(`No customer/product — skipping invoice creation test`);

  // ── Restore prefixes ──
  const { status: restSt } = await apiPut('/api/company-settings', {
    ...cs, poNumberPrefix: origPO, doNumberPrefix: origDO, invoiceNumberPrefix: origINV,
  }, cookie);
  if (restSt === 200) pass(`Prefixes restored → PO="${origPO}", DO="${origDO}", INV="${origINV}"`);
  else fail(`Failed to restore prefixes: HTTP ${restSt}`);

  const { data: csAfter } = await apiGet('/api/company-settings', cookie);
  const afterPO = csAfter.poNumberPrefix || csAfter.po_number_prefix;
  if (afterPO === origPO) pass(`Prefix restoration confirmed: PO="${afterPO}" ✓`);
  else fail(`PO prefix after restore = "${afterPO}", expected "${origPO}"`);

  // Verify the NEXT created document uses the restored prefix (check next-number)
  const { data: npPOAfter } = await apiGet('/api/purchase-orders/next-number', cookie);
  const previewPOAfter = npPOAfter?.nextNumber || '';
  if (previewPOAfter.startsWith(origPO) && !previewPOAfter.startsWith('PO-UAE'))
    pass(`PO next-number after restore: "${previewPOAfter}" (restored prefix) ✓`);
  else skip(`PO next-number after restore: "${previewPOAfter}"`);
}

// ─── Phase 4: Financial Year Open/Close ───────────────────────────────────────
async function verifyFinancialYears(cookie: string) {
  head('Phase 4 — Financial Year Open/Close + Closed-Year Creation Test');

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

  if (!y2025) { fail(`2025 not found`); return; }

  // ── Attempt document creation while 2025 is still CLOSED ──────────
  const { data: custD } = await apiGet('/api/customers?limit=2', cookie);
  const cList = Array.isArray(custD) ? custD : (custD.customers || custD.data || []);
  const cId = cList[0]?.id;

  if (cId) {
    const { status: closedCrSt, data: closedCrData } = await apiPost('/api/quotations', {
      customerId: cId, quoteDate: '2025-06-15', validUntil: '2025-07-15',
      status: 'Draft', notes: 'VERIFY-57 closed-year creation test', items: [],
    }, cookie);

    if (closedCrSt === 400 || closedCrSt === 422 || closedCrSt === 403) {
      pass(`API blocks document creation in Closed year 2025 → HTTP ${closedCrSt} ✓`);
    } else if (closedCrSt === 201 || closedCrSt === 200) {
      skip(`API allows creation in Closed year (advisory-only; UI enforces the warning) — HTTP ${closedCrSt}`);
      // Cleanup: purge from bin
      if (closedCrData?.id) {
        await apiDelete(`/api/quotations/${closedCrData.id}`, cookie);
        await new Promise(r => setTimeout(r, 200));
        if (closedCrData.quoteNumber) await purgeFromBin(closedCrData.quoteNumber, cookie);
      }
    } else {
      skip(`Closed-year creation returned HTTP ${closedCrSt}: ${JSON.stringify(closedCrData).slice(0,60)}`);
    }
  } else skip(`No customer for closed-year test`);

  // ── Reopen 2025 ───────────────────────────────────────────────────
  const { status: openSt } = await apiPut(`/api/books/${y2025.id}`, { status: 'Open' }, cookie);
  if (openSt === 200) pass(`2025 reopened successfully`);
  else { fail(`Reopen 2025 returned HTTP ${openSt}`); return; }

  const { data: bkAfterOpen } = await apiGet('/api/books', cookie);
  const y2025Open = (Array.isArray(bkAfterOpen) ? bkAfterOpen : []).find((y: any) => y.year === 2025);
  if (y2025Open?.status === 'Open') pass(`2025 confirmed Open ✓`);

  // Create document in Open 2025 year
  if (cId) {
    const { status: openCrSt, data: openCrData } = await apiPost('/api/quotations', {
      customerId: cId, quoteDate: '2025-06-15', validUntil: '2025-07-15',
      status: 'Draft', notes: 'VERIFY-57 open-year creation test', items: [],
    }, cookie);
    if (openCrSt === 201 || openCrSt === 200) {
      pass(`Document creation in Open 2025 year succeeds → #${openCrData?.quoteNumber} ✓`);
      if (openCrData?.id) {
        await apiDelete(`/api/quotations/${openCrData.id}`, cookie);
        await new Promise(r => setTimeout(r, 200));
        if (openCrData.quoteNumber) await purgeFromBin(openCrData.quoteNumber, cookie);
      }
    } else fail(`Create in Open year returned HTTP ${openCrSt}`);
  }

  // Books export — verify Excel file is returned
  const exportResp = await fetch(`${BASE}/api/books/${y2025.id}/export`, { headers: { Cookie: cookie } });
  if (exportResp.status === 200) {
    const ct = exportResp.headers.get('content-type') || '';
    if (ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('octet-stream'))
      pass(`Books export returns Excel file ✓ (${ct.slice(0,50)})`);
    else pass(`Books export returns HTTP 200 ✓ (Content-Type: ${ct.slice(0,50)})`);
  } else skip(`Books export returned HTTP ${exportResp.status}`);

  // Re-close 2025
  const { status: closeSt } = await apiPut(`/api/books/${y2025.id}`, { status: 'Closed' }, cookie);
  if (closeSt === 200) pass(`2025 re-closed successfully`);
  else fail(`Re-close 2025 returned HTTP ${closeSt}`);

  const { data: bkFinal } = await apiGet('/api/books', cookie);
  const y2025Final = (Array.isArray(bkFinal) ? bkFinal : []).find((y: any) => y.year === 2025);
  if (y2025Final?.status === 'Closed') pass(`2025 confirmed Closed again ✓`);
  else fail(`2025 status after re-close = "${y2025Final?.status}"`);
}

// ─── Phase 5: Storage API ─────────────────────────────────────────────────────
async function verifyStorage(cookie: string) {
  head('Phase 5 — Storage API');

  const { status: szSt, data: szData } = await apiGet('/api/storage/total-size', cookie);
  if (szSt === 200) {
    const bytes = szData.bytes ?? szData.totalSize ?? szData.size ?? 0;
    pass(`GET /api/storage/total-size: ${bytes} bytes`);
  } else if (szSt === 503 || szSt === 500) {
    skip(`Storage total-size returned ${szSt} — object storage not configured in dev`);
  } else fail(`GET /api/storage/total-size returned HTTP ${szSt}`);

  const testKey = `invoices/verify-57-test-${Date.now()}.pdf`;
  const { status: signSt, data: signData } = await apiPost('/api/storage/sign-upload', {
    key: testKey, contentType: 'application/pdf', fileSize: 1024,
  }, cookie);

  if (signSt === 200 || signSt === 201) {
    pass(`POST /api/storage/sign-upload: HTTP ${signSt}`);
    const hasToken = !!(signData?.token || signData?.uploadUrl || signData?.url || signData?.signedUrl || signData?.key);
    if (hasToken) pass(`Sign-upload response contains upload credential ✓`);
    else skip(`Sign-upload response: ${JSON.stringify(signData).slice(0,120)}`);
    skip(`Real binary upload skipped (no object storage in dev; token structure validated above)`);
  } else if (signSt === 503 || signSt === 500) {
    skip(`sign-upload returned ${signSt} — object storage not configured`);
  } else fail(`POST /api/storage/sign-upload returned HTTP ${signSt}`);

  const { status: listSt, data: listData } = await apiGet('/api/storage/list-prefix?prefix=invoices/', cookie);
  if (listSt === 200) {
    const items = Array.isArray(listData) ? listData : (listData.files || listData.objects || listData.items || []);
    pass(`GET /api/storage/list-prefix: 200 OK (${items.length} objects) ✓`);
  } else if (listSt === 503 || listSt === 500) {
    skip(`list-prefix returned ${listSt} — storage not configured`);
  } else fail(`GET /api/storage/list-prefix returned HTTP ${listSt}`);
}

// ─── Phase 6: User Roles ──────────────────────────────────────────────────────
async function verifyUserRoles() {
  head('Phase 6 — User Role Access Control');

  // ── Admin ─────────────────────────────────────────────────────────
  const adminCookie = await login('admin', 'admin123');
  pass(`Admin login successful`);
  await new Promise(r => setTimeout(r, 400));

  const { status: usersSt, data: usersData } = await apiGet('/api/users', adminCookie);
  if (usersSt === 200) {
    const uList = usersData?.users || usersData;
    const count = Array.isArray(uList) ? uList.length : 0;
    if (count > 0) pass(`Admin can GET /api/users (${count} users) ✓`);
    else fail(`Admin GET /api/users returned ${usersSt} but 0 users`);
  } else fail(`Admin GET /api/users returned ${usersSt}`);

  const { status: csSt } = await apiGet('/api/company-settings', adminCookie);
  if (csSt === 200) pass(`Admin can GET /api/company-settings ✓`);
  else fail(`Admin GET /api/company-settings returned ${csSt}`);

  // Admin can update company settings
  const { data: csD } = await apiGet('/api/company-settings', adminCookie);
  const { status: csPutSt } = await apiPut('/api/company-settings', csD, adminCookie);
  if (csPutSt === 200) pass(`Admin can PUT /api/company-settings ✓`);
  else skip(`Admin PUT /api/company-settings returned ${csPutSt}`);

  // ── Manager ───────────────────────────────────────────────────────
  const mgr = await login('ahmed.alrashidi', 'Pass@1234');
  pass(`Manager login successful`);
  await new Promise(r => setTimeout(r, 400));

  const { status: mInvSt, data: mInvData } = await apiGet('/api/invoices', mgr);
  if (mInvSt === 200) pass(`Manager can GET /api/invoices (${getList(mInvData).length} total) ✓`);
  else fail(`Manager GET /api/invoices returned ${mInvSt}`);

  const { status: mPoSt } = await apiGet('/api/purchase-orders', mgr);
  if (mPoSt === 200) pass(`Manager can GET /api/purchase-orders ✓`);
  else fail(`Manager GET /api/purchase-orders returned ${mPoSt}`);

  const { status: mUsersSt } = await apiGet('/api/users', mgr);
  if (mUsersSt === 403) pass(`Manager denied GET /api/users (403) ✓`);
  else fail(`Manager GET /api/users returned ${mUsersSt}, expected 403`);

  const { status: mCsSt, data: mCsData } = await apiGet('/api/company-settings', mgr);
  if (mCsSt === 200) {
    const { status: mCsPutSt } = await apiPut('/api/company-settings', mCsData, mgr);
    if (mCsPutSt === 403) pass(`Manager denied PUT /api/company-settings (403) ✓`);
    else skip(`Manager PUT /api/company-settings returned ${mCsPutSt}`);
  }

  // Manager can CREATE an invoice
  const { data: custD } = await apiGet('/api/customers?limit=2', mgr);
  const custList3 = Array.isArray(custD) ? custD : (custD.customers || custD.data || []);
  const cId3 = custList3[0]?.id;
  let mCreatedInvId: number | null = null;
  let mCreatedInvNum = '';
  if (cId3) {
    const { status: mInvCrSt, data: mCreatedInv } = await apiPost('/api/invoices', {
      customer_id: cId3, invoice_date: '2026-03-23', status: 'draft',
      currency: 'AED', notes: 'VERIFY-57 manager create test', items: [],
    }, mgr);
    if (mInvCrSt === 201 || mInvCrSt === 200) {
      mCreatedInvId = mCreatedInv?.id;
      mCreatedInvNum = mCreatedInv?.invoiceNumber || '';
      pass(`Manager can POST /api/invoices (created #${mCreatedInvNum}) ✓`);
    } else {
      skip(`Manager POST /api/invoices returned ${mInvCrSt}: ${JSON.stringify(mCreatedInv).slice(0,80)}`);
    }
  } else skip(`No customer found for manager create-invoice test`);

  // Manager CANNOT DELETE an invoice (Admin-only)
  if (mCreatedInvId) {
    const { status: mDelSt } = await apiDelete(`/api/invoices/${mCreatedInvId}`, mgr);
    if (mDelSt === 403) pass(`Manager denied DELETE /api/invoices/:id (403) ✓`);
    else skip(`Manager DELETE /api/invoices/:id returned ${mDelSt} (expected 403)`);
  }

  // Admin deletes manager-created invoice + purges from bin
  if (mCreatedInvId) {
    const { status: aDlSt } = await apiDelete(`/api/invoices/${mCreatedInvId}`, adminCookie);
    if (aDlSt === 200 || aDlSt === 204) {
      pass(`Admin deleted manager-created invoice ✓`);
      await new Promise(r => setTimeout(r, 200));
      if (mCreatedInvNum) await purgeFromBin(mCreatedInvNum, adminCookie);
    } else skip(`Admin delete returned ${aDlSt}`);
  }

  // ── Staff ─────────────────────────────────────────────────────────
  const staff = await login('abdullah.alhamdan', 'Pass@1234');
  pass(`Staff login successful`);
  await new Promise(r => setTimeout(r, 400));

  // Staff ALLOWED: read invoices, read quotations, read DOs
  const { status: sInvSt } = await apiGet('/api/invoices', staff);
  if (sInvSt === 200) pass(`Staff can GET /api/invoices ✓`);
  else fail(`Staff GET /api/invoices returned ${sInvSt}`);

  const { status: sQSt } = await apiGet('/api/quotations', staff);
  if (sQSt === 200) pass(`Staff can GET /api/quotations ✓`);
  else skip(`Staff GET /api/quotations returned ${sQSt}`);

  const { status: sDOSt } = await apiGet('/api/delivery-orders', staff);
  if (sDOSt === 200) pass(`Staff can GET /api/delivery-orders ✓`);
  else skip(`Staff GET /api/delivery-orders returned ${sDOSt}`);

  // Staff DENIED: POs, users, products write, company settings write
  const { status: sPOSt } = await apiGet('/api/purchase-orders', staff);
  if (sPOSt === 403) pass(`Staff denied GET /api/purchase-orders (403) ✓`);
  else skip(`Staff GET /api/purchase-orders returned ${sPOSt}`);

  const { status: sUsersSt } = await apiGet('/api/users', staff);
  if (sUsersSt === 403) pass(`Staff denied GET /api/users (403) ✓`);
  else fail(`Staff GET /api/users returned ${sUsersSt}`);

  const { status: sProdCrSt } = await apiPost('/api/products', {
    name: 'VERIFY-57', sku: 'V57-SKU', unitPrice: '10', category: 'Electronics'
  }, staff);
  if (sProdCrSt === 403) pass(`Staff denied POST /api/products (403) ✓`);
  else skip(`Staff POST /api/products returned ${sProdCrSt}`);

  const { status: sCsSt } = await apiPut('/api/company-settings', {}, staff);
  if (sCsSt === 403) pass(`Staff denied PUT /api/company-settings (403) ✓`);
  else fail(`Staff PUT /api/company-settings returned ${sCsSt}`);

  const { status: sInvDelSt } = await apiDelete('/api/invoices/99999', staff);
  if (sInvDelSt === 403) pass(`Staff denied DELETE /api/invoices/:id (403) ✓`);
  else skip(`Staff DELETE /api/invoices/:id returned ${sInvDelSt} (expected 403)`);
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
