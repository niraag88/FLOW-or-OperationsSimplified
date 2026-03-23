/**
 * populate-sales-api.ts
 * Comprehensive sales seeding script — all data created via authenticated REST API.
 * Creates:
 *   - 300+ Quotations  (Draft=50, Sent=100, Accepted=100, Expired=50)
 *   - ~80 Invoices from accepted quotations (convert flow)
 *   - ~320 Direct Invoices  (total invoices >= 400)
 *   - 300+ Delivery Orders  (~150 linked to invoices, ~150 standalone)
 *
 * Idempotency tag: [SEED-56] in notes/remarks
 * Skips if counts already meet targets; clears partial batches.
 *
 * Usage:
 *   npx tsx scripts/populate-sales-api.ts
 *
 * Env vars (all optional, fall back to dev defaults):
 *   APP_URL, ADMIN_USERNAME, ADMIN_PASSWORD
 */

import pkg from 'pg';
const { Pool } = pkg;

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5000';
const USERNAME  = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD  = process.env.ADMIN_PASSWORD ?? 'admin123';
const SEED_TAG  = '[SEED-56]';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Targets ──────────────────────────────────────────────────────────────────
const QUOTE_TARGET     = 300;
const INVOICE_TARGET   = 400;
const DO_TARGET        = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiPost(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function apiPut(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function apiGet(path: string, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie } });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status}`);
  const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!cookie) throw new Error('No session cookie received');
  return cookie;
}

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }

function isoDate(date: Date): string { return date.toISOString().substring(0, 10); }

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Spread dates evenly across 2025, 2026, 2027
const DATE_RANGES = [
  { start: new Date('2025-01-01'), end: new Date('2025-12-31') },
  { start: new Date('2026-01-01'), end: new Date('2026-12-31') },
  { start: new Date('2027-01-01'), end: new Date('2027-03-22') },
];

function randomDate(yearIdx?: number): Date {
  const range = yearIdx !== undefined ? DATE_RANGES[yearIdx] : pick(DATE_RANGES);
  const span = range.end.getTime() - range.start.getTime();
  return new Date(range.start.getTime() + Math.random() * span);
}

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Card', 'Cheque'];

// ─── Build line items from product pool ───────────────────────────────────────
type Product = { id: number; name: string; sku: string; unitPrice: string };

function buildItems(products: Product[], count: number) {
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  const chosen = shuffled.slice(0, count);
  return chosen.map((p) => {
    const qty = rand(1, 20);
    const unitPrice = parseFloat(p.unitPrice) || rand(20, 400);
    const lineTotal = +(qty * unitPrice).toFixed(2);
    return {
      product_id: p.id,
      product_code: p.sku,
      description: p.name,
      quantity: qty,
      unit_price: +unitPrice.toFixed(2),
      vat_rate: 0.05,
      discount: 0,
      line_total: lineTotal,
    };
  });
}

function calcTotals(items: ReturnType<typeof buildItems>) {
  const subtotal = +(items.reduce((s, it) => s + it.line_total, 0)).toFixed(2);
  const vatAmount = +(subtotal * 0.05).toFixed(2);
  const grandTotal = +(subtotal + vatAmount).toFixed(2);
  return { subtotal, vatAmount, grandTotal };
}

// ─── 1. Customers ─────────────────────────────────────────────────────────────

async function fetchCustomers(cookie: string): Promise<Array<{ id: number; name: string }>> {
  const { data } = await apiGet('/api/customers', cookie);
  const list = Array.isArray(data) ? data : (data?.customers ?? []);
  return list as Array<{ id: number; name: string }>;
}

async function fetchProducts(cookie: string): Promise<Product[]> {
  const { data } = await apiGet('/api/products?limit=1000', cookie);
  const list = Array.isArray(data) ? data : [];
  return list.filter((p: any) => p.isActive && parseFloat(p.unitPrice) > 0) as Product[];
}

// ─── 2. Quotations ────────────────────────────────────────────────────────────

const QUOTE_STATUSES = [
  ...Array(50).fill('Draft'),
  ...Array(100).fill('Sent'),
  ...Array(100).fill('Accepted'),
  ...Array(50).fill('Expired'),
];

async function seedQuotations(
  cookie: string,
  customers: Array<{ id: number }>,
  products: Product[],
): Promise<{ id: number; status: string; quoteNumber: string }[]> {
  console.log('\n── Quotations ─────────────────────────────────────────────');

  const existing = (await pool.query(
    `SELECT COUNT(*) FROM quotations WHERE notes LIKE $1`, [`${SEED_TAG}%`]
  )).rows[0].count;

  if (parseInt(existing) >= QUOTE_TARGET) {
    console.log(`  → Already have ${existing} seeded quotations — skipping`);
    const rows = await pool.query(
      `SELECT id, status, quote_number FROM quotations WHERE notes LIKE $1 ORDER BY id`,
      [`${SEED_TAG}%`]
    );
    return rows.rows.map(r => ({ id: Number(r.id), status: r.status, quoteNumber: r.quote_number }));
  }

  if (parseInt(existing) > 0) {
    console.log(`  → Partial batch (${existing}) — clearing`);
    await pool.query(`DELETE FROM quotation_items WHERE quote_id IN (SELECT id FROM quotations WHERE notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM quotations WHERE notes LIKE $1`, [`${SEED_TAG}%`]);
  }

  const statuses = [...QUOTE_STATUSES].sort(() => Math.random() - 0.5);
  const created: { id: number; status: string; quoteNumber: string }[] = [];
  let failed = 0;

  for (let i = 0; i < QUOTE_TARGET; i++) {
    const customer = customers[i % customers.length];
    const status = statuses[i];
    const yearIdx = i % 3; // even spread across years
    const quoteDate = randomDate(yearIdx);
    const validUntil = addDays(quoteDate, rand(15, 60));
    const items = buildItems(products, rand(2, 6));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);

    const { status: httpStatus, data } = await apiPost('/api/quotations', {
      customerId: customer.id,
      quoteDate: isoDate(quoteDate),
      validUntil: isoDate(validUntil),
      status,
      notes: `${SEED_TAG} Quotation #${i + 1} — ${status}`,
      totalAmount: subtotal.toFixed(2),
      vatAmount: vatAmount.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
      items,
    }, cookie);

    if (httpStatus === 201) {
      created.push({ id: (data as any).id, status, quoteNumber: (data as any).quoteNumber });
      if ((i + 1) % 50 === 0) console.log(`  → ${i + 1} quotations created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Created: ${created.length}, Failed: ${failed}`);
  return created;
}

