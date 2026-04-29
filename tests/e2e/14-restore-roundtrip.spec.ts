/**
 * tests/e2e/14-restore-roundtrip.spec.ts
 *
 * Restore Round-Trip spec (Task #335).
 *
 * Task #331 hardened the entry to factory reset so it cannot fire by
 * accident. The only safety net once a real reset DOES fire is the
 * backup-and-restore pipeline. Today nothing automatically proves that
 * pipeline still round-trips. A future schema change, storage refactor,
 * or migration could silently break restoration and the failure would
 * only surface the next time someone genuinely needed it.
 *
 * This spec exercises the full loop in one automated run:
 *
 *   seed fixtures → snapshot row counts + invoice payload
 *     → POST /api/ops/run-backups
 *     → download the .sql.gz to local disk (so it survives the wipe)
 *     → POST /api/ops/factory-reset (with the typed phrase)
 *     → POST /api/ops/restore-upload (replays the saved file)
 *     → assert every FACTORY_RESET_TABLES row count matches the snapshot
 *     → assert the seeded invoice round-trips with all line items
 *
 * GATING: this spec destroys all data. It is skipped unless BOTH:
 *   1. ALLOW_FACTORY_RESET_TESTS=true is set, AND
 *   2. DATABASE_URL contains a known-disposable marker.
 * See tests/e2e/factory-reset-gate.ts. The standing route-gate test at
 * tests/e2e/11-admin-route-gates.spec.ts (which never reaches the helper)
 * keeps running on every CI pass and is unaffected.
 *
 * To run locally against a disposable database:
 *   ALLOW_FACTORY_RESET_TESTS=true \
 *   DATABASE_URL="postgres://.../my_test_db" \
 *   npx playwright test tests/e2e/14-restore-roundtrip.spec.ts
 */
