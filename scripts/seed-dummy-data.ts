/**
 * FLOW — Dummy Data Seed Script
 *
 * Populates the database with large volumes of [TEST]-tagged dummy data for
 * stress-testing. All test records can be identified and removed cleanly.
 *
 * ============================================================
 * CLEANUP SQL  (run in this exact order to remove ALL test data)
 * ============================================================
 *
 *   DELETE FROM audit_log
 *     WHERE actor_name LIKE 'test_%';
 *
 *   DELETE FROM stock_movements
 *     WHERE notes LIKE '%[TEST]%';
 *
 *   DELETE FROM delivery_order_items
 *     WHERE do_id IN (SELECT id FROM delivery_orders WHERE order_number LIKE 'DO-TEST-%');
 *
 *   DELETE FROM delivery_orders
 *     WHERE order_number LIKE 'DO-TEST-%';
 *
 *   DELETE FROM invoice_line_items
 *     WHERE invoice_id IN (SELECT id FROM invoices WHERE invoice_number LIKE 'INV-TEST-%');
 *
 *   DELETE FROM invoices
 *     WHERE invoice_number LIKE 'INV-TEST-%';
 *
 *   DELETE FROM quotation_items
 *     WHERE quote_id IN (SELECT id FROM quotations WHERE quote_number LIKE 'QUO-TEST-%');
 *
 *   DELETE FROM quotations
 *     WHERE quote_number LIKE 'QUO-TEST-%';
 *
 *   DELETE FROM purchase_order_items
 *     WHERE po_id IN (SELECT id FROM purchase_orders WHERE po_number LIKE 'PO-TEST-%');
 *
 *   DELETE FROM purchase_orders
 *     WHERE po_number LIKE 'PO-TEST-%';
 *
 *   DELETE FROM products
 *     WHERE sku LIKE 'TST-%';
 *
 *   DELETE FROM customers
 *     WHERE name LIKE '[TEST]%';
 *
 *   DELETE FROM suppliers
 *     WHERE name LIKE '[TEST]%';
 *
 *   DELETE FROM brands
 *     WHERE name LIKE '[TEST]%';
 *
 *   DELETE FROM users
 *     WHERE username LIKE 'test_%';
 *
 * ============================================================
 * Run:  npx tsx scripts/seed-dummy-data.ts
 *
 * NOTE: This script is NOT idempotent — it uses fixed usernames, SKUs, and
 * document numbers that will fail on unique-constraint errors if run a second
 * time without first running the cleanup SQL above. Always clean up test data
 * before re-running.
 * ============================================================
 */

import pkg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── helpers ────────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDec = (min: number, max: number, dp = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));

/** Return a Date in the past, between 0 and maxDaysAgo days ago */
const pastDate = (maxDaysAgo: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, maxDaysAgo));
  return d;
};

/** ISO date string yyyy-mm-dd */
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Pad number to 4 digits */
const pad4 = (n: number) => String(n).padStart(4, '0');

/** Batch an array into chunks of size n */
const chunk = <T>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function batchInsert(
  table: string,
  cols: string[],
  rows: unknown[][],
  returning?: string
): Promise<unknown[]> {
  if (rows.length === 0) return [];
  const results: unknown[] = [];
  for (const ch of chunk(rows, 100)) {
    let paramIdx = 1;
    const placeholders = ch
      .map((row) => `(${row.map(() => `$${paramIdx++}`).join(', ')})`)
      .join(', ');
    const flat = ch.flat();
    const q = `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${placeholders}${
      returning ? ` RETURNING ${returning}` : ''
    }`;
    const res = await pool.query(q, flat);
    if (returning) results.push(...res.rows);
  }
  return results;
}

// ─── data definitions ────────────────────────────────────────────────────────

const BRAND_NAMES = [
  '[TEST] Aromatics International',
  '[TEST] Pure Botanics Ltd',
  '[TEST] Nature Essence Co',
  '[TEST] Wellness Collective',
  '[TEST] Essential Guild',
  '[TEST] Botanical Harmony',
  '[TEST] Alpine Extracts',
  '[TEST] Zen Naturals',
  '[TEST] Heritage Oils',
  '[TEST] Ocean Botanics',
  '[TEST] Desert Rose Aromas',
  '[TEST] Floral Science',
  '[TEST] Terra Botanica',
  '[TEST] Organic Roots',
  '[TEST] Lotus Naturals',
  '[TEST] Green Valley Oils',
  '[TEST] Sunflower Botanics',
  '[TEST] Crystal Wellness',
  '[TEST] Meridian Extracts',
  '[TEST] Cascade Naturals',
];

const SUPPLIER_NAMES = [
  '[TEST] UK Botanicals Ltd',
  '[TEST] French Aromatics SA',
  '[TEST] Indian Herb Traders',
  '[TEST] Morocco Oils Export',
  '[TEST] Australian Botanics Pty',
  '[TEST] Bulgarian Rose Farm',
  '[TEST] Egyptian Jasmine Co',
  '[TEST] Sri Lanka Spices Ltd',
  '[TEST] Turkish Rose Oil',
  '[TEST] Brazilian Copaiba Co',
  '[TEST] Italian Bergamot SRL',
  '[TEST] German Camomile GmbH',
  '[TEST] Indonesian Ylang Corp',
  '[TEST] South Africa Oils Ltd',
  '[TEST] Madagascar Vanilla Co',
  '[TEST] Nepal Himalayan Herbs',
  '[TEST] Peru Botanics SAC',
  '[TEST] Canada Spruce Oils',
  '[TEST] China Botanicals Ltd',
  '[TEST] New Zealand Manuka Co',
];