// ─── 3. Invoices from quotations ──────────────────────────────────────────────

async function convertQuotationsToInvoices(
  cookie: string,
  quotations: { id: number; status: string; quoteNumber: string }[],
): Promise<Array<{ id: number; invoiceNumber: string }>> {
  console.log('\n── Convert accepted quotations → invoices ─────────────────');

  // Check how many seed quotations are already Converted — skip if already 80+
  const alreadyConverted = quotations.filter(q => q.status === 'Converted').length;
  if (alreadyConverted >= 80) {
    console.log(`  → Already ${alreadyConverted} quotations converted — skipping`);
    return [];
  }

  // Only convert Accepted ones (not already Converted)
  const accepted = quotations.filter(q => q.status === 'Accepted');
  // Convert up to 80 accepted quotations
  const toConvert = accepted.slice(0, 80);

  const converted: Array<{ id: number; invoiceNumber: string }> = [];
  let failed = 0;

  for (const q of toConvert) {
    const { status, data } = await apiPost('/api/invoices/from-quotation', {
      quotationId: q.id,
    }, cookie);
    if (status === 201) {
      converted.push({ id: (data as any).id, invoiceNumber: (data as any).invoiceNumber });
    } else if ((data as any)?.error?.includes('already been converted')) {
      // Already converted — find and record it
      converted.push({ id: 0, invoiceNumber: 'converted' });
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Converted: ${converted.length}, Failed: ${failed}`);
  return converted.filter(c => c.id > 0);
}

// ─── 4. Direct invoices ───────────────────────────────────────────────────────

const INVOICE_STATUSES = [
  ...Array(50).fill('draft'),
  ...Array(150).fill('sent'),
  ...Array(150).fill('paid'),
  ...Array(50).fill('overdue'),
];

async function seedDirectInvoices(
  cookie: string,
  customers: Array<{ id: number }>,
  products: Product[],
  directCount: number,
): Promise<Array<{ id: number; invoiceNumber: string }>> {
  console.log(`\n── Direct invoices (${directCount}) ───────────────────────────────────`);

  const existing = parseInt((await pool.query(
    `SELECT COUNT(*) FROM invoices WHERE notes LIKE $1`, [`${SEED_TAG}%`]
  )).rows[0].count);

  if (existing >= directCount) {
    console.log(`  → Already have ${existing} seeded direct invoices — skipping`);
    const rows = await pool.query(
      `SELECT id, invoice_number FROM invoices WHERE notes LIKE $1 ORDER BY id`,
      [`${SEED_TAG}%`]
    );
    return rows.rows.map(r => ({ id: Number(r.id), invoiceNumber: r.invoice_number }));
  }

  if (existing > 0) {
    console.log(`  → Partial batch (${existing}) — clearing`);
    await pool.query(`DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM invoices WHERE notes LIKE $1`, [`${SEED_TAG}%`]);
  }

  const statuses = [...INVOICE_STATUSES].sort(() => Math.random() - 0.5);
  const created: Array<{ id: number; invoiceNumber: string }> = [];
  let failed = 0;

  for (let i = 0; i < directCount; i++) {
    const customer = customers[i % customers.length];
    const status = statuses[i % statuses.length];
    const yearIdx = i % 3;
    const invoiceDate = randomDate(yearIdx);
    const items = buildItems(products, rand(2, 6));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);

    const { status: httpStatus, data } = await apiPost('/api/invoices', {
      customer_id: customer.id,
      status,
      invoice_date: isoDate(invoiceDate),
      notes: `${SEED_TAG} Invoice #${i + 1} — ${status}`,
      tax_amount: vatAmount,
      total_amount: grandTotal,
      currency: 'AED',
      payment_method: status === 'paid' ? pick(PAYMENT_METHODS) : undefined,
      items: items.map(it => ({
        product_id: it.product_id,
        product_code: it.product_code,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    }, cookie);

    if (httpStatus === 201) {
      created.push({ id: (data as any).id, invoiceNumber: (data as any).invoiceNumber });
      if ((i + 1) % 80 === 0) console.log(`  → ${i + 1} direct invoices created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Created: ${created.length}, Failed: ${failed}`);
  return created;
}

// ─── 5. Delivery Orders ───────────────────────────────────────────────────────

const DO_STATUSES_LINKED     = ['Pending', 'Dispatched', 'Delivered'];
const DO_STATUS_WEIGHTS      = [20, 40, 40]; // % weights for pending/dispatched/delivered
const DO_STATUSES_STANDALONE = ['Pending', 'Dispatched', 'Delivered'];

function weightedStatus(statuses: string[], weights: number[]): string {
  const r = Math.random() * 100;
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r < cum) return statuses[i];
  }
  return statuses[statuses.length - 1];
}

async function seedDeliveryOrders(
  cookie: string,
  customers: Array<{ id: number }>,
  products: Product[],
  linkedInvoices: Array<{ id: number; invoiceNumber: string }>,
): Promise<void> {
  console.log('\n── Delivery Orders (300+ via API) ────────────────────────');

  const existing = parseInt((await pool.query(
    `SELECT COUNT(*) FROM delivery_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]
  )).rows[0].count);

  if (existing >= DO_TARGET) {
    console.log(`  → Already have ${existing} seeded DOs — skipping`);
    return;
  }

  if (existing > 0) {
    console.log(`  → Partial batch (${existing}) — clearing`);
    await pool.query(`DELETE FROM delivery_order_items WHERE do_id IN (SELECT id FROM delivery_orders WHERE notes LIKE $1)`, [`${SEED_TAG}%`]);
    await pool.query(`DELETE FROM delivery_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]);
  }

  let created = 0;
  let failed = 0;

  // ── A. ~150 DOs linked to invoices ──
  const invoiceSample = linkedInvoices.slice(0, Math.min(150, linkedInvoices.length));
  console.log(`  Creating ${invoiceSample.length} invoice-linked DOs...`);

  for (let i = 0; i < invoiceSample.length; i++) {
    const inv = invoiceSample[i];
    const customer = customers[i % customers.length];
    const yearIdx = i % 3;
    const orderDate = randomDate(yearIdx);
    const items = buildItems(products, rand(2, 5));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);
    const status = weightedStatus(DO_STATUSES_LINKED, DO_STATUS_WEIGHTS);

    const { status: httpStatus } = await apiPost('/api/delivery-orders', {
      customer_id: customer.id,
      status,
      order_date: isoDate(orderDate),
      reference: inv.invoiceNumber,
      reference_date: isoDate(orderDate),
      subtotal: subtotal,
      tax_amount: vatAmount,
      total_amount: grandTotal,
      currency: 'AED',
      tax_rate: 0.05,
      notes: `${SEED_TAG} DO from invoice ${inv.invoiceNumber}`,
      items: items.map(it => ({
        product_id: it.product_id,
        product_code: it.product_code,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    }, cookie);

    if (httpStatus === 201) {
      created++;
      if (created % 50 === 0) console.log(`  → ${created} DOs created...`);
    } else {
      failed++;
    }
  }

  // ── B. Standalone DOs to reach 300 total ──
  const standaloneCount = DO_TARGET - created;
  console.log(`  Creating ${standaloneCount} standalone DOs...`);

  const doStatusPool = [
    ...Array(20).fill('Pending'),
    ...Array(40).fill('Dispatched'),
    ...Array(40).fill('Delivered'),
  ].sort(() => Math.random() - 0.5);

  for (let i = 0; i < standaloneCount; i++) {
    const customer = customers[i % customers.length];
    const yearIdx = i % 3;
    const orderDate = randomDate(yearIdx);
    const items = buildItems(products, rand(2, 5));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);
    const status = doStatusPool[i % doStatusPool.length];

    const { status: httpStatus } = await apiPost('/api/delivery-orders', {
      customer_id: customer.id,
      status,
      order_date: isoDate(orderDate),
      subtotal,
      tax_amount: vatAmount,
      total_amount: grandTotal,
      currency: 'AED',
      tax_rate: 0.05,
      notes: `${SEED_TAG} Standalone DO #${i + 1}`,
      items: items.map(it => ({
        product_id: it.product_id,
        product_code: it.product_code,
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    }, cookie);

    if (httpStatus === 201) {
      created++;
      if (created % 50 === 0) console.log(`  → ${created} DOs created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ DOs created: ${created}, Failed: ${failed}`);
}

// ─── 6. Verification ──────────────────────────────────────────────────────────

async function verify(): Promise<void> {
  console.log('\n── Verification ────────────────────────────────────────────');
  let pass = true;

  const [qRes, iRes, doRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM quotations WHERE notes LIKE $1`, [`${SEED_TAG}%`]),
    pool.query(`SELECT COUNT(*) FROM invoices WHERE notes LIKE $1 OR (notes IS NULL)`, [`${SEED_TAG}%`]),
    pool.query(`SELECT COUNT(*) FROM delivery_orders WHERE notes LIKE $1`, [`${SEED_TAG}%`]),
  ]);

  // For invoices, count seed direct + converted (converted don't have seed tag in notes)
  const directInvCount = parseInt((await pool.query(
    `SELECT COUNT(*) FROM invoices WHERE notes LIKE $1`, [`${SEED_TAG}%`]
  )).rows[0].count);

  const totalInvCount = parseInt((await pool.query(`SELECT COUNT(*) FROM invoices`)).rows[0].count);

  const qCount  = parseInt(qRes.rows[0].count);
  const doCount = parseInt(doRes.rows[0].count);

  const qOk  = qCount  >= QUOTE_TARGET;
  const iOk  = totalInvCount >= INVOICE_TARGET;
  const doOk = doCount >= DO_TARGET;

  console.log(`  Quotations (seeded):       ${qCount}  ${qOk  ? '✓' : '✗ (need >= ' + QUOTE_TARGET + ')'}`);
  console.log(`  Invoices (total in DB):    ${totalInvCount}  ${iOk ? '✓' : '✗ (need >= ' + INVOICE_TARGET + ')'}`);
  console.log(`  Invoices (direct seeded):  ${directInvCount}`);
  console.log(`  Delivery Orders (seeded):  ${doCount}  ${doOk ? '✓' : '✗ (need >= ' + DO_TARGET + ')'}`);

  if (!qOk)  pass = false;
  if (!iOk)  pass = false;
  if (!doOk) pass = false;

  // Status distribution checks
  const qStatusRes = await pool.query(
    `SELECT status, COUNT(*) FROM quotations WHERE notes LIKE $1 GROUP BY status`, [`${SEED_TAG}%`]
  );
  const qByStatus: Record<string, number> = {};
  qStatusRes.rows.forEach(r => { qByStatus[r.status] = parseInt(r.count); });
  console.log(`  Quote status distribution:`, JSON.stringify(qByStatus));

  const doStatusRes = await pool.query(
    `SELECT status, COUNT(*) FROM delivery_orders WHERE notes LIKE $1 GROUP BY status`, [`${SEED_TAG}%`]
  );
  const doByStatus: Record<string, number> = {};
  doStatusRes.rows.forEach(r => { doByStatus[r.status] = parseInt(r.count); });
  console.log(`  DO status distribution:   `, JSON.stringify(doByStatus));

  if (pass) console.log('\n  ✓ All verification checks passed');
  else { console.error('\n  ✗ Verification FAILED'); process.exit(1); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Sales seeding: Quotations, Invoices, Delivery Orders      ');
  console.log('═══════════════════════════════════════════════════════════');

  const cookie = await login();
  console.log(`✓ Authenticated as ${USERNAME}`);

  // Fetch customers and products
  const customers = await fetchCustomers(cookie);
  if (customers.length < 10) {
    console.error(`  ✗ Not enough customers (${customers.length}) — run populate-customers-api.ts first`);
    process.exit(1);
  }
  console.log(`✓ Found ${customers.length} customers`);

  const products = await fetchProducts(cookie);
  if (products.length < 10) {
    console.error(`  ✗ Not enough products (${products.length}) — run seed-foundation.ts first`);
    process.exit(1);
  }
  console.log(`✓ Found ${products.length} active products`);

  // 1. Seed quotations
  const quotations = await seedQuotations(cookie, customers, products);

  // 2. Convert accepted quotations → invoices
  const convertedInvoices = await convertQuotationsToInvoices(cookie, quotations);
  console.log(`  Total converted invoice IDs collected: ${convertedInvoices.length}`);

  // 3. Seed direct invoices to reach INVOICE_TARGET total
  const totalExistingInvoices = parseInt(
    (await pool.query(`SELECT COUNT(*) FROM invoices`)).rows[0].count
  );
  const directNeeded = Math.max(INVOICE_TARGET - totalExistingInvoices, 0);
  console.log(`  Total invoices in DB: ${totalExistingInvoices}; direct needed: ${directNeeded}`);

  const directInvoices = await seedDirectInvoices(cookie, customers, products, Math.max(directNeeded, 320));
  const allInvoices = [...convertedInvoices, ...directInvoices];

  // 4. Seed delivery orders
  await seedDeliveryOrders(cookie, customers, products, allInvoices);

  // 5. Verify
  await verify();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Sales seeding complete!                                    ');
  console.log('═══════════════════════════════════════════════════════════');

  await pool.end();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
