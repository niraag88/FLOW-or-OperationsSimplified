/**
 * populate-sales-api.ts
 * Comprehensive sales seeding script — all data created via authenticated REST API.
 * No direct database access; idempotency is managed through API list/delete endpoints.
 *
 * Creates:
 *   - 300+ Quotations  (Draft=50, Sent=100, Accepted=100, Expired=50)
 *   - ~80 Invoices from accepted quotations (convert flow)
 *   - ~320 Direct Invoices  (total invoices >= 400)
 *   - 300+ Delivery Orders  (~150 linked to invoices, ~150 standalone)
 *
 * Idempotency tag: [SEED-56] in notes/remarks
 * Skips entire section if target met; clears partial batches via DELETE API.
 *
 * Usage:
 *   npx tsx scripts/populate-sales-api.ts
 *
 * Env vars (all optional, fall back to dev defaults):
 *   APP_URL, ADMIN_USERNAME, ADMIN_PASSWORD
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5000';
const USERNAME  = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD  = process.env.ADMIN_PASSWORD ?? 'admin123';
const SEED_TAG  = '[SEED-56]';

// ─── Targets ──────────────────────────────────────────────────────────────────
const QUOTE_TARGET   = 300;
const INVOICE_TARGET = 400;
const DO_TARGET      = 300;
const CONVERT_TARGET = 80;
const DIRECT_TARGET  = 320;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Product   { id: number; name: string; sku: string; unitPrice: string; isActive: boolean }
interface Quotation { id: number; quoteNumber: string; status: string; notes?: string | null }
interface Invoice   { id: number; invoiceNumber: string; notes?: string | null; status?: string; paymentMethod?: string | null }
interface DeliveryOrder { id: number; orderNumber: string; notes?: string | null }

interface LineItem {
  product_id: number;
  product_code: string;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number;
  discount: number;
  line_total: number;
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function apiFetch(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  cookie: string,
  body?: object,
): Promise<{ status: number; data: unknown }> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE_URL}${path}`, opts);
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

async function apiGet(path: string, cookie: string): Promise<{ status: number; data: unknown }> {
  return apiFetch(path, 'GET', cookie);
}
async function apiPost(path: string, body: object, cookie: string): Promise<{ status: number; data: unknown }> {
  return apiFetch(path, 'POST', cookie, body);
}
async function apiDelete(path: string, cookie: string): Promise<{ status: number }> {
  const { status } = await apiFetch(path, 'DELETE', cookie);
  return { status };
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

// ─── Data Helpers ─────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min: number, max: number): number { return Math.floor(Math.random() * (max - min + 1)) + min; }
function isoDate(date: Date): string { return date.toISOString().substring(0, 10); }

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Year ranges spread across 2025, 2026, 2027
const DATE_RANGES = [
  { start: new Date('2025-01-01'), end: new Date('2025-12-31') },
  { start: new Date('2026-01-01'), end: new Date('2026-12-31') },
  { start: new Date('2027-01-01'), end: new Date('2027-03-22') },
];

function randomDate(yearIdx: number): Date {
  const range = DATE_RANGES[yearIdx];
  const span = range.end.getTime() - range.start.getTime();
  return new Date(range.start.getTime() + Math.random() * span);
}

const PAYMENT_METHODS = ['Bank Transfer', 'Cash', 'Card', 'Cheque'];

function buildItems(products: Product[], count: number): LineItem[] {
  const shuffled = [...products].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((p) => {
    const qty = rand(1, 20);
    const unitPrice = +(parseFloat(p.unitPrice) || rand(20, 400)).toFixed(2);
    const lineTotal = +(qty * unitPrice).toFixed(2);
    return { product_id: p.id, product_code: p.sku, description: p.name, quantity: qty, unit_price: unitPrice, vat_rate: 0.05, discount: 0, line_total: lineTotal };
  });
}

function calcTotals(items: LineItem[]): { subtotal: number; vatAmount: number; grandTotal: number } {
  const subtotal   = +(items.reduce((s, it) => s + it.line_total, 0)).toFixed(2);
  const vatAmount  = +(subtotal * 0.05).toFixed(2);
  const grandTotal = +(subtotal + vatAmount).toFixed(2);
  return { subtotal, vatAmount, grandTotal };
}

// ─── Fetch base data ───────────────────────────────────────────────────────────

async function fetchCustomers(cookie: string): Promise<Customer[]> {
  const { data } = await apiGet('/api/customers', cookie);
  const list = Array.isArray(data) ? data : (data as { customers?: Customer[] }).customers ?? [];
  return (list as Customer[]).filter(c => c.id && c.name);
}

async function fetchProducts(cookie: string): Promise<Product[]> {
  const { data } = await apiGet('/api/products?limit=1000', cookie);
  const list = Array.isArray(data) ? (data as Product[]) : [];
  return list.filter(p => p.isActive && parseFloat(p.unitPrice) > 0);
}

async function fetchSeedQuotations(cookie: string): Promise<Quotation[]> {
  const { data } = await apiGet('/api/quotations', cookie);
  const list = Array.isArray(data) ? (data as Quotation[]) : ((data as { quotations?: Quotation[] }).quotations ?? []);
  return list.filter(q => q.notes?.startsWith(SEED_TAG));
}

async function fetchSeedInvoices(cookie: string): Promise<Invoice[]> {
  const { data } = await apiGet('/api/invoices', cookie);
  const list = Array.isArray(data) ? (data as Invoice[]) : ((data as { invoices?: Invoice[] }).invoices ?? []);
  return list.filter(i => i.notes?.startsWith(SEED_TAG));
}

async function fetchSeedDOs(cookie: string): Promise<DeliveryOrder[]> {
  const { data } = await apiGet('/api/delivery-orders', cookie);
  const list = Array.isArray(data) ? (data as DeliveryOrder[]) : ((data as { deliveryOrders?: DeliveryOrder[] }).deliveryOrders ?? []);
  return list.filter(d => d.notes?.startsWith(SEED_TAG));
}

async function fetchTotalInvoiceCount(cookie: string): Promise<number> {
  const { data } = await apiGet('/api/invoices', cookie);
  const list = Array.isArray(data) ? data : ((data as { invoices?: unknown[] }).invoices ?? []);
  return list.length;
}

// ─── 1. Quotations ────────────────────────────────────────────────────────────

const QUOTE_STATUS_POOL: string[] = [
  ...Array(50).fill('Draft'),
  ...Array(100).fill('Sent'),
  ...Array(100).fill('Accepted'),
  ...Array(50).fill('Expired'),
];

async function seedQuotations(
  cookie: string,
  customers: Customer[],
  products: Product[],
): Promise<Quotation[]> {
  console.log('\n── Quotations ─────────────────────────────────────────────');

  const existing = await fetchSeedQuotations(cookie);

  if (existing.length >= QUOTE_TARGET) {
    console.log(`  → Already have ${existing.length} seeded quotations — skipping`);
    return existing;
  }

  if (existing.length > 0) {
    console.log(`  → Partial batch (${existing.length}) — clearing via API`);
    for (const q of existing) {
      await apiDelete(`/api/quotations/${q.id}`, cookie);
    }
  }

  const statuses = [...QUOTE_STATUS_POOL].sort(() => Math.random() - 0.5);
  const created: Quotation[] = [];
  let failed = 0;

  for (let i = 0; i < QUOTE_TARGET; i++) {
    const customer = customers[i % customers.length];
    const status   = statuses[i];
    const yearIdx  = i % 3;
    const quoteDate  = randomDate(yearIdx);
    const validUntil = addDays(quoteDate, rand(15, 60));
    const items   = buildItems(products, rand(2, 6));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);

    const { status: http, data } = await apiPost('/api/quotations', {
      customerId:  customer.id,
      quoteDate:   isoDate(quoteDate),
      validUntil:  isoDate(validUntil),
      status,
      notes:       `${SEED_TAG} Quotation #${i + 1} — ${status}`,
      totalAmount: subtotal.toFixed(2),
      vatAmount:   vatAmount.toFixed(2),
      grandTotal:  grandTotal.toFixed(2),
      items,
    }, cookie);

    if (http === 201) {
      const q = data as Quotation;
      created.push({ id: q.id, quoteNumber: q.quoteNumber, status, notes: `${SEED_TAG} Quotation #${i + 1} — ${status}` });
      if ((i + 1) % 50 === 0) console.log(`  → ${i + 1} quotations created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Created: ${created.length}, Failed: ${failed}`);
  return created;
}

// ─── 2. Convert quotations → invoices ────────────────────────────────────────

async function convertQuotations(
  cookie: string,
  quotations: Quotation[],
): Promise<Invoice[]> {
  console.log('\n── Convert accepted quotations → invoices ─────────────────');

  const alreadyConverted = quotations.filter(q => q.status === 'Converted').length;
  if (alreadyConverted >= CONVERT_TARGET) {
    console.log(`  → Already ${alreadyConverted} quotations converted — skipping`);
    return [];
  }

  const toConvert = quotations.filter(q => q.status === 'Accepted').slice(0, CONVERT_TARGET);
  const converted: Invoice[] = [];
  let failed = 0;

  for (const q of toConvert) {
    const { status: http, data } = await apiPost('/api/invoices/from-quotation', { quotationId: q.id }, cookie);
    if (http === 201) {
      const inv = data as Invoice;
      converted.push({ id: inv.id, invoiceNumber: inv.invoiceNumber });
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Converted: ${converted.length}, Failed: ${failed}`);
  return converted;
}

// ─── 3. Direct invoices ───────────────────────────────────────────────────────

// Exact status pool sized to DIRECT_TARGET (320) so statuses[i] gives precise distribution:
// Draft=50, Sent=120, Paid=120, Overdue=30 → 320 total
// (80 converted invoices add ~80 more 'draft'; total ~400: Draft≈130, Sent≈120, Paid≈120, Overdue≈30)
const INVOICE_STATUS_POOL: string[] = (() => {
  const pool = [
    ...Array(50).fill('draft'),
    ...Array(120).fill('sent'),
    ...Array(120).fill('paid'),
    ...Array(30).fill('overdue'),
  ];
  // Fisher-Yates shuffle for stable random ordering
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
})();

async function seedDirectInvoices(
  cookie: string,
  customers: Customer[],
  products: Product[],
): Promise<Invoice[]> {
  console.log(`\n── Direct invoices (${DIRECT_TARGET}) ───────────────────────────────────`);

  const existing = await fetchSeedInvoices(cookie);

  if (existing.length >= DIRECT_TARGET) {
    console.log(`  → Already have ${existing.length} seeded direct invoices — skipping`);
    return existing;
  }

  if (existing.length > 0) {
    console.log(`  → Partial batch (${existing.length}) — clearing via API`);
    for (const inv of existing) {
      await apiDelete(`/api/invoices/${inv.id}`, cookie);
    }
  }

  const created: Invoice[] = [];
  let failed = 0;

  for (let i = 0; i < DIRECT_TARGET; i++) {
    const customer    = customers[i % customers.length];
    const status      = INVOICE_STATUS_POOL[i];
    const yearIdx     = i % 3;
    const invoiceDate = randomDate(yearIdx);
    const items       = buildItems(products, rand(2, 6));
    const { vatAmount, grandTotal } = calcTotals(items);

    const { status: http, data } = await apiPost('/api/invoices', {
      customer_id:    customer.id,
      status,
      invoice_date:   isoDate(invoiceDate),
      notes:          `${SEED_TAG} Invoice #${i + 1} — ${status}`,
      tax_amount:     vatAmount,
      total_amount:   grandTotal,
      currency:       'AED',
      payment_method: status === 'paid' ? pick(PAYMENT_METHODS) : undefined,
      items: items.map(it => ({
        product_id:   it.product_id,
        product_code: it.product_code,
        description:  it.description,
        quantity:     it.quantity,
        unit_price:   it.unit_price,
        line_total:   it.line_total,
      })),
    }, cookie);

    if (http === 201) {
      const inv = data as Invoice;
      created.push({ id: inv.id, invoiceNumber: inv.invoiceNumber });
      if ((i + 1) % 80 === 0) console.log(`  → ${i + 1} direct invoices created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Created: ${created.length}, Failed: ${failed}`);
  return created;
}

// ─── 4. Delivery Orders ───────────────────────────────────────────────────────

const DO_STATUS_POOL: string[] = [
  ...Array(20).fill('Pending'),
  ...Array(40).fill('Dispatched'),
  ...Array(40).fill('Delivered'),
];

async function seedDeliveryOrders(
  cookie: string,
  customers: Customer[],
  products: Product[],
  linkedInvoices: Invoice[],
): Promise<void> {
  console.log('\n── Delivery Orders (300+ via API) ────────────────────────');

  const existing = await fetchSeedDOs(cookie);

  if (existing.length >= DO_TARGET) {
    console.log(`  → Already have ${existing.length} seeded DOs — skipping`);
    return;
  }

  if (existing.length > 0) {
    console.log(`  → Partial batch (${existing.length}) — clearing via API`);
    for (const d of existing) {
      await apiDelete(`/api/delivery-orders/${d.id}`, cookie);
    }
  }

  const statuses = [...DO_STATUS_POOL].sort(() => Math.random() - 0.5);
  let created = 0;
  let failed  = 0;

  // A: ~150 DOs linked to invoices
  const invoiceSample = linkedInvoices.slice(0, Math.min(150, linkedInvoices.length));
  console.log(`  Creating ${invoiceSample.length} invoice-linked DOs...`);

  for (let i = 0; i < invoiceSample.length; i++) {
    const inv       = invoiceSample[i];
    const customer  = customers[i % customers.length];
    const yearIdx   = i % 3;
    const orderDate = randomDate(yearIdx);
    const items     = buildItems(products, rand(2, 5));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);
    const status    = statuses[i % statuses.length];

    const { status: http } = await apiPost('/api/delivery-orders', {
      customer_id:    customer.id,
      status,
      order_date:     isoDate(orderDate),
      reference:      inv.invoiceNumber,
      reference_date: isoDate(orderDate),
      subtotal,
      tax_amount:     vatAmount,
      total_amount:   grandTotal,
      currency:       'AED',
      tax_rate:       0.05,
      notes:          `${SEED_TAG} DO from invoice ${inv.invoiceNumber}`,
      items: items.map(it => ({
        product_id:   it.product_id,
        product_code: it.product_code,
        description:  it.description,
        quantity:     it.quantity,
        unit_price:   it.unit_price,
        line_total:   it.line_total,
      })),
    }, cookie);

    if (http === 201) {
      created++;
      if (created % 50 === 0) console.log(`  → ${created} DOs created...`);
    } else {
      failed++;
    }
  }

  // B: Standalone DOs to fill remaining target
  const standaloneCount = DO_TARGET - created;
  console.log(`  Creating ${standaloneCount} standalone DOs...`);

  for (let i = 0; i < standaloneCount; i++) {
    const customer  = customers[i % customers.length];
    const yearIdx   = i % 3;
    const orderDate = randomDate(yearIdx);
    const items     = buildItems(products, rand(2, 5));
    const { subtotal, vatAmount, grandTotal } = calcTotals(items);
    const status    = statuses[(invoiceSample.length + i) % statuses.length];

    const { status: http } = await apiPost('/api/delivery-orders', {
      customer_id:  customer.id,
      status,
      order_date:   isoDate(orderDate),
      subtotal,
      tax_amount:   vatAmount,
      total_amount: grandTotal,
      currency:     'AED',
      tax_rate:     0.05,
      notes:        `${SEED_TAG} Standalone DO #${i + 1}`,
      items: items.map(it => ({
        product_id:   it.product_id,
        product_code: it.product_code,
        description:  it.description,
        quantity:     it.quantity,
        unit_price:   it.unit_price,
        line_total:   it.line_total,
      })),
    }, cookie);

    if (http === 201) {
      created++;
      if (created % 50 === 0) console.log(`  → ${created} DOs created...`);
    } else {
      failed++;
    }
  }

  console.log(`  ✓ DOs created: ${created}, Failed: ${failed}`);
}

// ─── 5. Verification ──────────────────────────────────────────────────────────

async function verify(cookie: string): Promise<void> {
  console.log('\n── Verification ────────────────────────────────────────────');
  let pass = true;

  const [seedQuotes, seedInvoices, seedDOs, totalInvoiceCount] = await Promise.all([
    fetchSeedQuotations(cookie),
    fetchSeedInvoices(cookie),
    fetchSeedDOs(cookie),
    fetchTotalInvoiceCount(cookie),
  ]);

  const qOk  = seedQuotes.length >= QUOTE_TARGET;
  const iOk  = totalInvoiceCount >= INVOICE_TARGET;
  const doOk = seedDOs.length    >= DO_TARGET;

  console.log(`  Quotations (seeded):       ${seedQuotes.length}  ${qOk  ? '✓' : '✗ (need >= ' + QUOTE_TARGET + ')'}`);
  console.log(`  Invoices (total in DB):    ${totalInvoiceCount}  ${iOk ? '✓' : '✗ (need >= ' + INVOICE_TARGET + ')'}`);
  console.log(`  Invoices (direct seeded):  ${seedInvoices.length}`);
  console.log(`  Delivery Orders (seeded):  ${seedDOs.length}  ${doOk ? '✓' : '✗ (need >= ' + DO_TARGET + ')'}`);

  if (!qOk)  pass = false;
  if (!iOk)  pass = false;
  if (!doOk) pass = false;

  // Status distribution
  const qByStatus: Record<string, number> = {};
  seedQuotes.forEach(q => { qByStatus[q.status] = (qByStatus[q.status] ?? 0) + 1; });
  console.log(`  Quote status distribution:`, JSON.stringify(qByStatus));

  const doByStatus: Record<string, number> = {};
  seedDOs.forEach(d => {
    const s = (d as unknown as { status?: string }).status ?? 'Unknown';
    doByStatus[s] = (doByStatus[s] ?? 0) + 1;
  });
  console.log(`  DO status distribution:   `, JSON.stringify(doByStatus));

  // Invoice status distribution (direct seed invoices)
  const directWithDetail = seedInvoices;
  const invByStatus: Record<string, number> = {};
  directWithDetail.forEach(inv => {
    const s = inv.status ?? 'unknown';
    invByStatus[s] = (invByStatus[s] ?? 0) + 1;
  });
  console.log(`  Invoice status distribution (direct):`, JSON.stringify(invByStatus));

  // Payment method: paid invoices that have a payment_method set
  const paidInvWithMethod = directWithDetail.filter(
    inv => inv.status === 'paid' && inv.paymentMethod,
  );
  const pmOk = paidInvWithMethod.length > 0;
  console.log(`  Paid invoices with payment_method:   ${paidInvWithMethod.length} ${pmOk ? '✓' : '✗ (none found — payment_method column may be missing)'}`);
  if (!pmOk) pass = false;

  // Exact distribution check: direct statuses must match pool exactly
  const expectedDraft   = INVOICE_STATUS_POOL.filter(s => s === 'draft').length;
  const expectedSent    = INVOICE_STATUS_POOL.filter(s => s === 'sent').length;
  const expectedPaid    = INVOICE_STATUS_POOL.filter(s => s === 'paid').length;
  const expectedOverdue = INVOICE_STATUS_POOL.filter(s => s === 'overdue').length;
  console.log(`  Expected invoice distribution: draft=${expectedDraft} sent=${expectedSent} paid=${expectedPaid} overdue=${expectedOverdue}`);

  // Converted quotations check
  const convertedCount = seedQuotes.filter(q => q.status === 'Converted').length;
  const convOk = convertedCount >= CONVERT_TARGET;
  console.log(`  Converted quotations:      ${convertedCount}  ${convOk ? '✓' : '✗ (need >= ' + CONVERT_TARGET + ')'}`);
  if (!convOk) pass = false;

  if (pass) console.log('\n  ✓ All verification checks passed');
  else { console.error('\n  ✗ Verification FAILED'); process.exit(1); }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' Sales seeding: Quotations, Invoices, Delivery Orders      ');
  console.log('═══════════════════════════════════════════════════════════');

  const cookie = await login();
  console.log(`✓ Authenticated as ${USERNAME}`);

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

  // Step 1: Quotations
  const quotations = await seedQuotations(cookie, customers, products);

  // Step 2: Convert accepted quotations
  const convertedInvoices = await convertQuotations(cookie, quotations);
  console.log(`  Converted invoice IDs collected: ${convertedInvoices.length}`);

  // Step 3: Direct invoices (always target DIRECT_TARGET regardless of conversions)
  const directInvoices = await seedDirectInvoices(cookie, customers, products);

  // Step 4: Delivery orders
  const allInvoices: Invoice[] = [...convertedInvoices, ...directInvoices];
  await seedDeliveryOrders(cookie, customers, products, allInvoices);

  // Step 5: Verify
  await verify(cookie);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Sales seeding complete!                                    ');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
