/**
 * delete-dummy-data.ts
 *
 * Safely removes all records with data_source IN ('seed', 'e2e_test') from the
 * four entity tables (products, customers, suppliers, brands) and their dependent
 * transactional rows.
 *
 * Records with data_source = 'user' (the default for anything entered via the app)
 * are NEVER touched.
 *
 * Usage:
 *   npx tsx scripts/delete-dummy-data.ts              # live delete (seed/e2e only)
 *   npx tsx scripts/delete-dummy-data.ts --dry-run    # show counts only, no changes
 *   npx tsx scripts/delete-dummy-data.ts --all-user-data --confirm-phrase="<phrase>"
 *   npx tsx scripts/delete-dummy-data.ts --all-user-data --dry-run    # preview full reset
 *
 * --all-user-data wipes EVERYTHING (equivalent to POST /api/ops/factory-reset).
 * It deletes all business tables in FK-safe order, then re-inserts a blank
 * company_settings row.  Only Admin users in the users table are preserved;
 * the ops schema is preserved.
 *
 * ─── Wall 4 of the four-wall defence (Task #331) ──────────────────────────────
 * Live --all-user-data REQUIRES --confirm-phrase="<exact phrase>" matching
 * FACTORY_RESET_CONFIRMATION_PHRASE. Before running, the script prints the
 * parsed host of DATABASE_URL and pauses with a 5-second countdown that the
 * operator can interrupt with Ctrl-C. Dry-run mode does NOT require the
 * phrase because it never deletes anything (it only counts rows).
 *
 * Safe to run multiple times (idempotent).
 */

import pkg from 'pg';
const { Pool } = pkg;
import {
  FACTORY_RESET_TABLES,
  executeFactoryReset,
  FACTORY_RESET_CONFIRMATION_PHRASE,
} from '../server/factoryReset.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_USER_DATA = process.argv.includes('--all-user-data');

/**
 * Pull the value of a `--key="value"` or `--key=value` style argv flag.
 * Returns undefined if the flag is not present.
 */
function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (!hit) return undefined;
  let v = hit.slice(prefix.length);
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

const CONFIRM_PHRASE_ARG = getArgValue('confirm-phrase');

