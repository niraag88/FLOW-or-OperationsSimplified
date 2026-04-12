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
 *   npx tsx scripts/delete-dummy-data.ts --all-user-data          # FULL factory reset
 *   npx tsx scripts/delete-dummy-data.ts --all-user-data --dry-run # preview full reset
 *
 * --all-user-data wipes EVERYTHING (equivalent to POST /api/ops/factory-reset).
 * It deletes all business tables in FK-safe order, then re-inserts a blank
 * company_settings row.  The users table and ops schema are preserved.
 *
 * Safe to run multiple times (idempotent).
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');
const ALL_USER_DATA = process.argv.includes('--all-user-data');

/**
 * executeFactoryReset — shared reset logic used by both this CLI script and
 * the POST /api/ops/factory-reset HTTP endpoint.
 *
 * Deletes all business data in FK-safe order and re-inserts a blank
 * company_settings row.  Runs inside a single pg transaction.
 *
 * @param client - a connected pg PoolClient (caller must release it)
 * @param dryRun - if true, prints what would be deleted but rolls back
 */
export async function executeFactoryReset(
  client: pkg.PoolClient,
  dryRun = false,
): Promise<{ tablesCleared: string[]; rowsDeleted: number }> {
  const tablesCleared: string[] = [];
  let rowsDeleted = 0;

  const wipe = async (table: string) => {
    const count = await client.query(`SELECT COUNT(*) AS n FROM ${table}`);
    const n = parseInt(count.rows[0].n, 10);
    if (!dryRun) {
      await client.query(`DELETE FROM ${table}`);
    }
    if (n > 0) {
      tablesCleared.push(table);
      rowsDeleted += n;
    }
    console.log(`  ${dryRun ? '[dry]' : 'DEL '} ${table.padEnd(30)} ${n} rows`);
  };

  await client.query('BEGIN');
  try {
    // Children before parents — mirrors HTTP route order
    await wipe('stock_movements');
    await wipe('stock_count_items');
    await wipe('stock_counts');
    await wipe('goods_receipt_items');
    await wipe('goods_receipts');
    await wipe('purchase_order_items');
    await wipe('purchase_orders');
    await wipe('invoice_line_items');
    await wipe('invoices');
    await wipe('delivery_order_items');
    await wipe('delivery_orders');
    await wipe('quotation_items');
    await wipe('quotations');
    await wipe('products');
    await wipe('customers');
    await wipe('suppliers');
    await wipe('brands');
    await wipe('recycle_bin');
    await wipe('storage_objects');
    await wipe('audit_log');
    await wipe('vat_returns');
    await wipe('financial_years');
    await wipe('backup_runs');
    await wipe('signed_tokens');
    await wipe('storage_monitoring');

    if (!dryRun) {
      await client.query('DELETE FROM company_settings');
      await client.query(`INSERT INTO company_settings (company_name) VALUES ('')`);
      console.log(`  RESET company_settings (blank row inserted)`);
    } else {
      console.log(`  [dry] company_settings would be reset to blank row`);
    }

    if (dryRun) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }

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
      console.log('  ⚠  This will wipe EVERY product, order, invoice, and customer record.');
      console.log('  ⚠  Users and ops.restore_runs are preserved.');
    }
    const client = await pool.connect();
    try {
      const { rowsDeleted } = await executeFactoryReset(client, DRY_RUN);
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
