/**
 * cleanup-e2e-leftovers.ts
 *
 * One-time script to remove E2E test records that accumulated because the PO
 * lifecycle afterAll could not delete GRN-closed POs (no GRN delete API existed).
 *
 * Records removed:
 *   - 9 E2E POs (PO-119 to PO-135, notes = 'E2E GRN lifecycle test PO')
 *     and their stock movements, GRN items, GRNs, and PO items
 *   - 1 E2E invoice (INV-23, id=1096) and its line items
 *   - 6 orphaned test customers (ids: 406, 410, 411, 412, 413, 424)
 *     and their child invoices, quotations, and delivery orders
 *
 * Usage:
 *   npx tsx scripts/cleanup-e2e-leftovers.ts --dry-run   # preview only
 *   npx tsx scripts/cleanup-e2e-leftovers.ts             # live delete
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes('--dry-run');

interface Step {
  label: string;
  countSql: string;
  deleteSql: string;
}

async function applyStep(step: Step): Promise<void> {
  const countResult = await pool.query<{ n: string }>(step.countSql);
  const n = parseInt(countResult.rows[0]?.n ?? '0', 10);
  if (n === 0) return;
  if (!DRY_RUN) await pool.query(step.deleteSql);
  console.log(`  ${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleted'} ${n} ${step.label}`);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== CLEANING UP E2E LEFTOVERS ===');

  const E2E_GRN_IDS = '231,232,233,234,235,236,237,238,239';
  const E2E_PO_IDS = '671,673,675,677,679,681,683,685,687';
  const E2E_INVOICE_ID = '1096';
  const TEST_CUSTOMER_IDS = '406,410,411,412,413,424';

  const steps: Step[] = [
    {
      label: 'stock_movements (linked to E2E GRNs)',
      countSql: `SELECT COUNT(*) AS n FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id IN (${E2E_GRN_IDS})`,
      deleteSql: `DELETE FROM stock_movements WHERE reference_type = 'goods_receipt' AND reference_id IN (${E2E_GRN_IDS})`,
    },
    {
      label: 'goods_receipt_items (E2E GRNs)',
      countSql: `SELECT COUNT(*) AS n FROM goods_receipt_items WHERE receipt_id IN (${E2E_GRN_IDS})`,
      deleteSql: `DELETE FROM goods_receipt_items WHERE receipt_id IN (${E2E_GRN_IDS})`,
    },
    {
      label: 'goods_receipts (E2E)',
      countSql: `SELECT COUNT(*) AS n FROM goods_receipts WHERE id IN (${E2E_GRN_IDS})`,
      deleteSql: `DELETE FROM goods_receipts WHERE id IN (${E2E_GRN_IDS})`,
    },
    {
      label: 'purchase_order_items (E2E POs)',
      countSql: `SELECT COUNT(*) AS n FROM purchase_order_items WHERE po_id IN (${E2E_PO_IDS})`,
      deleteSql: `DELETE FROM purchase_order_items WHERE po_id IN (${E2E_PO_IDS})`,
    },
    {
      label: 'purchase_orders (E2E)',
      countSql: `SELECT COUNT(*) AS n FROM purchase_orders WHERE id IN (${E2E_PO_IDS})`,
      deleteSql: `DELETE FROM purchase_orders WHERE id IN (${E2E_PO_IDS})`,
    },
    {
      label: 'invoice_line_items (E2E invoice)',
      countSql: `SELECT COUNT(*) AS n FROM invoice_line_items WHERE invoice_id = ${E2E_INVOICE_ID}`,
      deleteSql: `DELETE FROM invoice_line_items WHERE invoice_id = ${E2E_INVOICE_ID}`,
    },
    {
      label: 'invoices (E2E)',
      countSql: `SELECT COUNT(*) AS n FROM invoices WHERE id = ${E2E_INVOICE_ID}`,
      deleteSql: `DELETE FROM invoices WHERE id = ${E2E_INVOICE_ID}`,
    },
    {
      label: 'delivery_order_items (test customers)',
      countSql: `SELECT COUNT(*) AS n FROM delivery_order_items WHERE do_id IN (SELECT id FROM delivery_orders WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
      deleteSql: `DELETE FROM delivery_order_items WHERE do_id IN (SELECT id FROM delivery_orders WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
    },
    {
      label: 'delivery_orders (test customers)',
      countSql: `SELECT COUNT(*) AS n FROM delivery_orders WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
      deleteSql: `DELETE FROM delivery_orders WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
    },
    {
      label: 'invoice_line_items (test customer invoices)',
      countSql: `SELECT COUNT(*) AS n FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
      deleteSql: `DELETE FROM invoice_line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
    },
    {
      label: 'invoices (test customers)',
      countSql: `SELECT COUNT(*) AS n FROM invoices WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
      deleteSql: `DELETE FROM invoices WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
    },
    {
      label: 'quotation_items (test customers)',
      countSql: `SELECT COUNT(*) AS n FROM quotation_items WHERE quote_id IN (SELECT id FROM quotations WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
      deleteSql: `DELETE FROM quotation_items WHERE quote_id IN (SELECT id FROM quotations WHERE customer_id IN (${TEST_CUSTOMER_IDS}))`,
    },
    {
      label: 'quotations (test customers)',
      countSql: `SELECT COUNT(*) AS n FROM quotations WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
      deleteSql: `DELETE FROM quotations WHERE customer_id IN (${TEST_CUSTOMER_IDS})`,
    },
    {
      label: 'customers (test)',
      countSql: `SELECT COUNT(*) AS n FROM customers WHERE id IN (${TEST_CUSTOMER_IDS})`,
      deleteSql: `DELETE FROM customers WHERE id IN (${TEST_CUSTOMER_IDS})`,
    },
  ];

  for (const step of steps) {
    await applyStep(step);
  }

  console.log('\nDone.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
  process.exit(1);
});
