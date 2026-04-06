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
 *   npx tsx scripts/delete-dummy-data.ts           # live delete
 *   npx tsx scripts/delete-dummy-data.ts --dry-run  # show counts only, no changes
 *
 * Safe to run multiple times (idempotent).
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');

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
  // Nullify brand_id on any user products/POs that still reference a seed/e2e brand,
  // then delete all non-user brands unconditionally.

  if (!DRY_RUN) {
    await pool.query(`
      UPDATE products SET brand_id = NULL
      WHERE data_source = 'user'
        AND brand_id IN (SELECT id FROM brands WHERE data_source IN ('seed', 'e2e_test'))
    `);
    await pool.query(`
      UPDATE purchase_orders SET brand_id = NULL
      WHERE brand_id IN (SELECT id FROM brands WHERE data_source IN ('seed', 'e2e_test'))
    `);
  }

  const n4 = await del('brands', `data_source IN ${DUMMY}`, 'brands');

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
