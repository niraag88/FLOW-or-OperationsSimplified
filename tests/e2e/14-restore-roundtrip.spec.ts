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
import { RESTORE_PHRASE } from '../../shared/destructiveActionPhrases';
// Single source of truth for the wipe list. Importing from server/factoryReset
// is safe because that file only re-exports the phrase from shared/ and a few
// types from `pg` — no DB connections, no env reads, no Express side effects.
// If the server's list ever changes, this test picks it up automatically.
import { FACTORY_RESET_TABLES } from '../../server/factoryReset';

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
  // Captured at beforeAll so the backup_runs lookup can constrain by
  // ran_at >= testStartTime. Without this, a concurrent backup (e.g.
  // a scheduler firing during the same disposable-DB run) could
  // hand us a different row than the one our manual POST created.
  let testStartTime: Date;

  test.beforeAll(async () => {
    gateFactoryResetTests('Restore round-trip spec (14-restore-roundtrip.spec.ts)');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    cookie = await apiLogin();
    tmpDir = mkdtempSync(join(tmpdir(), 'restore-roundtrip-'));
    testStartTime = new Date();
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

  test('seeds at least one row into every remaining factory-reset table', async () => {
    // Many tables in FACTORY_RESET_TABLES (purchase orders, GRNs, delivery
    // orders, quotations, stock counts, vat_returns, financial_years, etc.)
    // are NOT touched by the API-driven seed above. Without rows in them the
    // restore round-trip degenerates to "0 == 0" for those tables — which
    // would silently miss a future restore regression that drops their data.
    // We use raw SQL here (rather than chasing every public API contract) so
    // the test stays robust to API changes and easy to maintain. The minimal
    // required columns for each table are derived from shared/schema.ts.
    const tag = `roundtrip-${Date.now()}`;

    // createdBy on several tables references users.id (varchar). Pick any
    // existing Admin (the gate ensures we are on a disposable DB so the
    // admin user always exists from the standard seed).
    const adminRows = await pool!.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'Admin' LIMIT 1`,
    );
    const adminUserId = adminRows.rows[0]?.id;
    expect(adminUserId, 'expected at least one Admin user to exist on the disposable DB').toBeTruthy();

    // Purchase order + line item.
    const po = await pool!.query<{ id: number }>(
      `INSERT INTO purchase_orders (po_number, supplier_id, brand_id, status, created_by)
       VALUES ($1, $2, $3, 'draft', $4) RETURNING id`,
      [`PO-${tag}`, fixtures.supplierId, fixtures.brandId, adminUserId],
    );
    const poId = po.rows[0].id;
    const poItem = await pool!.query<{ id: number }>(
      `INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, 5, '50.00', '250.00') RETURNING id`,
      [poId, fixtures.productId],
    );
    const poItemId = poItem.rows[0].id;

    // Goods receipt + line item against that PO.
    const grn = await pool!.query<{ id: number }>(
      `INSERT INTO goods_receipts (receipt_number, po_id, supplier_id, status, created_by)
       VALUES ($1, $2, $3, 'confirmed', $4) RETURNING id`,
      [`GRN-${tag}`, poId, fixtures.supplierId, adminUserId],
    );
    await pool!.query(
      `INSERT INTO goods_receipt_items
         (receipt_id, po_item_id, product_id, ordered_quantity, received_quantity, unit_price)
       VALUES ($1, $2, $3, 5, 5, '50.00')`,
      [grn.rows[0].id, poItemId, fixtures.productId],
    );

    // Delivery order + line item.
    const doRow = await pool!.query<{ id: number }>(
      `INSERT INTO delivery_orders
         (order_number, customer_name, customer_id, delivery_address, status, total_amount, tax_amount)
       VALUES ($1, $2, $3, '123 Test St, Dubai', 'draft', '300.00', '15.00') RETURNING id`,
      [`DO-${tag}`, `Customer-${tag}`, fixtures.customerId],
    );
    await pool!.query(
      `INSERT INTO delivery_order_items
         (do_id, product_id, description, quantity, unit_price, line_total)
       VALUES ($1, $2, $3, 3, '100.00', '300.00')`,
      [doRow.rows[0].id, fixtures.productId, `Delivery line ${tag}`],
    );

    // Quotation + line item.
    const quote = await pool!.query<{ id: number }>(
      `INSERT INTO quotations
         (quote_number, customer_id, status, valid_until, total_amount, vat_amount, grand_total, created_by)
       VALUES ($1, $2, 'draft', NOW() + INTERVAL '30 days', '200.00', '10.00', '210.00', $3) RETURNING id`,
      [`QT-${tag}`, fixtures.customerId, adminUserId],
    );
    await pool!.query(
      `INSERT INTO quotation_items (quote_id, product_id, quantity, unit_price, line_total)
       VALUES ($1, $2, 2, '100.00', '200.00')`,
      [quote.rows[0].id, fixtures.productId],
    );

    // Stock count + item.
    const stockCount = await pool!.query<{ id: number }>(
      `INSERT INTO stock_counts (total_products, total_quantity, created_by)
       VALUES (1, 50, $1) RETURNING id`,
      [adminUserId],
    );
    await pool!.query(
      `INSERT INTO stock_count_items
         (stock_count_id, product_id, product_code, product_name, quantity)
       VALUES ($1, $2, $3, $4, 50)`,
      [stockCount.rows[0].id, fixtures.productId, fixtures.productSku, `Product ${tag}`],
    );

    // Stock movement (initial adjustment for the seed product).
    await pool!.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, reference_id, reference_type, quantity, previous_stock, new_stock, created_by)
       VALUES ($1, 'initial', NULL, 'manual', 50, 0, 50, $2)`,
      [fixtures.productId, adminUserId],
    );

    // Recycle bin entry.
    await pool!.query(
      `INSERT INTO recycle_bin
         (document_type, document_id, document_number, document_data, deleted_by, original_status)
       VALUES ('Invoice', '999999', $1, '{"placeholder":true}', 'roundtrip@test.local', 'draft')`,
      [`INV-recycle-${tag}`],
    );

    // Storage object record.
    await pool!.query(
      `INSERT INTO storage_objects (key, size_bytes) VALUES ($1, 1024)`,
      [`roundtrip/${tag}/placeholder.bin`],
    );

    // VAT return. created_by is NOT NULL on the live schema even though the
    // Drizzle model file does not show it explicitly — verified directly
    // against information_schema.columns when this spec was written.
    await pool!.query(
      `INSERT INTO vat_returns
         (period_start, period_end, status, total_sales, total_purchases, vat_collected, vat_paid, net_vat, created_by)
       VALUES (NOW() - INTERVAL '30 days', NOW(), 'draft', '500.00', '300.00', '25.00', '15.00', '10.00', $1)`,
      [adminUserId],
    );

    // Financial year (year column is unique). Use a far-future year to avoid
    // colliding with anything the standard seed might create. ON CONFLICT
    // DO NOTHING makes the spec rerun-safe on a reused disposable DB:
    // if the row already exists from a previous run the count is already
    // non-zero, which is all the snapshot assertion needs.
    await pool!.query(
      `INSERT INTO financial_years (year, start_date, end_date, status)
       VALUES (2099, '2099-01-01', '2099-12-31', 'Open')
       ON CONFLICT (year) DO NOTHING`,
    );

    // Signed token (filtered separately by the upload flow; insert one
    // directly so the snapshot has a row to count).
    await pool!.query(
      `INSERT INTO signed_tokens (token, key, expires, type)
       VALUES ($1, $2, $3, 'upload')`,
      [`roundtrip-token-${tag}`, `roundtrip/${tag}/placeholder.bin`, Date.now() + 60_000],
    );

    // Storage monitoring entry.
    await pool!.query(
      `INSERT INTO storage_monitoring
         (database_size, object_storage_size, total_documents, backup_status)
       VALUES (1048576, 4096, 1, 'completed')`,
    );
  });

  test('snapshots row counts across the factory-reset table list', async () => {
    snapshotCounts = await countAllTables(pool!);
    // Every table in the canonical wipe list must have at least one row by
    // now — otherwise the restore round-trip cannot prove that table's
    // payload survives. Enumerate explicitly so a future addition to
    // FACTORY_RESET_TABLES surfaces here loudly. backup_runs is the only
    // exception: it gets seeded by the run-backups call in the next test
    // (the route inserts the run row itself).
    const skipPreSeedAssertion = new Set<string>(['backup_runs']);
    for (const table of FACTORY_RESET_TABLES) {
      if (skipPreSeedAssertion.has(table)) continue;
      expect(
        snapshotCounts[table] ?? 0,
        `seed gap: ${table} has no rows before backup. Add a fixture for it in the "seeds at least one row" test.`,
      ).toBeGreaterThan(0);
    }

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

    // The route does not echo a backup_run id — query the freshly-inserted
    // row. Constrain by ran_at >= testStartTime so a concurrent backup
    // (e.g. a scheduler firing during this disposable-DB run) cannot hand
    // us a row from a different POST.
    const { rows } = await pool!.query<{ id: number }>(
      `SELECT id FROM backup_runs
        WHERE success = true AND db_storage_key IS NOT NULL AND ran_at >= $1
        ORDER BY ran_at DESC LIMIT 1`,
      [testStartTime],
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
    // Task #337 typed-confirmation guard for restore-upload. The
    // server's busboy `field` listener captures `confirmation` before
    // runRestore() is called. Append the field BEFORE the file so the
    // phrase is parsed in time even if buffering is disabled.
    fd.append('confirmation', RESTORE_PHRASE);
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