function parseDatabaseHost(): string {
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    return u.host || '(unknown)';
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function countdown(seconds: number, host: string): Promise<void> {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r  ⏳  Wiping ${host} in ${i}s — press Ctrl-C to abort...   `);
    await sleep(1000);
  }
  process.stdout.write('\r  ⏳  Starting wipe now...                                     \n');
}

export { executeFactoryReset };

/**
 * CLI wrapper around executeFactoryReset that supports --dry-run.
 *
 * Dry-run mode: counts rows in each table (using FACTORY_RESET_TABLES from the
 * shared server module) and prints the plan, but rolls back without deleting.
 * Live mode: delegates to executeFactoryReset() directly (single source of truth).
 *
 * @param client - a connected pg PoolClient (caller must release it)
 * @param dryRun - if true, prints what would be deleted but rolls back
 */
async function runCliFactoryReset(
  client: pkg.PoolClient,
  dryRun = false,
): Promise<{ tablesCleared: string[]; rowsDeleted: number }> {
  if (!dryRun) {
    // CONFIRM_PHRASE_ARG is validated up front in main() before we reach here,
    // but we forward it so the helper's own guard (Wall 1) also sees it.
    return executeFactoryReset(
      client,
      { id: 'cli', name: 'CLI:delete-dummy-data' },
      { confirmation: CONFIRM_PHRASE_ARG ?? '', databaseHost: parseDatabaseHost() },
    );
  }

  // Dry-run: count rows without deleting; use shared table list for consistency
  const tablesCleared: string[] = [];
  let rowsDeleted = 0;

  for (const table of FACTORY_RESET_TABLES) {
    const r = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
    const n = parseInt(r.rows[0].n, 10);
    if (n > 0) {
      tablesCleared.push(table);
      rowsDeleted += n;
    }
    console.log(`  [dry] ${table.padEnd(30)} ${n} rows`);
  }
  console.log(`  [dry] company_settings would be reset to blank row`);

  return { tablesCleared, rowsDeleted };
}

const DUMMY = `('seed', 'e2e_test')`;

async function count(table: string, where: string): Promise<number> {
  const r = await pool.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
  return parseInt(r.rows[0].n, 10);
}

async function del(table: string, where: string, label: string): Promise<number> {
  const n = await count(table, where);
  if (n === 0) return 0;
  if (!DRY_RUN) {
    await pool.query(`DELETE FROM ${table} WHERE ${where}`);
  }
  return n;
}

async function printCounts(label: string) {
  console.log(`\n${label}`);
  const tables = ['products', 'customers', 'suppliers', 'brands'] as const;
  for (const t of tables) {
    const user   = await count(t, `data_source = 'user'`);
    const seed   = await count(t, `data_source = 'seed'`);
    const e2e    = await count(t, `data_source = 'e2e_test'`);
    const other  = await count(t, `data_source NOT IN ('user','seed','e2e_test')`);
    console.log(`  ${t.padEnd(12)} user=${user}  seed=${seed}  e2e_test=${e2e}${other ? `  other=${other}` : ''}`);
  }
}

async function main() {
  // ── --all-user-data: full factory reset path ──────────────────────────────
  if (ALL_USER_DATA) {
    const mode = DRY_RUN ? '=== DRY RUN — FULL FACTORY RESET (no data will be deleted) ===' : '=== FULL FACTORY RESET — deleting ALL business data ===';
    console.log(mode);

    if (!DRY_RUN) {
      // Wall 4: refuse to detonate without the exact phrase on argv.
      if (CONFIRM_PHRASE_ARG !== FACTORY_RESET_CONFIRMATION_PHRASE) {
        console.error('');
        console.error('  ✗  Refusing to run --all-user-data without the confirmation phrase.');
        console.error('');
        console.error('     This script wipes EVERY product, order, invoice, customer, GRN,');
        console.error('     audit log, and non-Admin user account. To proceed you must pass:');
        console.error('');
        console.error(`       --confirm-phrase="${FACTORY_RESET_CONFIRMATION_PHRASE}"`);
        console.error('');
        console.error('     If you only want to preview what would be deleted, re-run with');
        console.error('     --dry-run (no phrase required).');
        console.error('');
        await pool.end();
        process.exit(2);
      }

      const host = parseDatabaseHost();
      console.log('  ⚠  This will wipe EVERY product, order, invoice, and customer record.');
      console.log('  ⚠  Only Admin users and ops.restore_runs are preserved.');
      console.log(`  ⚠  Target database host: ${host}`);
      await countdown(5, host);
    }

    const client = await pool.connect();
    try {
      const { rowsDeleted } = await runCliFactoryReset(client, DRY_RUN);
      console.log(`\n${DRY_RUN ? '[DRY RUN] Would have deleted' : 'Deleted'} ${rowsDeleted} rows total.`);
      if (!DRY_RUN) {
        console.log('\n✓ Factory reset complete. All business data removed; blank company_settings inserted.');
      }
    } finally {
      client.release();
      await pool.end();
    }
    return;
  }

  // ── default path: seed/e2e data only ──────────────────────────────────────
  console.log(DRY_RUN ? '=== DRY RUN — no data will be deleted ===' : '=== DELETING dummy data ===');

  await printCounts('Before:');

  let total = 0;

  // ── 1. CUSTOMERS (data_source != 'user') ───────────────────────────────────
  // Non-user customers' invoices/quotations/DOs must be deleted first (children before parents)

  // 1a. Delivery order items → delivery orders linked to non-user customers
  const doItemsFromCustomer = `do_id IN (
    SELECT id FROM delivery_orders WHERE customer_id IN (
      SELECT id FROM customers WHERE data_source IN ${DUMMY}
    )
  )`;
  const n1a = await del('delivery_order_items', doItemsFromCustomer, 'delivery_order_items (via customer)');

  // 1b. Delivery orders linked to non-user invoices or directly to non-user customers
  const dosFromCustomer = `customer_id IN (SELECT id FROM customers WHERE data_source IN ${DUMMY})`;
  const n1b = await del('delivery_orders', dosFromCustomer, 'delivery_orders (via customer)');

  // 1c. Invoice line items → invoices linked to non-user customers
  const invItemsFromCustomer = `invoice_id IN (
    SELECT id FROM invoices WHERE customer_id IN (
      SELECT id FROM customers WHERE data_source IN ${DUMMY}
    )
  )`;
  const n1c = await del('invoice_line_items', invItemsFromCustomer, 'invoice_line_items (via customer)');

  // 1d. Invoices linked to non-user customers
  const invFromCustomer = `customer_id IN (SELECT id FROM customers WHERE data_source IN ${DUMMY})`;
  const n1d = await del('invoices', invFromCustomer, 'invoices (via customer)');

  // 1e. Quotation items → quotations linked to non-user customers
  const quotItemsFromCustomer = `quote_id IN (
    SELECT id FROM quotations WHERE customer_id IN (
      SELECT id FROM customers WHERE data_source IN ${DUMMY}
    )
  )`;
  const n1e = await del('quotation_items', quotItemsFromCustomer, 'quotation_items (via customer)');

  // 1f. Quotations linked to non-user customers
  const quotFromCustomer = `customer_id IN (SELECT id FROM customers WHERE data_source IN ${DUMMY})`;
  const n1f = await del('quotations', quotFromCustomer, 'quotations (via customer)');

  // 1g. Customers themselves
  const n1g = await del('customers', `data_source IN ${DUMMY}`, 'customers');

  // ── 2. SUPPLIERS (data_source != 'user') ──────────────────────────────────
  // Delete all POs (and their child rows) that reference a non-user supplier.
  // User-entered POs use brand_id rather than supplier_id, so they are not
  // affected. The sole protection is data_source on the supplier row.

  // 2a. Stock movements linked to GRNs of non-user suppliers' POs
  const movFromSupplier = `reference_type = 'goods_receipt' AND reference_id IN (
    SELECT gr.id FROM goods_receipts gr
    JOIN purchase_orders po ON gr.po_id = po.id
    WHERE po.supplier_id IN (SELECT id FROM suppliers WHERE data_source IN ${DUMMY})
  )`;
  const n2a = await del('stock_movements', movFromSupplier, 'stock_movements (via supplier PO)');

  // 2b. GRN items linked to non-user suppliers' POs
  const grnItemsFromSupplier = `receipt_id IN (
    SELECT gr.id FROM goods_receipts gr
    JOIN purchase_orders po ON gr.po_id = po.id
    WHERE po.supplier_id IN (SELECT id FROM suppliers WHERE data_source IN ${DUMMY})
  )`;
  const n2b = await del('goods_receipt_items', grnItemsFromSupplier, 'goods_receipt_items (via supplier)');

  // 2c. GRNs for non-user suppliers' POs
  const grnsFromSupplier = `po_id IN (
    SELECT id FROM purchase_orders
    WHERE supplier_id IN (SELECT id FROM suppliers WHERE data_source IN ${DUMMY})
  )`;
  const n2c = await del('goods_receipts', grnsFromSupplier, 'goods_receipts (via supplier)');

  // 2d. PO items for non-user suppliers' POs
  const poItemsFromSupplier = `po_id IN (
    SELECT id FROM purchase_orders
    WHERE supplier_id IN (SELECT id FROM suppliers WHERE data_source IN ${DUMMY})
  )`;
  const n2d = await del('purchase_order_items', poItemsFromSupplier, 'purchase_order_items (via supplier)');

  // 2e. POs referencing non-user suppliers
  const posFromSupplier = `supplier_id IN (SELECT id FROM suppliers WHERE data_source IN ${DUMMY})`;
  const n2e = await del('purchase_orders', posFromSupplier, 'purchase_orders (via supplier)');

  // 2f. Suppliers themselves
  const n2f = await del('suppliers', `data_source IN ${DUMMY}`, 'suppliers');

  // ── 3. PRODUCTS (data_source != 'user') ───────────────────────────────────
  // Remove all child references to non-user products, then the products themselves.

  const nonUserProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})`;

  // 3a. Stock count items
  const n3a = await del('stock_count_items', nonUserProd, 'stock_count_items (via product)');

  // 3b. Stock movements for non-user products
  const movFromProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})`;
  const n3b = await del('stock_movements', movFromProd, 'stock_movements (via product)');

  // 3c. GRN items for non-user products
  const n3c = await del('goods_receipt_items', nonUserProd, 'goods_receipt_items (via product)');

  // 3d. PO items for non-user products (any PO — product itself is being deleted)
  const poItemsFromProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})`;
  const n3d = await del('purchase_order_items', poItemsFromProd, 'purchase_order_items (via product)');

  // 3e. Invoice line items for non-user products (only on non-user customers' invoices)
  const invItemsFromProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})
    AND invoice_id IN (
      SELECT id FROM invoices WHERE customer_id IN (
        SELECT id FROM customers WHERE data_source IN ${DUMMY}
      )
    )`;
  const n3e = await del('invoice_line_items', invItemsFromProd, 'invoice_line_items (via product)');

  // 3f. Quotation items for non-user products (only on non-user customers' quotations)
  const quotItemsFromProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})
    AND quote_id IN (
      SELECT id FROM quotations WHERE customer_id IN (
        SELECT id FROM customers WHERE data_source IN ${DUMMY}
      )
    )`;
  const n3f = await del('quotation_items', quotItemsFromProd, 'quotation_items (via product)');

  // 3g. Delivery order items for non-user products (only on non-user customers' DOs)
  const doItemsFromProd = `product_id IN (SELECT id FROM products WHERE data_source IN ${DUMMY})
    AND do_id IN (
      SELECT id FROM delivery_orders WHERE customer_id IN (
        SELECT id FROM customers WHERE data_source IN ${DUMMY}
      )
    )`;
  const n3g = await del('delivery_order_items', doItemsFromProd, 'delivery_order_items (via product)');

  // 3h. Products themselves
  const n3h = await del('products', `data_source IN ${DUMMY}`, 'products');

  // ── 4. BRANDS (data_source != 'user') ─────────────────────────────────────
  // Only delete seed/e2e brands that are no longer referenced by user products or
  // user POs, to ensure we never touch or break user data.
  // Brands still referenced by user records are skipped with a warning.

  const unreferencedBrands = await pool.query(`
    SELECT id FROM brands
    WHERE data_source IN ('seed', 'e2e_test')
      AND id NOT IN (SELECT brand_id FROM products WHERE brand_id IS NOT NULL AND data_source = 'user')
      AND id NOT IN (SELECT brand_id FROM purchase_orders WHERE brand_id IS NOT NULL)
  `);
  const deletableBrandIds: number[] = unreferencedBrands.rows.map((r: { id: number }) => r.id);
  const allDummyBrandCount = await count('brands', `data_source IN ${DUMMY}`);
  const skippedCount = allDummyBrandCount - deletableBrandIds.length;

  let n4 = 0;
  if (deletableBrandIds.length > 0) {
    n4 = await del('brands', `id IN (${deletableBrandIds.join(',')})`, 'brands');
  }
  if (skippedCount > 0) {
    console.warn(`  ⚠  ${skippedCount} seed/e2e brand(s) skipped — still referenced by user products or POs.`);
  }

  total = n1a + n1b + n1c + n1d + n1e + n1f + n1g
        + n2a + n2b + n2c + n2d + n2e + n2f
        + n3a + n3b + n3c + n3d + n3e + n3f + n3g + n3h
        + n4;

  await printCounts('After:');

  console.log(`\n${DRY_RUN ? '[DRY RUN] Would have deleted' : 'Deleted'} ${total} rows total.`);

  const remaining = await count('products', `data_source IN ${DUMMY}`)
                  + await count('customers', `data_source IN ${DUMMY}`)
                  + await count('suppliers', `data_source IN ${DUMMY}`)
                  + await count('brands', `data_source IN ${DUMMY}`);

  if (!DRY_RUN && remaining > 0) {
    console.warn(`\n⚠  ${remaining} dummy records remain — manual investigation required.`);
  } else if (!DRY_RUN) {
    console.log('\n✓ All dummy data removed. Only user data remains.');
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