const CUSTOMER_NAMES = [
  '[TEST] Jumeirah Beach Hotel',
  '[TEST] Atlantis The Palm',
  '[TEST] Burj Al Arab Suites',
  '[TEST] Four Seasons DIFC',
  '[TEST] Ritz-Carlton JBR',
  '[TEST] Sofitel Dubai Downtown',
  '[TEST] Waldorf Astoria DIFC',
  '[TEST] Kempinski Mall Emirates',
  '[TEST] Hyatt Regency Creek',
  '[TEST] InterContinental Festival',
  '[TEST] Raffles Dubai',
  '[TEST] One&Only Royal Mirage',
  '[TEST] Shangri-La Sheikh Zayed',
  '[TEST] Hilton Al Habtoor',
  '[TEST] Grand Hyatt Garhoud',
  '[TEST] W Hotel The Palm',
  '[TEST] Le Méridien Dubai',
  '[TEST] Conrad Dubai',
  '[TEST] Renaissance Downtown',
  '[TEST] Pullman Dubai Creek',
  '[TEST] Al Maha Desert Resort',
  '[TEST] Bab Al Shams',
  '[TEST] Armani Hotel Dubai',
  '[TEST] Palace Downtown',
  '[TEST] Address Boulevard',
  '[TEST] Vida Downtown',
  '[TEST] FIVE Palm Jumeirah',
  '[TEST] Oberoi Dubai',
  '[TEST] Taj Dubai',
  '[TEST] Habtoor Palace',
  '[TEST] Crowne Plaza Marina',
  '[TEST] DoubleTree JBR',
  '[TEST] Courtyard Downtown',
  '[TEST] Holiday Inn Al Safa',
  '[TEST] Radisson Blu DWTC',
  '[TEST] Mövenpick Hotel JLT',
  '[TEST] Swiss-Belhotel Marina',
  '[TEST] Novotel Al Barsha',
  '[TEST] Ibis World Trade',
  '[TEST] Premier Inn Al Jaddaf',
  '[TEST] Copthorne Hotel Deira',
  '[TEST] Ramada by Wyndham',
  '[TEST] Flora Grand Hotel',
  '[TEST] City Seasons Towers',
  '[TEST] Golden Tulip Al Barsha',
  '[TEST] Carlton Palace Hotel',
  '[TEST] York International',
  '[TEST] Dubai Marina Hotel',
  '[TEST] Lotus Grand Hotel',
  '[TEST] Spa & Wellness Centre LLC',
];

const TEST_USERS = [
  { username: 'test_sarah', firstName: '[TEST] Sarah', lastName: 'Mitchell', role: 'Staff' },
  { username: 'test_james', firstName: '[TEST] James', lastName: 'Thornton', role: 'Staff' },
  { username: 'test_amira', firstName: '[TEST] Amira', lastName: 'Hassan', role: 'Staff' },
  { username: 'test_carlos', firstName: '[TEST] Carlos', lastName: 'Reyes', role: 'Staff' },
  { username: 'test_priya', firstName: '[TEST] Priya', lastName: 'Patel', role: 'Staff' },
  { username: 'test_oliver', firstName: '[TEST] Oliver', lastName: 'Shaw', role: 'Manager' },
  { username: 'test_fatima', firstName: '[TEST] Fatima', lastName: 'Al-Rashidi', role: 'Manager' },
  { username: 'test_michael', firstName: '[TEST] Michael', lastName: 'Burns', role: 'Staff' },
  { username: 'test_lena', firstName: '[TEST] Lena', lastName: 'Kovacs', role: 'Staff' },
  { username: 'test_ali', firstName: '[TEST] Ali', lastName: 'Saeed', role: 'Staff' },
];

const PRODUCT_CATEGORIES = [
  'Essential Oils',
  'Carrier Oils',
  'Massage Blends',
  'Bath Salts',
  'Body Butters',
  'Diffuser Blends',
  'Roll-ons',
  'Balms & Salves',
  'Hydrosols',
  'Supplements',
];

