/**
 * populate-sales-api.ts
 * Comprehensive sales seeding script — all data created via authenticated REST API.
 * No direct database access; idempotency is managed through API list/delete endpoints.
 *
 * Creates:
 *   - 300 Quotations  (Draft=50, Sent=100, Accepted=100, Expired=50)
 *   - Converts Accepted quotations via POST /api/invoices/from-quotation
 *     → Updates exactly CONVERT_DRAFT_TARGET (50) converted invoices to remain draft,
 *       promotes remainder to Sent/Paid/Overdue via PUT /api/invoices/:id
 *   - 300 Direct Invoices (Sent=130, Paid=125, Overdue=45) — no draft
 *   - 300 Delivery Orders  (~150 linked to invoices, ~150 standalone)
 *
 * Target totals (assuming 100 converted invoices in DB):
 *   Converted: Draft=50, Sent=20, Paid=25, Overdue=5
 *   Direct:    Sent=130, Paid=125, Overdue=45
 *   Grand total: Draft=50, Sent=150, Paid=150, Overdue=50 = 400 ✓
 *
 * Schema prerequisite: invoices.payment_method column.
 *   Applied separately via: psql "$DATABASE_URL" -f scripts/migrate-task56-invoice-payment-method.sql
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
const DIRECT_TARGET  = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer  { id: number; name: string }
interface Product   { id: number; name: string; sku: string; unitPrice: string; isActive: boolean }
interface Quotation { id: number; quoteNumber: string; status: string; notes?: string | null }
interface Invoice   { id: number; invoiceNumber: string; notes?: string | null; status?: string; paymentMethod?: string | null; amount?: string; vatAmount?: string | null; invoiceDate?: string | null; currency?: string; customerId?: number | null }
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

async function fetchConvertedInvoices(cookie: string): Promise<Invoice[]> {
  const { data } = await apiGet('/api/invoices', cookie);
  const list = Array.isArray(data) ? (data as Invoice[]) : ((data as { invoices?: Invoice[] }).invoices ?? []);
  return list.filter(i => i.notes?.startsWith('Converted from Quotation'));
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
      converted.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        amount: inv.amount,
        vatAmount: inv.vatAmount,
        invoiceDate: inv.invoiceDate,
        currency: inv.currency ?? 'AED',
        customerId: inv.customerId,
        status: 'draft',
      });
    } else {
      failed++;
    }
  }

  console.log(`  ✓ Converted: ${converted.length}, Failed: ${failed}`);
  return converted;
}

// ─── 2b. Reassign statuses on converted invoices to achieve exact totals ───────
// Converted invoices start as 'draft'. We target exact non-draft counts:
//   Sent=20, Paid=25, Overdue=5 from converted invoices
// This leaves exactly Draft=50 from converted (assuming 100 converted total).
// Direct invoices cover the remaining: Sent=130, Paid=125, Overdue=45
// Grand total: Draft=50, Sent=150, Paid=150, Overdue=50 = 400 ✓

const CONVERT_DRAFT_TARGET = 50; // leave exactly this many converted invoices as draft
// Exact target counts for converted non-draft invoices:
const CONVERT_NON_DRAFT_TARGETS = { sent: 20, paid: 25, overdue: 5 } as const;

async function reassignConvertedStatuses(
  cookie: string,
  converted: Invoice[],
): Promise<void> {
  console.log('\n── Reassign converted invoice statuses (target: Sent=20, Paid=25, Overdue=5) ───');

  // If conversion was skipped (empty array), fetch from API instead
  let candidates = converted;
  if (candidates.length === 0) {
    candidates = await fetchConvertedInvoices(cookie);
    console.log(`  → Fetched ${candidates.length} converted invoices from API`);
  }

  // Count current non-draft status distribution
  const currentSent    = candidates.filter(inv => inv.status === 'sent').length;
  const currentPaid    = candidates.filter(inv => inv.status === 'paid').length;
  const currentOverdue = candidates.filter(inv => inv.status === 'overdue').length;
  const currentDraft   = candidates.filter(inv => inv.status === 'draft').length;
  console.log(`  Current: Draft=${currentDraft}, Sent=${currentSent}, Paid=${currentPaid}, Overdue=${currentOverdue}`);

  // Compute exactly how many MORE of each non-draft status are needed
  // Also handle case where a status exceeds target (revert excess back to draft)
  const needSent    = Math.max(0, CONVERT_NON_DRAFT_TARGETS.sent    - currentSent);
  const needPaid    = Math.max(0, CONVERT_NON_DRAFT_TARGETS.paid    - currentPaid);
  const needOverdue = Math.max(0, CONVERT_NON_DRAFT_TARGETS.overdue - currentOverdue);
  const excessSent    = Math.max(0, currentSent    - CONVERT_NON_DRAFT_TARGETS.sent);
  const excessPaid    = Math.max(0, currentPaid    - CONVERT_NON_DRAFT_TARGETS.paid);
  const excessOverdue = Math.max(0, currentOverdue - CONVERT_NON_DRAFT_TARGETS.overdue);
  const totalNeeded   = needSent + needPaid + needOverdue;
  const totalExcess   = excessSent + excessPaid + excessOverdue;
  console.log(`  Need: +${totalNeeded} updates (Sent+${needSent}, Paid+${needPaid}, Overdue+${needOverdue}); Excess (revert to draft): Sent-${excessSent}, Paid-${excessPaid}, Overdue-${excessOverdue}`);

  // Revert excess statuses back to draft
  if (totalExcess > 0) {
    const toRevert: Invoice[] = [
      ...candidates.filter(inv => inv.status === 'sent').slice(0, excessSent),
      ...candidates.filter(inv => inv.status === 'paid').slice(0, excessPaid),
      ...candidates.filter(inv => inv.status === 'overdue').slice(0, excessOverdue),
    ];
    let reverted = 0;
    for (const inv of toRevert) {
      const { status: http } = await apiFetch(`/api/invoices/${inv.id}`, 'PUT', cookie, {
        customer_id:  inv.customerId,
        status:       'draft',
        total_amount: inv.amount ?? '0',
        tax_amount:   inv.vatAmount ?? '0',
        invoice_date: inv.invoiceDate,
        currency:     inv.currency ?? 'AED',
        notes:        inv.notes ?? undefined,
      });
      if (http === 200) reverted++;
    }
    console.log(`  → Reverted ${reverted} excess non-draft invoices back to draft`);
  }

  if (totalNeeded === 0 && totalExcess === 0) {
    console.log(`  → All targets already met — skipping`);
    return;
  }

  if (totalNeeded === 0) return;

  // Build exact update list
  const updates: string[] = [
    ...Array(needSent).fill('sent'),
    ...Array(needPaid).fill('paid'),
    ...Array(needOverdue).fill('overdue'),
  ];

  // Re-fetch draft candidates after potential reversions
  const draftCandidates = (await fetchConvertedInvoices(cookie)).filter(inv => inv.status === 'draft');
  const toUpdate = draftCandidates.slice(0, totalNeeded);
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < toUpdate.length; i++) {
    const inv = toUpdate[i];
    const newStatus = updates[i];
    const pm = newStatus === 'paid' ? pick(PAYMENT_METHODS) : undefined;

    const { status: http } = await apiFetch(`/api/invoices/${inv.id}`, 'PUT', cookie, {
      customer_id:    inv.customerId,
      status:         newStatus,
      total_amount:   inv.amount ?? '0',
      tax_amount:     inv.vatAmount ?? '0',
      invoice_date:   inv.invoiceDate,
      currency:       inv.currency ?? 'AED',
      payment_method: pm,
      notes:          inv.notes ?? undefined,
    });

    if (http === 200) updated++;
    else failed++;
  }

  const finalDraft = draftCandidates.length - updated + (totalExcess > 0 ? totalExcess : 0);
  console.log(`  ✓ Updated: ${updated}, Failed: ${failed}. Converted draft remaining: ≈${finalDraft}`);
}

// ─── 3. Direct invoices ───────────────────────────────────────────────────────

// Exact status pool sized to DIRECT_TARGET (300). No drafts.
// Converted invoices provide: Draft=50, Sent=20, Paid=25, Overdue=5
// Direct invoices provide:            Sent=130, Paid=125, Overdue=45
// Grand total: Draft=50, Sent=150, Paid=150, Overdue=50 = 400 ✓
const INVOICE_STATUS_POOL: string[] = (() => {
  const pool = [
    ...Array(130).fill('sent'),
    ...Array(125).fill('paid'),
    ...Array(45).fill('overdue'),
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

  // Validate existing batch: correct count, no drafts, paid invoices have payment_method
  const hasDrafts = existing.some(inv => inv.status === 'draft');
  const missingPaymentMethod = existing.some(inv => inv.status === 'paid' && !inv.paymentMethod);
  const wrongCount = existing.length !== DIRECT_TARGET;

  if (!wrongCount && !hasDrafts && !missingPaymentMethod) {
    console.log(`  → Already have ${existing.length} seeded direct invoices (correct distribution) — skipping`);
    return existing;
  }

  if (existing.length > 0) {
    const reasons: string[] = [];
    if (wrongCount) reasons.push(`wrong count (${existing.length} ≠ ${DIRECT_TARGET})`);
    if (hasDrafts) reasons.push('has drafts');
    if (missingPaymentMethod) reasons.push('paid invoices missing payment_method');
    console.log(`  → Clearing ${existing.length} existing seeded invoices (${reasons.join(', ')})...`);
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
  const invByStatus: Record<string, number> = {};
  seedInvoices.forEach(inv => {
    const s = inv.status ?? 'unknown';
    invByStatus[s] = (invByStatus[s] ?? 0) + 1;
  });
  console.log(`  Invoice status distribution (direct 320):`, JSON.stringify(invByStatus));
  // Direct invoices: no drafts; all should be sent/paid/overdue
  const directHasDraft = (invByStatus['draft'] ?? 0) > 0;
  if (directHasDraft) { console.error('  ✗ Direct invoices must not contain drafts'); pass = false; }

  // Payment method: paid invoices must have payment_method set
  const paidInvWithMethod = seedInvoices.filter(inv => inv.status === 'paid' && inv.paymentMethod);
  const pmOk = paidInvWithMethod.length > 0;
  console.log(`  Paid invoices with payment_method:   ${paidInvWithMethod.length} ${pmOk ? '✓' : '✗ (paid invoices missing payment_method)'}`);
  if (!pmOk) pass = false;

  // Verify exact distribution: direct pool has precise counts, no drafts
  const expectedSent    = INVOICE_STATUS_POOL.filter(s => s === 'sent').length;
  const expectedPaid    = INVOICE_STATUS_POOL.filter(s => s === 'paid').length;
  const expectedOverdue = INVOICE_STATUS_POOL.filter(s => s === 'overdue').length;
  const directDistOk = (invByStatus['sent'] ?? 0) === expectedSent &&
                       (invByStatus['paid'] ?? 0) === expectedPaid &&
                       (invByStatus['overdue'] ?? 0) === expectedOverdue;
  console.log(`  Expected direct distribution: sent=${expectedSent} paid=${expectedPaid} overdue=${expectedOverdue} (draft=0) ${directDistOk ? '✓' : '✗'}`);
  if (!directDistOk) pass = false;
  console.log(`  Grand total targets: Draft=50, Sent=150, Paid=150, Overdue=50 (converted provides Draft=50, Sent=20, Paid=25, Overdue=5)`);

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

  // Step 2: Convert accepted quotations → draft invoices
  const convertedInvoices = await convertQuotations(cookie, quotations);
  console.log(`  Converted invoice IDs collected: ${convertedInvoices.length}`);

  // Step 2b: Update 30 converted invoices from draft → sent/paid/overdue
  await reassignConvertedStatuses(cookie, convertedInvoices);

  // Step 3: Direct invoices (Sent=140, Paid=135, Overdue=45; no draft)
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
