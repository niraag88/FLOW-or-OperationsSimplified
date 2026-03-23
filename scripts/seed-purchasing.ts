/**
 * FLOW — Task #55: Purchasing Seed Script
 *
 * Creates:
 *  1. Financial years: 2025 (Closed), 2026 (Open), 2027 (Open)
 *  2. Company settings: Aroma Essence Trading LLC
 *  3. Prefix change test: PO-AE- / DO-AE- then restored
 *  4. 300 purchase orders (120 GBP, 90 USD, 90 INR), statuses: 50 Draft / 100 Submitted / 150 Closed
 *  5. ~100 GRNs via API (for submitted/closed POs)
 *
 * Run: npx tsx scripts/seed-purchasing.ts
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = 'http://localhost:5000';
const USERNAME = 'admin';
const PASSWORD = 'admin123';

// ─── Helpers ────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDec = (min: number, max: number, dp = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));

function pastDate(maxDaysAgo: number, minDaysAgo = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - rand(minDaysAgo, maxDaysAgo));
  return d;
}

function dateInYear(year: number): Date {
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);
  const ms = start.getTime() + Math.random() * (end.getTime() - start.getTime());
  return new Date(ms);
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const cookie = r.headers.get('set-cookie') ?? '';
  if (!cookie) throw new Error('Login failed — no cookie returned');
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
  const years = Array.isArray(existing) ? existing as Array<{ id: number; year: number; status: string }> : [];
  const yearMap = new Map(years.map((y) => [y.year, y]));

  // Create 2025, 2026, 2027 if missing
  for (const yr of [2025, 2026, 2027]) {
    if (!yearMap.has(yr)) {
      const { status, data } = await apiPost('/api/books', {
        year: yr,
        start_date: `${yr}-01-01`,
        end_date: `${yr}-12-31`,
      }, cookie);
      if (status === 201) {
        console.log(`  ✓ Created financial year ${yr}`);
        yearMap.set(yr, data);
      } else {
        console.error(`  ✗ Failed to create ${yr}:`, data);
      }
    } else {
      console.log(`  → Financial year ${yr} already exists (${yearMap.get(yr)!.status})`);
    }
  }

  // Close 2025 if not already closed
  const fy2025 = yearMap.get(2025);
  if (fy2025 && fy2025.status !== 'Closed') {
    const { status } = await apiPut(`/api/books/${fy2025.id}`, { status: 'Closed' }, cookie);
    if (status === 200) console.log('  ✓ Closed financial year 2025');
    else console.error('  ✗ Failed to close 2025');
  } else if (fy2025?.status === 'Closed') {
    console.log('  → Financial year 2025 already Closed');
  }

  // Ensure 2026 and 2027 are Open
  for (const yr of [2026, 2027]) {
    const fy = yearMap.get(yr);
    if (fy && fy.status !== 'Open') {
      await apiPut(`/api/books/${fy.id}`, { status: 'Open' }, cookie);
      console.log(`  ✓ Reopened financial year ${yr}`);
    }
  }

  // Refresh and show final state
  const { data: final } = await apiGet('/api/books', cookie);
  const finalYears = Array.isArray(final) ? final as Array<{ year: number; status: string }> : [];
  console.log('  Final state:');
  finalYears.sort((a, b) => a.year - b.year).forEach(y => console.log(`    ${y.year}: ${y.status}`));
}

// ─── 2. Company Settings ─────────────────────────────────────────────────────

async function updateCompanySettings(cookie: string) {
  console.log('\n── Company settings ───────────────────────────────────────');

  const { status, data } = await apiPut('/api/company-settings', {
    companyName: 'Aroma Essence Trading LLC',
    address: 'Office 812, The Prism Tower, Business Bay, Dubai, UAE',
    phone: '+971 4 123 4567',
    email: 'info@aromaessence.ae',
    website: 'www.aromaessence.ae',
    vatNumber: '100345678900003',
    taxNumber: 'TRN-100345678900003',
    poNumberPrefix: 'PO-',
    doNumberPrefix: 'DO-',
    nextPoNumber: 1,
    nextDoNumber: 1,
    nextInvoiceNumber: 1,
    nextQuotationNumber: 1,
    nextGrnNumber: 1,
  }, cookie);

  if (status === 200) {
    console.log(`  ✓ Company updated: ${data.companyName}`);
    console.log(`  ✓ PO prefix: ${data.poNumberPrefix}, next: ${data.nextPoNumber}`);
  } else {
    console.error('  ✗ Failed to update company settings:', data);
  }
}

// ─── 3. Prefix Change Test ────────────────────────────────────────────────────

async function testPrefixChange(cookie: string, supplierId: number, productId: number) {
  console.log('\n── Prefix change test ─────────────────────────────────────');

  // Change prefix to PO-AE-
  await apiPut('/api/company-settings', { poNumberPrefix: 'PO-AE-', doNumberPrefix: 'DO-AE-' }, cookie);
  console.log('  → Changed prefix to PO-AE- / DO-AE-');

  // Create a test PO
  const { status, data } = await apiPost('/api/purchase-orders', {
    supplierId,
    orderDate: new Date().toISOString().slice(0, 10),
    status: 'draft',
    currency: 'GBP',
    fxRateToAed: '4.8500',
    notes: '[PREFIX-TEST] Created to verify prefix change',
    items: [{ productId, quantity: 5, unitPrice: '12.00', lineTotal: '60.00' }],
  }, cookie);

  if (status === 201) {
    const poNum = data.poNumber || data.po_number || '?';
    const ok = poNum.startsWith('PO-AE-');
    console.log(`  ${ok ? '✓' : '✗'} Test PO created: ${poNum} (prefix ${ok ? 'correct' : 'WRONG'})`);
  } else {
    console.error('  ✗ Test PO creation failed:', data);
  }

  // Restore original prefix
  await apiPut('/api/company-settings', { poNumberPrefix: 'PO-', doNumberPrefix: 'DO-' }, cookie);
  console.log('  → Restored prefixes to PO- / DO-');
}

// ─── 4. Purchase Orders (direct SQL) ─────────────────────────────────────────

interface PoSpec {
  year: number;
  currency: 'GBP' | 'USD' | 'INR';
  status: 'draft' | 'submitted' | 'closed';
}

async function seedPurchaseOrders(adminId: string): Promise<number[]> {
  console.log('\n── Purchase orders (300 total) ────────────────────────────');

  // Idempotency check: skip if we already have >= 300 seeded POs (not test POs)
  const existingCount = await pool.query(`SELECT COUNT(*) FROM purchase_orders WHERE notes NOT LIKE '%[PREFIX-TEST]%'`);
  const existing = parseInt(existingCount.rows[0].count);
  if (existing >= 300) {
    console.log(`  → Already have ${existing} POs — skipping creation`);
    // Return existing IDs for GRN creation
    const ids = await pool.query(`SELECT id FROM purchase_orders WHERE status IN ('submitted','closed') ORDER BY id`);
    return ids.rows.map(r => r.id);
  }

  // FX rates from DB
  const fxRows = await pool.query('SELECT fx_gbp_to_aed, fx_usd_to_aed, fx_inr_to_aed FROM company_settings LIMIT 1');
  const FX: Record<string, number> = {
    GBP: parseFloat(fxRows.rows[0].fx_gbp_to_aed),
    USD: parseFloat(fxRows.rows[0].fx_usd_to_aed),
    INR: parseFloat(fxRows.rows[0].fx_inr_to_aed),
  };
  console.log(`  FX: GBP=${FX.GBP}, USD=${FX.USD}, INR=${FX.INR}`);

  // Supplier IDs by region
  const ukSupRow = await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%United Kingdom%' AND is_active=true ORDER BY random() LIMIT 30`);
  const usSupRow = await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%United States%' AND is_active=true ORDER BY random() LIMIT 20`);
  const inSupRow = await pool.query(`SELECT id FROM suppliers WHERE address ILIKE '%India%' AND is_active=true ORDER BY random() LIMIT 20`);
  const allSupRow = await pool.query(`SELECT id FROM suppliers WHERE is_active=true ORDER BY random() LIMIT 80`);

  const ukIds = ukSupRow.rows.map(r => r.id);
  const usIds = usSupRow.rows.map(r => r.id);
  const inIds = inSupRow.rows.map(r => r.id);
  const allIds = allSupRow.rows.map(r => r.id);

  // Product IDs by cost_price_currency (prefer matching currency)
  const gbpProds = await pool.query(`SELECT id FROM products WHERE cost_price_currency='GBP' AND is_active=true`);
  const usdProds = await pool.query(`SELECT id FROM products WHERE cost_price_currency='USD' AND is_active=true`);
  const inrProds = await pool.query(`SELECT id FROM products WHERE cost_price_currency='INR' AND is_active=true`);
  const allProds = await pool.query(`SELECT id FROM products WHERE is_active=true`);

  const gbpProdIds = gbpProds.rows.map(r => r.id);
  const usdProdIds = usdProds.rows.map(r => r.id);
  const inrProdIds = inrProds.rows.map(r => r.id);
  const allProdIds = allProds.rows.map(r => r.id);

  console.log(`  UK suppliers: ${ukIds.length}, US: ${usIds.length}, India: ${inIds.length}`);
  console.log(`  GBP products: ${gbpProdIds.length}, USD: ${usdProdIds.length}, INR: ${inrProdIds.length}`);

  // Build 300 PO specs: 120 GBP, 90 USD, 90 INR
  // Spread across years: 2025=~100, 2026=~150, 2027=~50
  // Status: Draft=50, Submitted=100, Closed=150
  const specs: PoSpec[] = [];

  function pushSpec(currency: 'GBP' | 'USD' | 'INR', year: number, status: 'draft' | 'submitted' | 'closed') {
    specs.push({ currency, year, status });
  }

  // GBP: 30 2025 (10D,10S,10C), 60 2026 (15D,15S,30C), 30 2027 (10D,10S,10C)
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2025, 'draft');
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2025, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2025, 'closed');
  for (let i = 0; i < 15; i++) pushSpec('GBP', 2026, 'draft');
  for (let i = 0; i < 15; i++) pushSpec('GBP', 2026, 'submitted');
  for (let i = 0; i < 30; i++) pushSpec('GBP', 2026, 'closed');
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2027, 'draft');
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2027, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('GBP', 2027, 'closed');
  // USD: 20 2025, 45 2026, 25 2027
  for (let i = 0; i < 5; i++) pushSpec('USD', 2025, 'draft');
  for (let i = 0; i < 5; i++) pushSpec('USD', 2025, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('USD', 2025, 'closed');
  for (let i = 0; i < 10; i++) pushSpec('USD', 2026, 'draft');
  for (let i = 0; i < 15; i++) pushSpec('USD', 2026, 'submitted');
  for (let i = 0; i < 20; i++) pushSpec('USD', 2026, 'closed');
  for (let i = 0; i < 5; i++) pushSpec('USD', 2027, 'draft');
  for (let i = 0; i < 10; i++) pushSpec('USD', 2027, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('USD', 2027, 'closed');
  // INR: 20 2025, 45 2026, 25 2027
  for (let i = 0; i < 5; i++) pushSpec('INR', 2025, 'draft');
  for (let i = 0; i < 5; i++) pushSpec('INR', 2025, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('INR', 2025, 'closed');
  for (let i = 0; i < 10; i++) pushSpec('INR', 2026, 'draft');
  for (let i = 0; i < 15; i++) pushSpec('INR', 2026, 'submitted');
  for (let i = 0; i < 20; i++) pushSpec('INR', 2026, 'closed');
  for (let i = 0; i < 5; i++) pushSpec('INR', 2027, 'draft');
  for (let i = 0; i < 10; i++) pushSpec('INR', 2027, 'submitted');
  for (let i = 0; i < 10; i++) pushSpec('INR', 2027, 'closed');

  // Shuffle for natural ordering
  for (let i = specs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [specs[i], specs[j]] = [specs[j], specs[i]];
  }

  // Get current next_po_number
  const settingRow = await pool.query('SELECT next_po_number, po_number_prefix FROM company_settings LIMIT 1');
  let nextPoNum = parseInt(settingRow.rows[0].next_po_number);
  const prefix = settingRow.rows[0].po_number_prefix || 'PO-';

  // Price ranges per currency
  const priceRange: Record<string, [number, number]> = {
    GBP: [5, 200],
    USD: [5, 200],
    INR: [150, 8000],
  };

  let created = 0, failed = 0;
  const newPoIds: number[] = [];
  const counters = { GBP: 0, USD: 0, INR: 0 };
  const statusCounts = { draft: 0, submitted: 0, closed: 0 };

  for (const spec of specs) {
    const { currency, year, status } = spec;

    // Choose supplier
    let suppIds = currency === 'GBP' ? ukIds : currency === 'USD' ? usIds : inIds;
    if (suppIds.length === 0) suppIds = allIds;
    const supplierId = pick(suppIds);

    // Choose products (prefer matching currency)
    let prodPool = currency === 'GBP' ? gbpProdIds : currency === 'USD' ? usdProdIds : inrProdIds;
    if (prodPool.length === 0) prodPool = allProdIds;

    // Generate 2–5 line items
    const lineCount = rand(2, 5);
    const [minPrice, maxPrice] = priceRange[currency];

    const items: { productId: number; qty: number; unitPrice: number; lineTotal: number }[] = [];
    for (let i = 0; i < lineCount; i++) {
      const productId = pick(prodPool);
      const qty = rand(5, 100);
      const unitPrice = randDec(minPrice, maxPrice, 2);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      items.push({ productId, qty, unitPrice, lineTotal });
    }

    const totalAmount = parseFloat(items.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const fx = FX[currency];
    const grandTotal = parseFloat((totalAmount * fx).toFixed(2));
    const vatAmount = 0;
    const orderDate = dateInYear(year);
    const poNumber = `${prefix}${String(nextPoNum).padStart(4, '0')}`;
    nextPoNum++;

    try {
      const poRes = await pool.query(
        `INSERT INTO purchase_orders
           (po_number, supplier_id, status, order_date, total_amount, vat_amount, grand_total,
            currency, fx_rate_to_aed, notes, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          poNumber, supplierId, status, orderDate,
          totalAmount.toFixed(2), vatAmount.toFixed(2), grandTotal.toFixed(2),
          currency, fx.toFixed(4),
          `${currency} purchase order — ${year}`,
          adminId, orderDate, new Date(),
        ]
      );
      const poId = poRes.rows[0].id;
      newPoIds.push(poId);

      for (const item of items) {
        await pool.query(
          `INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, line_total, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [poId, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2), new Date()]
        );
      }

      created++;
      counters[currency]++;
      statusCounts[status]++;
      if (created % 50 === 0) console.log(`  → ${created} POs created...`);
    } catch (err) {
      failed++;
      console.error(`  ✗ Failed PO ${poNumber}:`, err);
    }
  }

  // Update company settings next_po_number
  await pool.query('UPDATE company_settings SET next_po_number = $1 WHERE id = 1', [nextPoNum]);

  console.log(`  ✓ Created: ${created}, Failed: ${failed}`);
  console.log(`  Currency: GBP=${counters.GBP}, USD=${counters.USD}, INR=${counters.INR}`);
  console.log(`  Status: Draft=${statusCounts.draft}, Submitted=${statusCounts.submitted}, Closed=${statusCounts.closed}`);
  return newPoIds;
}

// ─── 5. Goods Receipts (via API) ─────────────────────────────────────────────

async function seedGoodsReceipts(cookie: string, poIds: number[]) {
  console.log('\n── Goods receipts (~100 via API) ──────────────────────────');

  // Idempotency check
  const existingGrns = await pool.query('SELECT COUNT(*) FROM goods_receipts');
  if (parseInt(existingGrns.rows[0].count) >= 80) {
    console.log(`  → Already have ${existingGrns.rows[0].count} GRNs — skipping`);
    return;
  }

  // Get submitted+closed POs from our batch
  if (poIds.length === 0) {
    console.log('  No PO IDs available');
    return;
  }
  const placeholders = poIds.map((_, i) => `$${i + 1}`).join(',');
  const eligibleRes = await pool.query(
    `SELECT id FROM purchase_orders WHERE id IN (${placeholders}) AND status IN ('submitted', 'closed') ORDER BY random() LIMIT 100`,
    poIds
  );

  const eligible = eligibleRes.rows.map(r => r.id);
  console.log(`  Eligible POs for GRN: ${eligible.length}`);

  let created = 0, failed = 0;

  for (const poId of eligible) {
    // Get PO items
    const itemsRes = await pool.query(
      `SELECT id, product_id, quantity, unit_price FROM purchase_order_items WHERE po_id = $1`,
      [poId]
    );
    if (itemsRes.rows.length === 0) continue;

    const items = itemsRes.rows.map(row => ({
      poItemId: row.id,
      productId: row.product_id,
      orderedQuantity: row.quantity,
      receivedQuantity: row.quantity, // Full receipt
      unitPrice: parseFloat(row.unit_price),
    }));

    const { status } = await apiPost('/api/goods-receipts', {
      poId,
      items,
      notes: 'Goods received — full quantity',
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

  const [fyRes, poRes, grnRes, csRes] = await Promise.all([
    pool.query('SELECT year, status FROM financial_years ORDER BY year'),
    pool.query('SELECT currency, status, COUNT(*) as cnt FROM purchase_orders GROUP BY currency, status ORDER BY currency, status'),
    pool.query('SELECT COUNT(*) FROM goods_receipts'),
    pool.query('SELECT company_name, po_number_prefix, do_number_prefix FROM company_settings LIMIT 1'),
  ]);

  console.log('  Financial years:');
  fyRes.rows.forEach(r => console.log(`    ${r.year}: ${r.status}`));
  
  console.log('  PO totals by currency & status:');
  const totals: Record<string, number> = { GBP: 0, USD: 0, INR: 0 };
  fyRes.rows; // just to use the variable
  poRes.rows.forEach(r => {
    console.log(`    ${r.currency} ${r.status}: ${r.cnt}`);
    totals[r.currency] = (totals[r.currency] || 0) + parseInt(r.cnt);
  });
  const totalPos = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(`  Total POs: ${totalPos} ${totalPos >= 300 ? '✓' : '✗ (need >= 300)'}`);
  console.log(`  GRNs: ${grnRes.rows[0].count}`);
  console.log(`  Company: ${csRes.rows[0].company_name}`);
  console.log(`  PO prefix: ${csRes.rows[0].po_number_prefix}`);

  let pass = totalPos >= 300 && parseInt(grnRes.rows[0].count) >= 50;
  // Check financial years
  const fyMap = new Map(fyRes.rows.map(r => [parseInt(r.year), r.status]));
  if (fyMap.get(2025) !== 'Closed') { console.log('  ✗ 2025 not Closed'); pass = false; }
  else console.log('  ✓ 2025 Closed');
  if (fyMap.get(2026) !== 'Open') { console.log('  ✗ 2026 not Open'); pass = false; }
  else console.log('  ✓ 2026 Open');
  if (fyMap.get(2027) !== 'Open') { console.log('  ✗ 2027 not Open'); pass = false; }
  else console.log('  ✓ 2027 Open');
  
  if (pass) console.log('\n  ✓ All verification checks passed');
  else { console.error('\n  ✗ Verification FAILED'); process.exit(1); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' FLOW Purchasing Seeder — Task #55');
  console.log('═══════════════════════════════════════════════════════════');

  const cookie = await login();

  // Get admin user ID
  const adminRow = await pool.query(`SELECT id FROM users WHERE role='Admin' LIMIT 1`);
  const adminId = adminRow.rows[0].id;

  await seedFinancialYears(cookie);
  await updateCompanySettings(cookie);

  // Prefix test needs a supplier and product
  const supRow = await pool.query('SELECT id FROM suppliers WHERE is_active=true LIMIT 1');
  const prodRow = await pool.query('SELECT id FROM products WHERE is_active=true LIMIT 1');
  if (supRow.rows.length > 0 && prodRow.rows.length > 0) {
    await testPrefixChange(cookie, supRow.rows[0].id, prodRow.rows[0].id);
  }

  const newPoIds = await seedPurchaseOrders(adminId);
  await seedGoodsReceipts(cookie, newPoIds);
  await verify(cookie);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Purchasing seeding complete!');
  console.log('═══════════════════════════════════════════════════════════');

  await pool.end();
}

main().catch(err => { console.error('\n✗ Fatal error:', err); pool.end(); process.exit(1); });