import { test, expect } from '@playwright/test';
import { Pool } from 'pg';
import { createWriteStream, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { apiLogin, apiPost, BASE_URL } from './helpers';
import { gateFactoryResetTests, FACTORY_RESET_CONFIRMATION_PHRASE } from './factory-reset-gate';

/**
 * Mirror of FACTORY_RESET_TABLES in server/factoryReset.ts. Kept as a
 * literal copy here so the test does not import from /server (which
 * would drag the express app into the test process).
 */
const FACTORY_RESET_TABLES = [
  'stock_movements',
  'stock_count_items',
  'stock_counts',
  'goods_receipt_items',
  'goods_receipts',
  'purchase_order_items',
  'purchase_orders',
  'invoice_line_items',
  'invoices',
  'delivery_order_items',
  'delivery_orders',
  'quotation_items',
  'quotations',
  'products',
  'customers',
  'suppliers',
  'brands',
  'recycle_bin',
  'storage_objects',
  'audit_log',
  'vat_returns',
  'financial_years',
  'backup_runs',
  'signed_tokens',
  'storage_monitoring',
] as const;

/**
 * Tables where the post-restore count is allowed to be GREATER than the
 * pre-reset snapshot. The restore route writes a "Database restore … 
 * succeeded" entry to public.audit_log AFTER the dump replays, so the
 * audit_log count will legitimately be slightly higher. Other tables are
 * compared with strict equality.
 */
const TABLES_ALLOWED_TO_GROW = new Set<string>(['audit_log']);

interface SeedFixtures {
  brandId: number;
  supplierId: number;
  customerId: number;
  productId: number;
  productSku: string;
  invoiceId: number;
}

interface InvoiceSnapshot {
  id: number;
  customerId: number | null;
  totalAmount: string;
  taxAmount: string;
  itemCount: number;
  itemSignature: string;
}

let pool: Pool | null = null;

test.describe('Restore round-trip (seed → backup → reset → restore)', () => {
  let cookie: string;
  let fixtures: SeedFixtures;
  let snapshotCounts: Record<string, number>;
  let invoiceSnapshot: InvoiceSnapshot;
  let backupRunId: number;
  let backupFilePath: string;
  let tmpDir: string;

  test.beforeAll(async () => {
    gateFactoryResetTests('Restore round-trip spec (14-restore-roundtrip.spec.ts)');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    cookie = await apiLogin();
    tmpDir = mkdtempSync(join(tmpdir(), 'restore-roundtrip-'));
  });

  test.afterAll(async () => {
    if (backupFilePath) {
      try { unlinkSync(backupFilePath); } catch (_) { /* already gone */ }
    }
    if (tmpDir) {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* already gone */ }
    }
    if (pool) {
      try { await pool.end(); } catch (_) { /* idempotent */ }
      pool = null;
    }
  });

  test('seeds fixture rows across the major business tables', async () => {
    const tag = `roundtrip-${Date.now()}`;

    const brand = await apiPost(
      '/api/brands',
      { name: `Brand-${tag}`, dataSource: 'e2e_test' },
      cookie,
    );
    expect([200, 201]).toContain(brand.status);
    const brandId = (brand.data as { id: number }).id;

    const supplier = await apiPost(
      '/api/suppliers',
      { name: `Supplier-${tag}`, dataSource: 'e2e_test' },
      cookie,
    );
    expect([200, 201]).toContain(supplier.status);
    const supplierId = (supplier.data as { id: number }).id;

    const customer = await apiPost(
      '/api/customers',
      { name: `Customer-${tag}`, dataSource: 'e2e_test' },
      cookie,
    );
    expect([200, 201]).toContain(customer.status);
    const customerId = (customer.data as { id: number }).id;

    const product = await apiPost(
      '/api/products',
      {
        sku: `SKU-${tag}`,
        name: `Product ${tag}`,
        category: 'RoundTrip',
        unit_price: 100,
        stock_qty: 50,
        dataSource: 'e2e_test',
      },
      cookie,
    );
    expect([200, 201]).toContain(product.status);
    const productPayload = product.data as { id: number; sku: string };
    const productId = productPayload.id;
    const productSku = productPayload.sku;

    const items = [
      { product_id: productId, description: `Product ${tag}`, product_code: productSku, quantity: 3, unit_price: 100, line_total: 300 },
      { product_id: productId, description: `Product ${tag} (line 2)`, product_code: productSku, quantity: 2, unit_price: 100, line_total: 200 },
    ];
    const subtotal = items.reduce((s, it) => s + it.line_total, 0);
    const vat = +(subtotal * 0.05).toFixed(2);
    const invoice = await apiPost(
      '/api/invoices',
      {
        customer_id: customerId,
        invoice_date: new Date().toISOString().split('T')[0],
        status: 'Draft',
        tax_amount: vat.toFixed(2),
        total_amount: (subtotal + vat).toFixed(2),
        items,
      },
      cookie,
    );
    expect([200, 201]).toContain(invoice.status);
    const invoiceId = (invoice.data as { id: number }).id;
    expect(invoiceId).toBeGreaterThan(0);

    fixtures = { brandId, supplierId, customerId, productId, productSku, invoiceId };
  });

  test('snapshots row counts across the factory-reset table list', async () => {
    snapshotCounts = await countAllTables(pool!);
    expect(snapshotCounts.brands).toBeGreaterThan(0);
    expect(snapshotCounts.customers).toBeGreaterThan(0);
    expect(snapshotCounts.suppliers).toBeGreaterThan(0);
    expect(snapshotCounts.products).toBeGreaterThan(0);
    expect(snapshotCounts.invoices).toBeGreaterThan(0);
    expect(snapshotCounts.invoice_line_items).toBeGreaterThan(0);
    expect(snapshotCounts.audit_log).toBeGreaterThan(0);

    invoiceSnapshot = await fetchInvoiceSnapshot(cookie, fixtures.invoiceId);
    expect(invoiceSnapshot.itemCount).toBe(2);
    expect(invoiceSnapshot.itemSignature.length).toBeGreaterThan(0);
  });

  test('runs a manual backup that succeeds and produces a downloadable file', async () => {
    // Backup talks to object storage; the global 30 s Playwright timeout
    // is tight under slower CI / cold caches. Bump to 2 min for this leg.
    test.setTimeout(120_000);
    const r = await fetch(`${BASE_URL}/api/ops/run-backups`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { success: boolean; dbBackup?: { success: boolean } };
    expect(body.success).toBe(true);
    expect(body.dbBackup?.success).toBe(true);

    // The route does not echo a backup_run id — query the freshly-inserted row.
    const { rows } = await pool!.query<{ id: number }>(
      `SELECT id FROM backup_runs
        WHERE success = true AND db_storage_key IS NOT NULL
        ORDER BY ran_at DESC LIMIT 1`,
    );
    backupRunId = rows[0]?.id ?? 0;
    expect(backupRunId).toBeGreaterThan(0);
  });

  test('downloads the backup file to local disk so it survives the wipe', async () => {
    test.setTimeout(120_000);
    const r = await fetch(`${BASE_URL}/api/ops/backup-runs/${backupRunId}/download`, {
      headers: { Cookie: cookie },
    });
    expect(r.status).toBe(200);
    expect(r.body).not.toBeNull();

    backupFilePath = join(tmpDir, `backup-${backupRunId}.sql.gz`);
    const ws = createWriteStream(backupFilePath);
    // Convert WHATWG ReadableStream → Node Readable → file. Available on Node 18+.
    await pipeline(Readable.fromWeb(r.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>), ws);

    const stats = statSync(backupFilePath);
    expect(stats.size).toBeGreaterThan(100); // at minimum, more than the gzip header
  });

  test('factory-reset wipes everything when given the typed phrase', async () => {
    const r = await fetch(`${BASE_URL}/api/ops/factory-reset`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: FACTORY_RESET_CONFIRMATION_PHRASE }),
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { ok: boolean };
    expect(body.ok).toBe(true);

    const postReset = await pool!.query<{ c: string }>(`SELECT count(*)::text AS c FROM invoices`);
    expect(parseInt(postReset.rows[0].c, 10)).toBe(0);
    const postResetProducts = await pool!.query<{ c: string }>(`SELECT count(*)::text AS c FROM products`);
    expect(parseInt(postResetProducts.rows[0].c, 10)).toBe(0);
  });

  test('restore-upload brings every factory-reset table back to its snapshot count', async () => {
    test.setTimeout(180_000);
    expect(backupFilePath).toBeTruthy();
    const buf = readFileSync(backupFilePath);
    const blob = new Blob([buf], { type: 'application/gzip' });
    const fd = new FormData();
    fd.append('file', blob, `backup-${backupRunId}.sql.gz`);

    const r = await fetch(`${BASE_URL}/api/ops/restore-upload`, {
      method: 'POST',
      // Do NOT set Content-Type — fetch sets the multipart boundary automatically.
      headers: { Cookie: cookie },
      body: fd,
    });
    expect(r.status).toBe(200);
    const body = await r.json() as { success: boolean };
    expect(body.success).toBe(true);

    const restoredCounts = await countAllTables(pool!);
    for (const table of FACTORY_RESET_TABLES) {
      const snapshot = snapshotCounts[table] ?? 0;
      const restored = restoredCounts[table] ?? 0;
      if (TABLES_ALLOWED_TO_GROW.has(table)) {
        expect(
          restored,
          `${table}: post-restore count should be >= snapshot (snapshot=${snapshot}, restored=${restored})`,
        ).toBeGreaterThanOrEqual(snapshot);
      } else {
        expect(
          restored,
          `${table}: post-restore count should match snapshot (snapshot=${snapshot}, restored=${restored})`,
        ).toBe(snapshot);
      }
    }
  });

  test('the seeded invoice round-trips with intact line items', async () => {
    const restored = await fetchInvoiceSnapshot(cookie, fixtures.invoiceId);
    expect(restored.id).toBe(invoiceSnapshot.id);
    expect(restored.customerId).toBe(invoiceSnapshot.customerId);
    expect(restored.totalAmount).toBe(invoiceSnapshot.totalAmount);
    expect(restored.taxAmount).toBe(invoiceSnapshot.taxAmount);
    expect(restored.itemCount).toBe(invoiceSnapshot.itemCount);
    expect(restored.itemSignature).toBe(invoiceSnapshot.itemSignature);
  });
});