const PRODUCT_BASES = [
  { name: 'Lavender Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml', '250ml'], basePrice: 45 },
  { name: 'Peppermint Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml'], basePrice: 38 },
  { name: 'Tea Tree Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml', '250ml'], basePrice: 42 },
  { name: 'Eucalyptus Essential Oil', unit: 'pcs', sizes: ['30ml', '100ml', '250ml', '500ml'], basePrice: 35 },
  { name: 'Frankincense Essential Oil', unit: 'pcs', sizes: ['5ml', '10ml', '30ml'], basePrice: 120 },
  { name: 'Rose Otto Essential Oil', unit: 'pcs', sizes: ['5ml', '10ml', '30ml'], basePrice: 280 },
  { name: 'Ylang Ylang Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml'], basePrice: 55 },
  { name: 'Bergamot Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml', '250ml'], basePrice: 48 },
  { name: 'Chamomile Essential Oil', unit: 'pcs', sizes: ['5ml', '10ml', '30ml'], basePrice: 95 },
  { name: 'Lemon Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml'], basePrice: 32 },
  { name: 'Geranium Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml', '100ml'], basePrice: 52 },
  { name: 'Clary Sage Essential Oil', unit: 'pcs', sizes: ['10ml', '30ml'], basePrice: 68 },
  { name: 'Sweet Almond Carrier Oil', unit: 'pcs', sizes: ['100ml', '250ml', '500ml', '1L', '5L'], basePrice: 28 },
  { name: 'Jojoba Carrier Oil', unit: 'pcs', sizes: ['50ml', '100ml', '250ml', '500ml'], basePrice: 55 },
  { name: 'Rosehip Carrier Oil', unit: 'pcs', sizes: ['30ml', '50ml', '100ml', '250ml'], basePrice: 72 },
  { name: 'Coconut Fractionated Oil', unit: 'pcs', sizes: ['100ml', '250ml', '500ml', '1L'], basePrice: 32 },
  { name: 'Argan Carrier Oil', unit: 'pcs', sizes: ['30ml', '50ml', '100ml'], basePrice: 88 },
  { name: 'Hemp Seed Carrier Oil', unit: 'pcs', sizes: ['100ml', '250ml', '500ml'], basePrice: 45 },
  { name: 'Avocado Carrier Oil', unit: 'pcs', sizes: ['100ml', '250ml', '500ml', '1L'], basePrice: 38 },
  { name: 'Grapeseed Carrier Oil', unit: 'pcs', sizes: ['100ml', '250ml', '500ml', '1L'], basePrice: 25 },
  { name: 'Relaxation Massage Blend', unit: 'pcs', sizes: ['100ml', '250ml', '500ml'], basePrice: 65 },
  { name: 'Energy Boost Massage Blend', unit: 'pcs', sizes: ['100ml', '250ml', '500ml'], basePrice: 68 },
  { name: 'Sports Recovery Massage Blend', unit: 'pcs', sizes: ['100ml', '250ml', '500ml'], basePrice: 72 },
  { name: 'Deep Tissue Massage Blend', unit: 'pcs', sizes: ['100ml', '250ml', '500ml'], basePrice: 78 },
  { name: 'Himalayan Pink Bath Salts', unit: 'pcs', sizes: ['500g', '1kg', '5kg'], basePrice: 35 },
  { name: 'Epsom Bath Salts', unit: 'pcs', sizes: ['500g', '1kg', '5kg'], basePrice: 28 },
  { name: 'Dead Sea Bath Salts', unit: 'pcs', sizes: ['500g', '1kg'], basePrice: 42 },
  { name: 'Lavender Bath Salts', unit: 'pcs', sizes: ['500g', '1kg'], basePrice: 48 },
  { name: 'Shea Body Butter', unit: 'pcs', sizes: ['100g', '200g', '500g'], basePrice: 55 },
  { name: 'Cocoa Body Butter', unit: 'pcs', sizes: ['100g', '200g', '500g'], basePrice: 48 },
  { name: 'Mango Body Butter', unit: 'pcs', sizes: ['100g', '200g'], basePrice: 52 },
  { name: 'Serenity Diffuser Blend', unit: 'pcs', sizes: ['30ml', '100ml'], basePrice: 58 },
  { name: 'Focus Diffuser Blend', unit: 'pcs', sizes: ['30ml', '100ml'], basePrice: 55 },
  { name: 'Sleep Well Diffuser Blend', unit: 'pcs', sizes: ['30ml', '100ml'], basePrice: 62 },
  { name: 'Immunity Diffuser Blend', unit: 'pcs', sizes: ['30ml', '100ml'], basePrice: 65 },
  { name: 'Calm Roll-On', unit: 'pcs', sizes: ['10ml'], basePrice: 42 },
  { name: 'Focus Roll-On', unit: 'pcs', sizes: ['10ml'], basePrice: 42 },
  { name: 'Sleep Roll-On', unit: 'pcs', sizes: ['10ml'], basePrice: 45 },
  { name: 'Muscle Relief Balm', unit: 'pcs', sizes: ['50g', '100g'], basePrice: 58 },
  { name: 'Foot Refresh Balm', unit: 'pcs', sizes: ['50g', '100g'], basePrice: 52 },
  { name: 'Headache Relief Balm', unit: 'pcs', sizes: ['30g', '50g'], basePrice: 48 },
  { name: 'Rose Hydrosol', unit: 'pcs', sizes: ['100ml', '250ml'], basePrice: 38 },
  { name: 'Lavender Hydrosol', unit: 'pcs', sizes: ['100ml', '250ml'], basePrice: 35 },
  { name: 'Witch Hazel Hydrosol', unit: 'pcs', sizes: ['100ml', '250ml'], basePrice: 32 },
];

const INVOICE_STATUSES = ['draft', 'submitted', 'sent', 'delivered'];
const PO_STATUSES = ['draft', 'sent', 'confirmed', 'received', 'cancelled'];
const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'rejected', 'expired'];
const DO_STATUSES = ['draft', 'submitted', 'delivered'];

