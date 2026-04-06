/**
 * cleanup-e2e-leftovers.ts
 *
 * One-time script to remove E2E test records that accumulated in the DB
 * because the PO lifecycle afterAll could not delete GRN-closed POs.
 *
 * Records to remove:
 *   - 9 E2E POs (PO-119 to PO-135, notes = 'E2E GRN lifecycle test PO')
 *     and their GRN items, stock movements, GRNs, and PO items
 *   - 1 E2E invoice (INV-23) and its line items
 *   - 6 test customers and any dependent quotations/invoices/DOs
 *
 * Usage:
 *   npx tsx scripts/cleanup-e2e-leftovers.ts --dry-run   # preview only
 *   npx tsx scripts/cleanup-e2e-leftovers.ts             # live delete
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');

async function run(sql: string, label: string): Promise<number> {
  const countSql = sql.replace(/^DELETE FROM/, 'SELECT COUNT(*) AS n FROM').replace(/\n/g, ' ');
  const countResult = await pool.query(
    countSql.includes('SELECT COUNT(*)') ? countSql : `SELECT COUNT(*) AS n FROM (${sql}) AS t`,
  ).catch(() => pool.query(`SELECT COUNT(*) AS n FROM (${sql} RETURNING 1) AS t`));
  const n = parseInt(countResult.rows[0]?.n ?? '0', 10);
  if (n > 0 && !DRY_RUN) {
    await pool.query(sql);
  }
  if (n > 0) console.log(`  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'} ${n} ${label}`);
  return n;
}

async function countRows(sql: string): Promise<number> {
  const r = await pool.query(sql);
  return parseInt(r.rows[0]?.n ?? '0', 10);
}

async function deleteRows(sql: string, label: string): Promise<number> {
  const cntSql = sql.replace(/^DELETE\s+FROM\s+(\S+)\s+WHERE\s+/i, 'SELECT COUNT(*) AS n FROM $1 WHERE ');
  const n = await countRows(cntSql);
  if (n > 0) {
    if (!DRY_RUN) await pool.query(sql);
    console.log(`  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'} ${n} ${label}`);
  }
  return n;
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== CLEANING UP E2E LEFTOVERS ===');

  const E2E_PO_IDS = [671, 673, 675, 677, 679, 681, 683, 685, 687];
  const E2E_GRN_IDS = [231, 232, 233, 234, 235, 236, 237, 238, 239];
  const TEST_CUSTOMER_IDS = [406, 410, 411, 412, 413, 424];
  const E2E_INVOICE_ID = 1096;

  const poIdList = E2E_PO_IDS.join(',');
  const grnIdList = E2E_GRN_IDS.join(',');
  const custIdList = TEST_CUSTOMER_IDS.join(',');

  console.log('\n-- E2E PO cleanup (9 POs with GRNs) --');

  await deleteRows(
    `DELETE FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id IN (${grnIdList})`,
    'stock_movements (E2E GRNs)',
  );

  await deleteRows(
    `DELETE FROM goods_receipt_items WHERE receipt_id IN (${grnIdList})`,
    'goods_receipt_items (E2E GRNs)',
  );

  await deleteRows(
    `DELETE FROM goods_receipts WHERE id IN (${grnIdList})`,
    'goods_receipts (E2E)',
  );

  await deleteRows(
    `DELETE FROM purchase_order_items WHERE po_id IN (${poIdList})`,
    'purchase_order_items (E2E POs)',
  );

  await deleteRows(
    `DELETE FROM purchase_orders WHERE id IN (${poIdList})`,
    'purchase_orders (E2E)',
  );

  console.log('\n-- E2E invoice cleanup --');

  await deleteRows(
    `DELETE FROM invoice_line_items WHERE invoice_id = ${E2E_INVOICE_ID}`,
    'invoice_line_items (E2E invoice)',
  );

  await deleteRows(
    `DELETE FROM invoices WHERE id = ${E2E_INVOICE_ID}`,
    'invoices (E2E)',
  );

  console.log('\n-- Test customer cleanup (6 customers) --');

  await deleteRows(
    `DELETE FROM delivery_order_items WHERE do_id IN (SELECT id FROM delivery_orders WHERE customer_id IN (${custIdList}))`,
    'delivery_order_items (test customers)',
  );

  await deleteRows(
    `DELETE FROM delivery_orders WHERE customer_id IN (${custIdList})`,
    'delivery_orders (test customers)',
  );

  await deleteRows(
    `DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id IN (${custIdList}))`,
    'invoice_line_items (test customers)',
  );

  await deleteRows(
    `DELETE FROM invoices WHERE customer_id IN (${custIdList})`,
    'invoices (test customers)',
  );

  await deleteRows(
    `DELETE FROM quotation_items WHERE quote_id IN (SELECT id FROM quotations WHERE customer_id IN (${custIdList}))`,
    'quotation_items (test customers)',
  );

  await deleteRows(
    `DELETE FROM quotations WHERE customer_id IN (${custIdList})`,
    'quotations (test customers)',
  );

  await deleteRows(
    `DELETE FROM customers WHERE id IN (${custIdList})`,
    'customers (test)',
  );

  console.log('\nDone.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