async function countAllTables(pgPool: Pool): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of FACTORY_RESET_TABLES) {
    try {
      const { rows } = await pgPool.query<{ c: string }>(
        `SELECT count(*)::text AS c FROM ${table}`,
      );
      out[table] = parseInt(rows[0]?.c ?? '0', 10);
    } catch (err: unknown) {
      // Tolerate ONLY "relation does not exist" (Postgres SQLSTATE 42P01)
      // so a partial schema does not break the comparison. Any other SQL
      // error (connection, permission, syntax) is a real signal that the
      // restore could be silently broken — re-throw so the test fails
      // loudly instead of producing a false-positive "all counts match 0".
      const code = (err as { code?: string } | null)?.code;
      if (code === '42P01') {
        out[table] = 0;
        continue;
      }
      throw err;
    }
  }
  return out;
}

async function fetchInvoiceSnapshot(cookie: string, invoiceId: number): Promise<InvoiceSnapshot> {
  const r = await fetch(`${BASE_URL}/api/invoices/${invoiceId}`, { headers: { Cookie: cookie } });
  if (r.status !== 200) {
    throw new Error(`GET /api/invoices/${invoiceId} returned ${r.status}`);
  }
  // GET /api/invoices/:id returns SNAKE_CASE keys for both the envelope and
  // for each entry in `items` (see server/routes/invoices.ts ~line 150).
  // Tolerate camelCase too so a future server-side rename does not silently
  // null out the signature and turn the round-trip check into a no-op.
  const body = await r.json() as {
    id: number;
    customer_id?: number | null;
    customerId?: number | null;
    total_amount?: string | number;
    totalAmount?: string | number;
    tax_amount?: string | number;
    taxAmount?: string | number;
    items?: Array<{
      product_id?: number | null;
      productId?: number | null;
      quantity?: string | number;
      unit_price?: string | number;
      unitPrice?: string | number;
      line_total?: string | number;
      lineTotal?: string | number;
    }>;
  };
  const items = body.items ?? [];
  const sig = items
    .map((it) => {
      const pid = it.product_id ?? it.productId ?? '∅';
      const qty = String(it.quantity ?? '');
      const unit = String(it.unit_price ?? it.unitPrice ?? '');
      const line = String(it.line_total ?? it.lineTotal ?? '');
      return `${pid}:${qty}:${unit}:${line}`;
    })
    .sort()
    .join('|');
  return {
    id: body.id,
    customerId: (body.customer_id ?? body.customerId ?? null) as number | null,
    totalAmount: String(body.total_amount ?? body.totalAmount ?? ''),
    taxAmount: String(body.tax_amount ?? body.taxAmount ?? ''),
    itemCount: items.length,
    itemSignature: sig,
  };
}