const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE'];
const AUDIT_TARGET_TYPES = ['invoice', 'purchase_order', 'quotation', 'delivery_order', 'product', 'customer'];

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Starting seed...');

  // ── 1. Brands ──────────────────────────────────────────────────────────────
  console.log('\n[1/11] Inserting 20 test brands...');
  const brandRows = BRAND_NAMES.map((name, i) => [
    name,
    `[TEST] Specialist supplier of premium aromatherapy and wellness products.`,
    null,
    `https://www.${name.toLowerCase().replace(/[\[\]\s]+/g, '').replace('[test]', 'test')}.example.com`,
    `[TEST] Contact ${i + 1}`,
    `contact${i + 1}@testbrand${i + 1}.example.com`,
    `+971 ${rand(50, 59)} ${rand(1000000, 9999999)}`,
    i + 10,
    true,
    new Date(),
    new Date(),
  ]);
  const brandResults = (await batchInsert(
    'brands',
    ['name', 'description', 'logo', 'website', 'contact_person', 'contact_email', 'contact_phone', 'sort_order', 'is_active', 'created_at', 'updated_at'],
    brandRows,
    'id'
  )) as { id: number }[];
  const testBrandIds = brandResults.map((r) => r.id);
  console.log(`  → inserted ${testBrandIds.length} brands (IDs: ${testBrandIds[0]}–${testBrandIds[testBrandIds.length - 1]})`);

  // ── 2. Suppliers ───────────────────────────────────────────────────────────
  console.log('\n[2/11] Inserting 20 test suppliers...');
  const supplierRows = SUPPLIER_NAMES.map((name, i) => [
    name,
    `[TEST] Procurement ${i + 1}`,
    `procurement${i + 1}@testsupplier.example.com`,
    `+44 20 ${rand(10000000, 99999999)}`,
    `[TEST] ${rand(1, 200)} Industrial Area, Zone ${rand(1, 10)}, UK`,
    `GB${rand(100000000, 999999999)}`,
    String(pick([14, 30, 45, 60])),
    true,
    new Date(),
    new Date(),
  ]);
  const supplierResults = (await batchInsert(
    'suppliers',
    ['name', 'contact_person', 'email', 'phone', 'address', 'vat_number', 'payment_terms', 'is_active', 'created_at', 'updated_at'],
    supplierRows,
    'id'
  )) as { id: number }[];
  const testSupplierIds = supplierResults.map((r) => r.id);
  console.log(`  → inserted ${testSupplierIds.length} suppliers`);

  // ── 3. Customers ───────────────────────────────────────────────────────────
  console.log('\n[3/11] Inserting 50 test customers...');
  const customerRows = CUSTOMER_NAMES.map((name, i) => {
    const creditLimit = randDec(5000, 200000);
    return [
      name,
      `[TEST] Procurement Manager ${i + 1}`,
      `procurement${i + 1}@testhotel${i + 1}.ae`,
      `+971 4 ${rand(3000000, 3999999)}`,
      `[TEST] ${rand(1, 999)} Sheikh Zayed Road, Dubai, UAE`,
      `[TEST] ${rand(1, 999)} Sheikh Zayed Road, Dubai, UAE`,
      `TRN10041${String(i).padStart(5, '0')}`,
      'standard',
      String(pick([14, 30, 45, 60])),
      creditLimit.toFixed(2),
      true,
      pastDate(730),
      new Date(),
    ];
  });
  const customerResults = (await batchInsert(
    'customers',
    ['name', 'contact_person', 'email', 'phone', 'billing_address', 'shipping_address', 'vat_number', 'vat_treatment', 'payment_terms', 'credit_limit', 'is_active', 'created_at', 'updated_at'],
    customerRows,
    'id'
  )) as { id: number }[];
  const testCustomerIds = customerResults.map((r) => r.id);
  console.log(`  → inserted ${testCustomerIds.length} customers`);

  // ── 4. Users ───────────────────────────────────────────────────────────────
  console.log('\n[4/11] Inserting 10 test users...');
  const hashedPw = await bcrypt.hash('Test@1234', 10);
  const userRows = TEST_USERS.map((u) => [
    u.username,
    hashedPw,
    u.role,
    u.firstName,
    u.lastName,
    `${u.username}@flowtest.example.com`,
    true,
    pastDate(365),
    null,
    null,
  ]);
  const userResults = (await batchInsert(
    'users',
    ['username', 'password', 'role', 'first_name', 'last_name', 'email', 'active', 'created_at', 'last_login', 'created_by'],
    userRows,
    'id'
  )) as { id: string }[];
  const testUserIds = userResults.map((r) => r.id);
  // Dynamically resolve an existing admin user — never hardcode UUIDs
  const adminResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'Admin' AND username NOT LIKE 'test_%' LIMIT 1`
  );
  if (adminResult.rows.length === 0) throw new Error('No non-test Admin user found in DB');
  const adminId = adminResult.rows[0].id;
  const allCreatorIds = [adminId, ...testUserIds];
  console.log(`  → inserted ${testUserIds.length} users`);

  // ── 5. Products ────────────────────────────────────────────────────────────
  console.log('\n[5/11] Inserting ~175 test products...');
  const productRows: unknown[][] = [];
  let skuCounter = 1;

  // Expand product bases × sizes until we have 175 products
  for (const base of PRODUCT_BASES) {
    for (const size of base.sizes) {
      if (productRows.length >= 175) break;
      const brandId = pick(testBrandIds);
      const sizeMultiplier =
        size.includes('5L') || size.includes('5kg') ? 8
        : size.includes('1L') || size.includes('1kg') ? 4
        : size.includes('500') ? 3
        : size.includes('250') ? 2
        : size.includes('100') || size.includes('200') ? 1.2
        : 1;
      const unitPrice = parseFloat((base.basePrice * sizeMultiplier * (1 + randDec(-0.1, 0.15, 2))).toFixed(2));
      const costPrice = parseFloat((unitPrice * randDec(0.45, 0.65, 2)).toFixed(2));
      const stockQty = rand(0, 500);
      const cat = PRODUCT_CATEGORIES[Math.floor(skuCounter / 18) % PRODUCT_CATEGORIES.length];
      productRows.push([
        `TST-${String(skuCounter).padStart(4, '0')}`,
        `[TEST] ${base.name} ${size}`,
        `[TEST] Premium quality ${base.name.toLowerCase()} in ${size} size. Suitable for professional aromatherapy use.`,
        brandId,
        cat,
        size,
        unitPrice.toFixed(2),
        costPrice.toFixed(2),
        '5.00',
        'pcs',
        stockQty,
        10,
        stockQty + rand(200, 800),
        true,
        pastDate(365),
        new Date(),
      ]);
      skuCounter++;
    }
    if (productRows.length >= 175) break;
  }

  // If we still need more, add generic products
  while (productRows.length < 175) {
    const brandId = pick(testBrandIds);
    const unitPrice = randDec(20, 600);
    productRows.push([
      `TST-${String(skuCounter).padStart(4, '0')}`,
      `[TEST] Aromatherapy Product ${skuCounter}`,
      `[TEST] High-quality aromatherapy product for professional use.`,
      brandId,
      pick(PRODUCT_CATEGORIES),
      pick(['30ml', '100ml', '250ml', '500g', '1kg']),
      unitPrice.toFixed(2),
      (unitPrice * 0.55).toFixed(2),
      '5.00',
      'pcs',
      rand(0, 200),
      10,
      500,
      true,
      pastDate(365),
      new Date(),
    ]);
    skuCounter++;
  }

  const productResults = (await batchInsert(
    'products',
    ['sku', 'name', 'description', 'brand_id', 'category', 'size', 'unit_price', 'cost_price', 'vat_rate', 'unit', 'stock_quantity', 'min_stock_level', 'max_stock_level', 'is_active', 'created_at', 'updated_at'],
    productRows,
    'id'
  )) as { id: number; unit_price: string }[];
  const testProductIds = productResults.map((r) => r.id);
  console.log(`  → inserted ${testProductIds.length} products`);

  // Build quick price lookup (productRows[i][6] is unit_price)
  const productPrice: Record<number, number> = {};
  productResults.forEach((p, i) => {
    productPrice[p.id] = parseFloat(productRows[i][6] as string);
  });

  // ── 6. Purchase Orders ─────────────────────────────────────────────────────
  console.log('\n[6/11] Inserting 300 test purchase orders...');
  const poRows: unknown[][] = [];
  for (let i = 1; i <= 300; i++) {
    const orderDate = pastDate(720);
    const expectedDelivery = new Date(orderDate);
    expectedDelivery.setDate(expectedDelivery.getDate() + rand(7, 45));
    const status = pick(PO_STATUSES);
    poRows.push([
      `PO-TEST-${pad4(i)}`,
      pick(testBrandIds),
      status,
      orderDate,
      expectedDelivery,
      '0.00',
      '0.00',
      '0.00',
      '[TEST] Auto-generated purchase order for stress testing.',
      null,
      pick(allCreatorIds),
      orderDate,
      orderDate,
    ]);
  }
  const poResults = (await batchInsert(
    'purchase_orders',
    ['po_number', 'supplier_id', 'status', 'order_date', 'expected_delivery', 'total_amount', 'vat_amount', 'grand_total', 'notes', 'object_key', 'created_by', 'created_at', 'updated_at'],
    poRows,
    'id, status'
  )) as { id: number; status: string }[];
  console.log(`  → inserted ${poResults.length} purchase orders`);

  // PO items
  console.log('     Inserting PO line items...');
  type ReceivedItem = { productId: number; qty: number; unitPrice: number; poId: number };
  const poItemRows: unknown[][] = [];
  const poTotals: Record<number, { total: number; vat: number }> = {};
  const receivedPoItems: ReceivedItem[] = [];
  for (const po of poResults) {
    const itemCount = rand(2, 6);
    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const prodId = pick(testProductIds);
      const qty = rand(5, 100);
      const unitPrice = productPrice[prodId] || randDec(20, 300);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      const vatRate = 5;
      // For received POs, set received_quantity = quantity (full receipt)
      const receivedQty = po.status === 'received' ? qty : 0;
      total += lineTotal;
      poItemRows.push([po.id, prodId, qty, unitPrice.toFixed(2), vatRate.toFixed(2), lineTotal.toFixed(2), receivedQty, new Date()]);
      if (po.status === 'received') {
        receivedPoItems.push({ productId: prodId, qty, unitPrice, poId: po.id });
      }
    }
    const vat = parseFloat((total * 0.05).toFixed(2));
    poTotals[po.id] = { total, vat };
  }
  await batchInsert(
    'purchase_order_items',
    ['po_id', 'product_id', 'quantity', 'unit_price', 'vat_rate', 'line_total', 'received_quantity', 'created_at'],
    poItemRows
  );
  console.log(`  → inserted ${poItemRows.length} PO line items (${receivedPoItems.length} in received POs)`);

  // Update PO totals
  for (const [poId, t] of Object.entries(poTotals)) {
    const grand = (t.total + t.vat).toFixed(2);
    await pool.query(
      'UPDATE purchase_orders SET total_amount=$1, vat_amount=$2, grand_total=$3 WHERE id=$4',
      [t.total.toFixed(2), t.vat.toFixed(2), grand, Number(poId)]
    );
  }

  // ── 7. Quotations ──────────────────────────────────────────────────────────
  console.log('\n[7/11] Inserting 250 test quotations...');
  const quoteRows: unknown[][] = [];
  for (let i = 1; i <= 250; i++) {
    const quoteDate = pastDate(720);
    const validUntil = new Date(quoteDate);
    validUntil.setDate(validUntil.getDate() + rand(14, 90));
    quoteRows.push([
      `QUO-TEST-${pad4(i)}`,
      pick(testCustomerIds),
      pick(QUOTE_STATUSES),
      quoteDate,
      validUntil,
      '0.00',
      '0.00',
      '0.00',
      '[TEST] Auto-generated quotation for stress testing.',
      false,
      'All prices are in AED and inclusive of 5% VAT where applicable.',
      null,
      null,
      null,
      pick(allCreatorIds),
      quoteDate,
      quoteDate,
    ]);
  }
  const quoteResults = (await batchInsert(
    'quotations',
    ['quote_number', 'customer_id', 'status', 'quote_date', 'valid_until', 'total_amount', 'vat_amount', 'grand_total', 'notes', 'show_remarks', 'terms', 'reference', 'reference_date', 'object_key', 'created_by', 'created_at', 'updated_at'],
    quoteRows,
    'id'
  )) as { id: number }[];
  console.log(`  → inserted ${quoteResults.length} quotations`);

  // Quotation items
  console.log('     Inserting quotation line items...');
  const quoteItemRows: unknown[][] = [];
  const quoteTotals: Record<number, { total: number; vat: number }> = {};
  for (const q of quoteResults) {
    const itemCount = rand(1, 4);
    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const prodId = pick(testProductIds);
      const qty = rand(1, 50);
      const unitPrice = productPrice[prodId] || randDec(20, 300);
      const discount = pick([0, 0, 0, 5, 10]);
      const lineTotal = parseFloat((qty * unitPrice * (1 - discount / 100)).toFixed(2));
      total += lineTotal;
      quoteItemRows.push([q.id, prodId, qty, unitPrice.toFixed(2), discount.toFixed(2), '5.00', lineTotal.toFixed(2), new Date()]);
    }
    const vat = parseFloat((total * 0.05).toFixed(2));
    quoteTotals[q.id] = { total, vat };
  }
  await batchInsert(
    'quotation_items',
    ['quote_id', 'product_id', 'quantity', 'unit_price', 'discount', 'vat_rate', 'line_total', 'created_at'],
    quoteItemRows
  );
  console.log(`  → inserted ${quoteItemRows.length} quotation line items`);

  for (const [qId, t] of Object.entries(quoteTotals)) {
    const grand = (t.total + t.vat).toFixed(2);
    await pool.query(
      'UPDATE quotations SET total_amount=$1, vat_amount=$2, grand_total=$3 WHERE id=$4',
      [t.total.toFixed(2), t.vat.toFixed(2), grand, Number(qId)]
    );
  }

  // ── 8. Invoices ────────────────────────────────────────────────────────────
  console.log('\n[8/11] Inserting 500 test invoices...');
  const invoiceRows: unknown[][] = [];
  for (let i = 1; i <= 500; i++) {
    const invDate = pastDate(720);
    const customerId = pick(testCustomerIds);
    const customerIdx = testCustomerIds.indexOf(customerId);
    const customerName = CUSTOMER_NAMES[customerIdx] || '[TEST] Customer';
    invoiceRows.push([
      `INV-TEST-${pad4(i)}`,
      customerName,
      customerId,
      '0.00',
      pick(INVOICE_STATUSES),
      isoDate(invDate),
      `REF-${rand(1000, 9999)}`,
      null,
      '0.00',
      '[TEST] Auto-generated invoice for stress testing.',
      'AED',
      null,
      null,
      invDate,
      false,
    ]);
  }
  const invoiceResults = (await batchInsert(
    'invoices',
    ['invoice_number', 'customer_name', 'customer_id', 'amount', 'status', 'invoice_date', 'reference', 'reference_date', 'vat_amount', 'notes', 'currency', 'object_key', 'scan_key', 'created_at', 'legal_hold'],
    invoiceRows,
    'id'
  )) as { id: number }[];
  console.log(`  → inserted ${invoiceResults.length} invoices`);

  // Invoice line items
  console.log('     Inserting invoice line items...');
  const invoiceItemRows: unknown[][] = [];
  const invoiceTotals: Record<number, { total: number; vat: number }> = {};
  for (const inv of invoiceResults) {
    const itemCount = rand(1, 5);
    let total = 0;
    for (let j = 0; j < itemCount; j++) {
      const prodId = pick(testProductIds);
      const qty = rand(1, 30);
      const unitPrice = productPrice[prodId] || randDec(20, 300);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      total += lineTotal;
      invoiceItemRows.push([inv.id, prodId, null, `TST-${rand(1, 9999).toString().padStart(4, '0')}`, `[TEST] Product`, qty, unitPrice.toFixed(2), lineTotal.toFixed(2), new Date()]);
    }
    const vat = parseFloat((total * 0.05).toFixed(2));
    invoiceTotals[inv.id] = { total, vat };
  }
  await batchInsert(
    'invoice_line_items',
    ['invoice_id', 'product_id', 'brand_id', 'product_code', 'description', 'quantity', 'unit_price', 'line_total', 'created_at'],
    invoiceItemRows
  );
  console.log(`  → inserted ${invoiceItemRows.length} invoice line items`);

  for (const [invId, t] of Object.entries(invoiceTotals)) {
    await pool.query(
      'UPDATE invoices SET amount=$1, vat_amount=$2 WHERE id=$3',
      [t.total.toFixed(2), t.vat.toFixed(2), Number(invId)]
    );
  }

  // ── 9. Delivery Orders ─────────────────────────────────────────────────────
  console.log('\n[9/11] Inserting 200 test delivery orders...');
  const doRows: unknown[][] = [];
  for (let i = 1; i <= 200; i++) {
    const orderDate = pastDate(720);
    const customerId = pick(testCustomerIds);
    const customerIdx = testCustomerIds.indexOf(customerId);
    const customerName = CUSTOMER_NAMES[customerIdx] || '[TEST] Customer';
    doRows.push([
      `DO-TEST-${pad4(i)}`,
      customerName,
      customerId,
      `[TEST] ${rand(1, 999)} Sheikh Zayed Road, Dubai, UAE`,
      pick(DO_STATUSES),
      isoDate(orderDate),
      `REF-${rand(1000, 9999)}`,
      null,
      '0.00',
      '0.00',
      '0.00',
      'AED',
      '[TEST] Auto-generated delivery order for stress testing.',
      '0.0500',
      null,
      null,
      orderDate,
      false,
    ]);
  }
  const doResults = (await batchInsert(
    'delivery_orders',
    ['order_number', 'customer_name', 'customer_id', 'delivery_address', 'status', 'order_date', 'reference', 'reference_date', 'subtotal', 'tax_amount', 'total_amount', 'currency', 'notes', 'tax_rate', 'object_key', 'scan_key', 'created_at', 'legal_hold'],
    doRows,
    'id'
  )) as { id: number }[];
  console.log(`  → inserted ${doResults.length} delivery orders`);

  // DO items
  console.log('     Inserting delivery order line items...');
  const doItemRows: unknown[][] = [];
  const doTotals: Record<number, { sub: number; tax: number }> = {};
  for (const doOrder of doResults) {
    const itemCount = rand(1, 4);
    let sub = 0;
    for (let j = 0; j < itemCount; j++) {
      const prodId = pick(testProductIds);
      const qty = rand(1, 30);
      const unitPrice = productPrice[prodId] || randDec(20, 300);
      const lineTotal = parseFloat((qty * unitPrice).toFixed(2));
      sub += lineTotal;
      doItemRows.push([doOrder.id, prodId, null, `TST-${rand(1, 9999).toString().padStart(4, '0')}`, `[TEST] Product`, qty, unitPrice.toFixed(2), lineTotal.toFixed(2), new Date()]);
    }
    const tax = parseFloat((sub * 0.05).toFixed(2));
    doTotals[doOrder.id] = { sub, tax };
  }
  await batchInsert(
    'delivery_order_items',
    ['do_id', 'product_id', 'brand_id', 'product_code', 'description', 'quantity', 'unit_price', 'line_total', 'created_at'],
    doItemRows
  );
  console.log(`  → inserted ${doItemRows.length} delivery order line items`);

  for (const [doId, t] of Object.entries(doTotals)) {
    const total = (t.sub + t.tax).toFixed(2);
    await pool.query(
      'UPDATE delivery_orders SET subtotal=$1, tax_amount=$2, total_amount=$3 WHERE id=$4',
      [t.sub.toFixed(2), t.tax.toFixed(2), total, Number(doId)]
    );
  }

  // ── 10. Stock Movements ────────────────────────────────────────────────────
  // One stock_movement per received PO item, using the exact product/quantity from each item.
  console.log('\n[10/11] Inserting stock movements for received PO items...');
  const smRows: unknown[][] = [];
  for (const item of receivedPoItems) {
    const prevStock = rand(0, 200);
    const newStock = prevStock + item.qty;
    smRows.push([
      item.productId,
      'goods_receipt',
      item.poId,
      'goods_receipt',
      item.qty,
      prevStock,
      newStock,
      item.unitPrice.toFixed(2),
      `[TEST] Stock received per PO item`,
      adminId,
      pastDate(180),
    ]);
  }
  if (smRows.length > 0) {
    await batchInsert(
      'stock_movements',
      ['product_id', 'movement_type', 'reference_id', 'reference_type', 'quantity', 'previous_stock', 'new_stock', 'unit_cost', 'notes', 'created_by', 'created_at'],
      smRows
    );
  }
  console.log(`  → inserted ${smRows.length} stock movements (one per received PO item)`);

  // ── 11. Audit Log ──────────────────────────────────────────────────────────
  console.log('\n[11/11] Inserting ~500 audit log entries...');
  const auditRows: unknown[][] = [];

  // PO audit entries
  for (let i = 0; i < Math.min(100, poResults.length); i++) {
    const po = poResults[i];
    const userId = pick(testUserIds);
    const userName = TEST_USERS[testUserIds.indexOf(userId)]?.username || 'test_user';
    auditRows.push([
      userId, userName, String(po.id), 'purchase_order', null, 'CREATE',
      `[TEST] Purchase order PO-TEST-${pad4(i + 1)} created`,
      pastDate(700),
    ]);
  }

  // Invoice audit entries
  for (let i = 0; i < Math.min(150, invoiceResults.length); i++) {
    const inv = invoiceResults[i];
    const userId = pick(testUserIds);
    const userName = TEST_USERS[testUserIds.indexOf(userId)]?.username || 'test_user';
    auditRows.push([
      userId, userName, String(inv.id), 'invoice', null, pick(['CREATE', 'UPDATE']),
      `[TEST] Invoice INV-TEST-${pad4(i + 1)} ${i % 3 === 0 ? 'updated' : 'created'}`,
      pastDate(700),
    ]);
  }

  // Quotation audit entries
  for (let i = 0; i < Math.min(100, quoteResults.length); i++) {
    const q = quoteResults[i];
    const userId = pick(testUserIds);
    const userName = TEST_USERS[testUserIds.indexOf(userId)]?.username || 'test_user';
    auditRows.push([
      userId, userName, String(q.id), 'quotation', null, pick(['CREATE', 'UPDATE']),
      `[TEST] Quotation QUO-TEST-${pad4(i + 1)} ${i % 4 === 0 ? 'updated' : 'created'}`,
      pastDate(700),
    ]);
  }

  // DO audit entries
  for (let i = 0; i < Math.min(100, doResults.length); i++) {
    const doOrder = doResults[i];
    const userId = pick(testUserIds);
    const userName = TEST_USERS[testUserIds.indexOf(userId)]?.username || 'test_user';
    auditRows.push([
      userId, userName, String(doOrder.id), 'delivery_order', null, 'CREATE',
      `[TEST] Delivery order DO-TEST-${pad4(i + 1)} created`,
      pastDate(700),
    ]);
  }

  // Product audit entries
  for (let i = 0; i < 50; i++) {
    const prodId = pick(testProductIds);
    const userId = pick(testUserIds);
    const userName = TEST_USERS[testUserIds.indexOf(userId)]?.username || 'test_user';
    auditRows.push([
      userId, userName, String(prodId), 'product', null, pick(['CREATE', 'UPDATE']),
      `[TEST] Product TST-${pad4(i + 1)} ${i % 3 === 0 ? 'updated' : 'created'}`,
      pastDate(365),
    ]);
  }

  await batchInsert(
    'audit_log',
    ['actor', 'actor_name', 'target_id', 'target_type', 'object_key', 'action', 'details', 'timestamp'],
    auditRows
  );
  console.log(`  → inserted ${auditRows.length} audit log entries`);

  // ── Update company settings counters ──────────────────────────────────────
  console.log('\nUpdating company settings next-number counters...');
  await pool.query(`
    UPDATE company_settings
    SET next_po_number = GREATEST(next_po_number, 350),
        next_do_number = GREATEST(next_do_number, 250),
        next_invoice_number = GREATEST(next_invoice_number, 550),
        next_quotation_number = GREATEST(next_quotation_number, 300)
  `);
  console.log('  → done');

  // ── Final counts ───────────────────────────────────────────────────────────
  const counts = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM brands WHERE name LIKE '[TEST]%') as brands,
      (SELECT COUNT(*) FROM suppliers WHERE name LIKE '[TEST]%') as suppliers,
      (SELECT COUNT(*) FROM customers WHERE name LIKE '[TEST]%') as customers,
      (SELECT COUNT(*) FROM users WHERE username LIKE 'test_%') as users,
      (SELECT COUNT(*) FROM products WHERE sku LIKE 'TST-%') as products,
      (SELECT COUNT(*) FROM purchase_orders WHERE po_number LIKE 'PO-TEST-%') as pos,
      (SELECT COUNT(*) FROM quotations WHERE quote_number LIKE 'QUO-TEST-%') as quotations,
      (SELECT COUNT(*) FROM invoices WHERE invoice_number LIKE 'INV-TEST-%') as invoices,
      (SELECT COUNT(*) FROM delivery_orders WHERE order_number LIKE 'DO-TEST-%') as delivery_orders,
      (SELECT COUNT(*) FROM stock_movements WHERE notes LIKE '%[TEST]%') as stock_movements,
      (SELECT COUNT(*) FROM audit_log WHERE actor_name LIKE 'test_%') as audit_logs
  `);
  const c = counts.rows[0];
  console.log('\n✅ Seed complete! Final test record counts:');
  console.log(`   Brands:          ${c.brands}`);
  console.log(`   Suppliers:       ${c.suppliers}`);
  console.log(`   Customers:       ${c.customers}`);
  console.log(`   Users:           ${c.users}`);
  console.log(`   Products:        ${c.products}`);
  console.log(`   Purchase Orders: ${c.pos}`);
  console.log(`   Quotations:      ${c.quotations}`);
  console.log(`   Invoices:        ${c.invoices}`);
  console.log(`   Delivery Orders: ${c.delivery_orders}`);
  console.log(`   Stock Movements: ${c.stock_movements}`);
  console.log(`   Audit Log:       ${c.audit_logs}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  pool.end();
  process.exit(1);
});
