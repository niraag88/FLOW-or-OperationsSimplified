/**
 * FLOW — Task #55: Purchasing Seed Script
 *
 * Creates (via authenticated REST API):
 *  1. Financial years: 2025 (Closed), 2026 (Open), 2027 (Open) — via /api/books
 *  2. Company settings: Aroma Essence Trading LLC — via /api/company-settings
 *  3. Prefix change test: PO-AE / DO-AE, create test PO + DO, restore — via API
 *  4. 300 purchase orders (120 GBP / 90 USD / 90 INR) — via POST /api/purchase-orders
 *  5. ~100 GRNs for submitted/closed POs — via POST /api/goods-receipts
 *
 * Idempotent:
 *  - POs: skips if count >= 300; clears partial batch (1–299) with stock reversion
 *  - GRNs: creates up to 100; skips if count already >= 100 for seed POs; verified >= 100
 *
 * Prefix format note: document number prefix stored without trailing dash (e.g. "PO")
 *  because generatePoNumber() in businessStorage adds a "-" separator automatically,
 *  producing "PO-001". Prefix "PO-" would yield "PO--001" (double dash).
 *
 * Run: npx tsx scripts/seed-purchasing.ts
 * Env overrides: APP_URL, ADMIN_USERNAME, ADMIN_PASSWORD
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5000';
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// Seed batch tag — lets us distinguish seed POs from others
const SEED_TAG = '[SEED-55]';

// ─── Helpers ────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDec = (min: number, max: number, dp = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));

function dateInYear(year: number): string {
  const start = new Date(`${year}-01-01`).getTime();
  const end = new Date(`${year}-12-31`).getTime();
  return new Date(start + Math.random() * (end - start)).toISOString().slice(0, 10);
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const rawCookie = r.headers.get('set-cookie') ?? '';
  if (!rawCookie) throw new Error('Login failed — no cookie returned');
  // Extract only the name=value portion (strip attributes like Path, HttpOnly, etc.)
  const cookie = rawCookie.split(';')[0];
  console.log('✓ Authenticated as admin');
  return cookie;
}

async function apiGet(path: string, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  return { status: r.status, data: await r.json() };
}

async function apiPost(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function apiPut(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

// ─── 1. Financial Years ──────────────────────────────────────────────────────

async function seedFinancialYears(cookie: string) {
  console.log('\n── Financial years ────────────────────────────────────────');
  const { data: existing } = await apiGet('/api/books', cookie);
  const years = Array.isArray(existing) ? existing as Array<{ id: number; year: number | string; status: string }> : [];
  // Coerce year to number since API may return it as string from JSON
  const yearMap = new Map(years.map((y) => [Number(y.year), { ...y, id: Number(y.id) }]));

  for (const yr of [2025, 2026, 2027]) {
    if (!yearMap.has(yr)) {
      const { status, data } = await apiPost('/api/books', {
        year: yr,
        start_date: `${yr}-01-01`,
        end_date: `${yr}-12-31`,
      }, cookie);
      if (status === 201) { yearMap.set(yr, data); console.log(`  ✓ Created ${yr}`); }
      else console.error(`  ✗ Failed ${yr}:`, data);
    } else {
      console.log(`  → ${yr} already exists (${yearMap.get(yr)!.status})`);
    }
  }

  // Explicitly demonstrate open→close lifecycle for 2025 on every run (including first run)
  const fy2025 = yearMap.get(2025);
  if (fy2025) {
    // Always PUT Open first — makes the state transition visible even when already Closed
    const { status: openStatus } = await apiPut(`/api/books/${fy2025.id}`, { status: 'Open' }, cookie);
    console.log(openStatus === 200 ? '  ✓ PUT 2025 → Open (cycle start)' : '  ✗ Failed to open 2025');
    // Then PUT Closed — completes the full open→close cycle on every run
    const { status: closeStatus } = await apiPut(`/api/books/${fy2025.id}`, { status: 'Closed' }, cookie);
    console.log(closeStatus === 200 ? '  ✓ PUT 2025 → Closed (cycle complete)' : '  ✗ Failed to close 2025');
  }

  // Ensure 2026 and 2027 are Open
  for (const yr of [2026, 2027]) {
    const fy = yearMap.get(yr);
    if (fy && fy.status !== 'Open') {
      await apiPut(`/api/books/${fy.id}`, { status: 'Open' }, cookie);
      console.log(`  ✓ Reopened ${yr}`);
    }
  }

  const { data: final } = await apiGet('/api/books', cookie);
  const finalList = Array.isArray(final) ? final as Array<{ year: number; status: string }> : [];
  finalList.sort((a, b) => a.year - b.year).forEach(y => console.log(`    ${y.year}: ${y.status}`));
}

// ─── 2. Company Settings ─────────────────────────────────────────────────────

async function updateCompanySettings(cookie: string) {
  console.log('\n── Company settings ───────────────────────────────────────');
  // Only update identity/contact fields + document prefixes.
  // NEVER reset sequence counters (next*Number) — they reflect existing documents.
  const { status, data } = await apiPut('/api/company-settings', {
    companyName: 'Aroma Essence Trading LLC',
    address: 'Office 812, The Prism Tower, Business Bay, Dubai, UAE',
    phone: '+971 4 123 4567',
    email: 'info@aromaessence.ae',
    website: 'www.aromaessence.ae',
    vatNumber: '100345678900003',
    taxNumber: 'TRN-100345678900003',
    poNumberPrefix: 'PO',
    doNumberPrefix: 'DO',
    invoiceNumberPrefix: 'INV',
    quotationNumberPrefix: 'QUO',
    grnNumberPrefix: 'GRN',
  }, cookie);

  if (status === 200) {
    console.log(`  ✓ Company: ${data.companyName}`);
    console.log(`  ✓ PO prefix: "${data.poNumberPrefix}", next: ${data.nextPoNumber}`);
  } else {
    console.error('  ✗ Failed:', data);
  }
}

// ─── 3. Prefix Change Test ────────────────────────────────────────────────────

async function testPrefixChange(cookie: string, supplierId: number, productId: number) {
  console.log('\n── Prefix change test ─────────────────────────────────────');

  // Capture current settings so we can restore them exactly after the test
  const { data: before } = await apiGet('/api/company-settings', cookie);
  const origPoPfx: string = before.poNumberPrefix ?? 'PO';
  const origDoPfx: string = before.doNumberPrefix ?? 'DO';

  // Change prefix to PO-AE / DO-AE (no trailing dash — system adds "-" separator)
  await apiPut('/api/company-settings', {
    poNumberPrefix: 'PO-AE',
    doNumberPrefix: 'DO-AE',
  }, cookie);
  console.log(`  → Changed prefixes from "${origPoPfx}"/"${origDoPfx}" → "PO-AE"/"DO-AE"`);

  // Create a test PO via API
  let testPoOk = false;
  const { status: poStatus, data: poData } = await apiPost('/api/purchase-orders', {
    supplierId,
    orderDate: new Date().toISOString().slice(0, 10),
    status: 'draft',
    currency: 'GBP',
    fxRateToAed: '4.8500',
    notes: '[PREFIX-TEST] Prefix verification PO',
    items: [{ productId, quantity: 3, unitPrice: '15.00', lineTotal: '45.00' }],
  }, cookie);
  if (poStatus === 201) {
    const poNum: string = poData.poNumber ?? poData.po_number ?? '?';
    testPoOk = poNum.startsWith('PO-AE');
    console.log(`  ${testPoOk ? '✓' : '✗'} Test PO: ${poNum} (prefix ${testPoOk ? 'OK' : 'WRONG'})`);
  } else {
    console.error('  ✗ Test PO creation failed:', poData);
  }

  // Create a test DO via API (no customer ID needed — pass customer_name directly)
  let testDoOk = false;
  const { status: doStatus, data: doData } = await apiPost('/api/delivery-orders', {
    customer_name: '[PREFIX-TEST] Prefix Verification Customer',
    status: 'draft',
    order_date: new Date().toISOString().slice(0, 10),
    currency: 'AED',
    subtotal: '100.00',
    tax_amount: '5.00',
    total_amount: '105.00',
    notes: '[PREFIX-TEST] Prefix verification DO',
    items: [{
      description: 'Test item for prefix verification',
      quantity: 1,
      unit_price: '100.00',
      line_total: '100.00',
    }],
  }, cookie);
  if (doStatus === 201) {
    const doNum: string = doData.orderNumber ?? doData.order_number ?? '?';
    testDoOk = doNum.startsWith('DO-AE');
    console.log(`  ${testDoOk ? '✓' : '✗'} Test DO: ${doNum} (prefix ${testDoOk ? 'OK' : 'WRONG'})`);
  } else {
    console.error('  ✗ Test DO creation failed:', doData);
  }

  // Restore original prefixes (exactly as captured before the test — no counter changes)
  await apiPut('/api/company-settings', {
    poNumberPrefix: origPoPfx,
    doNumberPrefix: origDoPfx,
  }, cookie);
  console.log(`  → Restored prefixes to "${origPoPfx}"/"${origDoPfx}"`);

  if (!testPoOk || !testDoOk) {
    console.error('  ✗ Prefix test FAILED');
    process.exit(1);
  }
  console.log('  ✓ Prefix test passed');
}

// ─── 4. Purchase Orders (via POST /api/purchase-orders) ──────────────────────

interface PoSpec {
  currency: 'GBP' | 'USD' | 'INR';
  year: number;
  status: 'draft' | 'submitted' | 'closed';
  supplierId: number;
  prodIds: number[];
  fxRate: number;
}

async function seedPurchaseOrders(cookie: string): Promise<number[]> {
  console.log('\n── Purchase orders (300 via API) ──────────────────────────');

  // Idempotency: skip if >= 300 seeded POs
  const existingRow = await pool.query(`SELECT COUNT(*) FROM purchase_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]);
  const existing = parseInt(existingRow.rows[0].count);
  if (existing >= 300) {
    console.log(`  → Already have ${existing} seeded POs — skipping`);
    const ids = await pool.query(`SELECT id FROM purchase_orders WHERE notes LIKE $1 AND status IN ('submitted','closed')`, [`${SEED_TAG}%`]);
    return ids.rows.map(r => r.id);
  }
  // Partial batch detected — clear it to start clean and avoid distribution skew
  if (existing > 0) {
    console.log(`  → Partial batch found (${existing} POs) — clearing before fresh seed`);
    // Reverse stock increases from partial GRNs before deleting them
    await pool.query(`
      UPDATE products p
      SET stock_quantity = GREATEST(0, stock_quantity - COALESCE((
        SELECT SUM(gri.received_quantity)
        FROM goods_receipt_items gri
        JOIN goods_receipts gr ON gri.receipt_id = gr.id
        JOIN purchase_orders po ON gr.po_id = po.id
        WHERE gri.product_id = p.id AND po.notes LIKE $1
      ), 0))`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id IN (SELECT gr.id FROM goods_receipts gr JOIN purchase_orders po ON gr.po_id = po.id WHERE po.notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM goods_receipt_items WHERE receipt_id IN (SELECT gr.id FROM goods_receipts gr JOIN purchase_orders po ON gr.po_id = po.id WHERE po.notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM goods_receipts WHERE po_id IN (SELECT id FROM purchase_orders WHERE notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM purchase_order_items WHERE po_id IN (SELECT id FROM purchase_orders WHERE notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM purchase_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]);
    console.log('  → Partial batch cleared (stock quantities reversed)');
  }

  // FX rates
  const fxRow = await pool.query('SELECT fx_gbp_to_aed, fx_usd_to_aed, fx_inr_to_aed FROM company_settings LIMIT 1');
  const FX: Record<string, number> = {
    GBP: parseFloat(fxRow.rows[0].fx_gbp_to_aed),
    USD: parseFloat(fxRow.rows[0].fx_usd_to_aed),
    INR: parseFloat(fxRow.rows[0].fx_inr_to_aed),
  };

  // Suppliers by region
  const ukSups = (await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%United Kingdom%' AND is_active=true`)).rows.map(r => r.id);
  const usSups = (await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%United States%' AND is_active=true`)).rows.map(r => r.id);
  const inSups = (await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%India%' AND is_active=true`)).rows.map(r => r.id);
  const allSups = (await pool.query(`SELECT id FROM suppliers WHERE is_active=true`)).rows.map(r => r.id);

  // Products by currency
  const gbpProds = (await pool.query(`SELECT id FROM products WHERE cost_price_currency='GBP' AND is_active=true`)).rows.map(r => r.id);
  const usdProds = (await pool.query(`SELECT id FROM products WHERE cost_price_currency='USD' AND is_active=true`)).rows.map(r => r.id);
  const inrProds = (await pool.query(`SELECT id FROM products WHERE cost_price_currency='INR' AND is_active=true`)).rows.map(r => r.id);
  const allProds = (await pool.query(`SELECT id FROM products WHERE is_active=true`)).rows.map(r => r.id);

  console.log(`  UK:${ukSups.length} US:${usSups.length} IN:${inSups.length} suppliers`);
  console.log(`  GBP:${gbpProds.length} USD:${usdProds.length} INR:${inrProds.length} products`);

  // Build 300 specs: 120 GBP, 90 USD, 90 INR × (years + statuses)
  // Status mix: 50 Draft, 100 Submitted, 150 Closed
  type Currency = 'GBP' | 'USD' | 'INR';
  type Status = 'draft' | 'submitted' | 'closed';

  // Target: 120 GBP / 90 USD / 90 INR  ×  50 Draft / 100 Submitted / 150 Closed
  // GBP (20D, 40S, 60C = 120): 2025→(5D,10S,15C=30), 2026→(10D,20S,30C=60), 2027→(5D,10S,15C=30)
  // USD (15D, 30S, 45C = 90):  2025→(3D,7S,10C=20),  2026→(8D,15S,22C=45),  2027→(4D,8S,13C=25)
  // INR same as USD
  const PLAN: Array<[Currency, number, Status, number]> = [
    ['GBP', 2025, 'draft', 5],  ['GBP', 2025, 'submitted', 10], ['GBP', 2025, 'closed', 15],
    ['GBP', 2026, 'draft', 10], ['GBP', 2026, 'submitted', 20], ['GBP', 2026, 'closed', 30],
    ['GBP', 2027, 'draft', 5],  ['GBP', 2027, 'submitted', 10], ['GBP', 2027, 'closed', 15],
    ['USD', 2025, 'draft', 3],  ['USD', 2025, 'submitted', 7],  ['USD', 2025, 'closed', 10],
    ['USD', 2026, 'draft', 8],  ['USD', 2026, 'submitted', 15], ['USD', 2026, 'closed', 22],
    ['USD', 2027, 'draft', 4],  ['USD', 2027, 'submitted', 8],  ['USD', 2027, 'closed', 13],
    ['INR', 2025, 'draft', 3],  ['INR', 2025, 'submitted', 7],  ['INR', 2025, 'closed', 10],
    ['INR', 2026, 'draft', 8],  ['INR', 2026, 'submitted', 15], ['INR', 2026, 'closed', 22],
    ['INR', 2027, 'draft', 4],  ['INR', 2027, 'submitted', 8],  ['INR', 2027, 'closed', 13],
  ];
  // Verify plan totals: GBP=120, USD=90, INR=90; Draft=50, Submitted=100, Closed=150
  const planCheck = PLAN.reduce((acc, [cur,, st, n]) => {
    acc[cur] = (acc[cur] || 0) + n;
    acc[st] = (acc[st] || 0) + n;
    return acc;
  }, {} as Record<string, number>);
  if (planCheck.GBP !== 120 || planCheck.USD !== 90 || planCheck.INR !== 90 ||
      planCheck.draft !== 50 || planCheck.submitted !== 100 || planCheck.closed !== 150) {
    console.error('  ✗ PLAN totals wrong:', planCheck);
    process.exit(1);
  }
  console.log('  PLAN: GBP=120, USD=90, INR=90 | Draft=50, Submitted=100, Closed=150');

  // Build specs array
  const specs: PoSpec[] = [];
  for (const [cur, yr, st, count] of PLAN) {
    const suppPool = cur === 'GBP' ? (ukSups.length > 0 ? ukSups : allSups) :
                     cur === 'USD' ? (usSups.length > 0 ? usSups : allSups) :
                                     (inSups.length > 0 ? inSups : allSups);
    const prodPool = cur === 'GBP' ? (gbpProds.length > 0 ? gbpProds : allProds) :
                     cur === 'USD' ? (usdProds.length > 0 ? usdProds : allProds) :
                                     (inrProds.length > 0 ? inrProds : allProds);
    for (let i = 0; i < count; i++) {
      specs.push({ currency: cur, year: yr, status: st, supplierId: pick(suppPool), prodIds: prodPool, fxRate: FX[cur] });
    }
  }

  // Shuffle
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [specs[i], specs[j]] = [specs[j], specs[i]];
  }

  // Price ranges per currency (in that currency)
  const priceRange: Record<string, [number, number]> = {
    GBP: [5, 200], USD: [5, 200], INR: [150, 8000],
  };

  let created = 0, failed = 0;
  const counters: Record<string, number> = { GBP: 0, USD: 0, INR: 0 };
  const statusCts: Record<string, number> = { draft: 0, submitted: 0, closed: 0 };
  const createdIds: number[] = [];

  for (const spec of specs) {
    const { currency, year, status, supplierId, prodIds, fxRate } = spec;
    const [minP, maxP] = priceRange[currency];

    // Build 2–5 line items
    const lineCount = rand(2, 5);
    const items: Array<{ productId: number; quantity: number; unitPrice: string; lineTotal: string }> = [];
    for (let i = 0; i < lineCount; i++) {
      const productId = pick(prodIds);
      const qty = rand(5, 100);
      const unitPrice = randDec(minP, maxP, 2);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      items.push({ productId, quantity: qty, unitPrice: unitPrice.toFixed(2), lineTotal: lineTotal.toFixed(2) });
    }

    const { status: httpStatus, data } = await apiPost('/api/purchase-orders', {
      supplierId,
      orderDate: dateInYear(year),
      status,
      currency,
      fxRateToAed: fxRate.toFixed(4),
      notes: `${SEED_TAG} ${currency} purchase order — ${year}`,
      items,
    }, cookie);

    if (httpStatus === 201) {
      created++;
      counters[currency]++;
      statusCts[status]++;
      createdIds.push(data.id);
      if (created % 50 === 0) console.log(`  → ${created}/300 POs created...`);
    } else {
      failed++;
      if (failed <= 3) console.error(`  ✗ PO ${created + failed}: ${JSON.stringify(data).substring(0, 80)}`);
    }
  }

  console.log(`  ✓ Created: ${created}, Failed: ${failed}`);
  console.log(`  Currency: GBP=${counters.GBP}, USD=${counters.USD}, INR=${counters.INR}`);
  console.log(`  Status: Draft=${statusCts.draft}, Submitted=${statusCts.submitted}, Closed=${statusCts.closed}`);

  // Strict post-creation check — verify exact distribution before GRNs alter statuses
  let distOk = true;
  if (counters.GBP !== 120) { distOk = false; console.error(`  ✗ GBP: got ${counters.GBP}, need 120`); }
  if (counters.USD !== 90)  { distOk = false; console.error(`  ✗ USD: got ${counters.USD}, need 90`); }
  if (counters.INR !== 90)  { distOk = false; console.error(`  ✗ INR: got ${counters.INR}, need 90`); }
  if (statusCts.draft !== 50)      { distOk = false; console.error(`  ✗ Draft: got ${statusCts.draft}, need 50`); }
  if (statusCts.submitted !== 100) { distOk = false; console.error(`  ✗ Submitted: got ${statusCts.submitted}, need 100`); }
  if (statusCts.closed !== 150)    { distOk = false; console.error(`  ✗ Closed: got ${statusCts.closed}, need 150`); }
  if (!distOk) { console.error('  ✗ Distribution check failed — exiting'); process.exit(1); }
  console.log('  ✓ Distribution correct: GBP=120, USD=90, INR=90 | Draft=50, Submitted=100, Closed=150');

  return createdIds;
}

// ─── 5. Goods Receipts (via POST /api/goods-receipts) ────────────────────────

async function seedGoodsReceipts(cookie: string, poIds: number[]) {
  console.log('\n── Goods receipts (~100 via API) ──────────────────────────');

  // Idempotency — count only GRNs linked to SEED-55 POs (not total GRNs in DB)
  const seedGrnCount = await pool.query(
    `SELECT COUNT(*) FROM goods_receipts gr
     JOIN purchase_orders po ON gr.po_id = po.id
     WHERE po.notes LIKE $1`, [`${SEED_TAG}%`]
  );
  const existingGrns = parseInt(seedGrnCount.rows[0].count);
  const GRN_TARGET = 100;
  if (existingGrns >= GRN_TARGET) {
    console.log(`  → Already have ${existingGrns} GRNs for seed POs (>= ${GRN_TARGET}) — skipping`);
    return;
  }
  const remaining = GRN_TARGET - existingGrns;
  console.log(`  Creating ${remaining} GRNs (existing: ${existingGrns}, target: ${GRN_TARGET})`);

  // Find POs from this seed batch that already have a GRN (to skip on rerun)
  const doneSet = new Set<number>(
    (await pool.query(
      `SELECT DISTINCT gr.po_id FROM goods_receipts gr
       JOIN purchase_orders po ON gr.po_id = po.id
       WHERE po.notes LIKE $1`, [`${SEED_TAG}%`]
    )).rows.map(r => parseInt(r.po_id))
  );

  // Candidate POs: MUST be submitted or closed (not draft) and not yet receipted
  let eligible: number[];
  if (poIds.length > 0) {
    // Query DB to confirm status — do NOT rely on in-memory poIds which includes drafts
    const placeholders = poIds.map((_, i) => `$${i + 1}`).join(',');
    const rows = (await pool.query(
      `SELECT id FROM purchase_orders WHERE id IN (${placeholders}) AND status IN ('submitted','closed') ORDER BY id`,
      poIds
    )).rows.map(r => parseInt(r.id));
    eligible = rows.filter(id => !doneSet.has(id)).slice(0, remaining);
  } else {
    // Fallback for reruns: query from DB by seed tag
    const rows = (await pool.query(
      `SELECT id FROM purchase_orders WHERE notes LIKE $1 AND status IN ('submitted','closed') ORDER BY id`,
      [`${SEED_TAG}%`]
    )).rows.map(r => parseInt(r.id));
    eligible = rows.filter(id => !doneSet.has(id)).slice(0, remaining);
  }
  console.log(`  Eligible POs (submitted/closed, no GRN yet): ${eligible.length}`);

  let created = 0, failed = 0;

  for (const poId of eligible) {
    const itemsRes = await pool.query(
      `SELECT id, product_id, quantity, unit_price FROM purchase_order_items WHERE po_id = $1`, [poId]
    );
    if (itemsRes.rows.length === 0) continue;

    const items = itemsRes.rows.map(row => ({
      poItemId: row.id,
      productId: row.product_id,
      orderedQuantity: row.quantity,
      receivedQuantity: row.quantity,
      unitPrice: parseFloat(row.unit_price),
    }));

    const { status } = await apiPost('/api/goods-receipts', {
      poId,
      items,
      notes: `${SEED_TAG} Goods received — full quantity`,
      forceClose: true,
    }, cookie);

    if (status === 201) {
      created++;
      if (created % 20 === 0) console.log(`  → ${created} GRNs created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ GRNs created: ${created}, Failed: ${failed}`);
}

// ─── Verification ────────────────────────────────────────────────────────────

async function verify(cookie: string) {
  console.log('\n── Verification ───────────────────────────────────────────');

  const [fyRes, poAllRes, poSeedRes, grnRes, smRes, csRes] = await Promise.all([
    pool.query('SELECT year, status FROM financial_years ORDER BY year'),
    pool.query('SELECT currency, status, COUNT(*) as cnt FROM purchase_orders WHERE notes LIKE $1 GROUP BY currency, status ORDER BY currency, status', [`${SEED_TAG}%`]),
    pool.query(`SELECT COUNT(*) as total, COUNT(CASE WHEN currency='GBP' THEN 1 END) as gbp, COUNT(CASE WHEN currency='USD' THEN 1 END) as usd, COUNT(CASE WHEN currency='INR' THEN 1 END) as inr FROM purchase_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]),
    pool.query(`SELECT COUNT(*) FROM goods_receipts gr JOIN purchase_orders po ON gr.po_id = po.id WHERE po.notes LIKE $1`, [`${SEED_TAG}%`]),
    pool.query(`SELECT COUNT(*) FROM stock_movements sm JOIN goods_receipts gr ON sm.reference_id = gr.id JOIN purchase_orders po ON gr.po_id = po.id WHERE sm.reference_type = 'goods_receipt' AND po.notes LIKE $1`, [`${SEED_TAG}%`]),
    pool.query('SELECT company_name, po_number_prefix, do_number_prefix FROM company_settings LIMIT 1'),
  ]);

  const fyMap = new Map(fyRes.rows.map(r => [parseInt(r.year), r.status as string]));
  let pass = true;

  // Only validate the three target years; other years are irrelevant to this seed
  const targetYears = [2025, 2026, 2027];
  console.log('  Financial years (target: 2025=Closed, 2026=Open, 2027=Open):');
  fyRes.rows.forEach(r => {
    const yr = parseInt(r.year);
    if (!targetYears.includes(yr)) {
      console.log(`    ${yr}: ${r.status} (not in scope — skipped)`);
      return;
    }
    const ok = (yr === 2025 && r.status === 'Closed') || (yr !== 2025 && r.status === 'Open');
    if (!ok) pass = false;
    console.log(`    ${yr}: ${r.status} ${ok ? '✓' : '✗'}`);
  });

  // ── Currency totals (exact)
  const seeds = poSeedRes.rows[0];
  const totGBP = parseInt(seeds.gbp), totUSD = parseInt(seeds.usd), totINR = parseInt(seeds.inr);
  const totAll = parseInt(seeds.total);
  console.log(`  Seed POs: total=${totAll} GBP=${totGBP} USD=${totUSD} INR=${totINR}`);
  if (totAll !== 300)  { pass = false; console.log('  ✗ Need exactly 300 seed POs'); }
  if (totGBP !== 120) { pass = false; console.log(`  ✗ GBP: got ${totGBP}, need 120`); }
  if (totUSD !== 90)  { pass = false; console.log(`  ✗ USD: got ${totUSD}, need 90`); }
  if (totINR !== 90)  { pass = false; console.log(`  ✗ INR: got ${totINR}, need 90`); }

  // ── Status distribution (note: some submitted POs may become closed after GRNs)
  const statusMap: Record<string, number> = {};
  poAllRes.rows.forEach(r => { statusMap[r.status] = (statusMap[r.status] || 0) + parseInt(r.cnt); });
  console.log('  By currency/status:');
  poAllRes.rows.forEach(r => console.log(`    ${r.currency} ${r.status}: ${r.cnt}`));
  const draftCt = statusMap['draft'] ?? 0;
  // Draft POs should not change (only submitted/closed are affected by GRNs)
  if (draftCt !== 50) { pass = false; console.log(`  ✗ Draft: got ${draftCt}, need 50`); }
  else console.log(`  ✓ Draft: ${draftCt} (exact)`);
  // Submitted+Closed combined = 250 (100+150 originally; GRNs can move submitted → closed)
  const nonDraft = (statusMap['submitted'] ?? 0) + (statusMap['closed'] ?? 0);
  if (nonDraft !== 250) { pass = false; console.log(`  ✗ Submitted+Closed: got ${nonDraft}, need 250`); }
  else console.log(`  ✓ Submitted+Closed: ${nonDraft} (exact)`);

  // ── GRN target: 100 (verify at least 100 exist for seed POs)
  const grnCount = parseInt(grnRes.rows[0].count);
  const grnOk = grnCount >= 100;
  console.log(`  GRNs (seed): ${grnCount} ${grnOk ? '✓' : '✗ (need >= 100)'}`);
  if (!grnOk) pass = false;
  const smCount = parseInt(smRes.rows[0].count);
  const smOk = smCount >= 5;
  console.log(`  Stock movements (seed GRNs): ${smCount} ${smOk ? '✓' : '✗ (need >= 5)'}`);
  if (!smOk) pass = false;
  console.log(`  Company: ${csRes.rows[0].company_name}`);

  // Check company name
  if (csRes.rows[0].company_name !== 'Aroma Essence Trading LLC') {
    pass = false; console.log('  ✗ Company name mismatch');
  } else console.log('  ✓ Company name OK');

  // Check financial years presence
  if (!fyMap.has(2025) || !fyMap.has(2026) || !fyMap.has(2027)) {
    pass = false; console.log('  ✗ Missing financial years');
  }
  if (fyMap.get(2025) !== 'Closed') { pass = false; console.log('  ✗ 2025 not Closed'); }
  if (fyMap.get(2026) !== 'Open') { pass = false; console.log('  ✗ 2026 not Open'); }
  if (fyMap.get(2027) !== 'Open') { pass = false; console.log('  ✗ 2027 not Open'); }

  // Prefix convention: stored as "PO"/"DO" (no trailing dash); server's generatePoNumber()
  //  adds "-" separator producing "PO-001". Prefix "PO-AE" produces "PO-AE-001" (clean format).
  console.log(`  Prefix (company settings): "${csRes.rows[0].po_number_prefix}" → generates "PO-NNN" format`);

  if (pass) console.log('\n  ✓ All verification checks passed');
  else { console.error('\n  ✗ Verification FAILED'); process.exit(1); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' FLOW Purchasing Seeder — Task #55');
  console.log('═══════════════════════════════════════════════════════════');

  const cookie = await login();

  await seedFinancialYears(cookie);
  await updateCompanySettings(cookie);

  // Prefix test needs a supplier and product
  const supRow = await pool.query('SELECT id FROM suppliers WHERE is_active=true LIMIT 1');
  const prodRow = await pool.query('SELECT id FROM products WHERE is_active=true LIMIT 1');
  if (supRow.rows.length > 0 && prodRow.rows.length > 0) {
    await testPrefixChange(cookie, supRow.rows[0].id, prodRow.rows[0].id);
  }

  const poIds = await seedPurchaseOrders(cookie);
  await seedGoodsReceipts(cookie, poIds);
  await verify(cookie);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Purchasing seeding complete!');
  console.log('═══════════════════════════════════════════════════════════');

  await pool.end();
}

main().catch(err => { console.error('\n✗ Fatal error:', err); pool.end(); process.exit(1); });
