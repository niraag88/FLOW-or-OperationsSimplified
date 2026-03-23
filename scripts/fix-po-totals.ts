/**
 * One-off data repair: backfill purchase_orders.total_amount from line items.
 *
 * The seed script (seed-purchasing.ts) created 997 PO line items with valid
 * unit prices but never wrote the computed sum back to purchase_orders.total_amount,
 * leaving all 307 POs showing 0.00 in reports.
 *
 * This script is idempotent — safe to re-run; it will recalculate every PO's
 * total from its current line items.
 *
 * Run once with:  npx tsx scripts/fix-po-totals.ts
 *
 * Status: APPLIED on 2026-03-23 (Task #64). All 307 rows updated.
 *         After fix: min=45.00, max=1,696,638.03, avg=221,577.66
 */

import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function fixPOTotals() {
  console.log("Backfilling purchase_orders.total_amount from line items...");

  const before = await db.execute(
    sql`SELECT COUNT(*) as total, COUNT(CASE WHEN total_amount = 0 THEN 1 END) as zero FROM purchase_orders`
  );
  console.log("Before:", before.rows[0]);

  const result = await db.execute(sql`
    UPDATE purchase_orders
    SET total_amount = (
      SELECT COALESCE(SUM(line_total), 0)
      FROM purchase_order_items
      WHERE po_id = purchase_orders.id
    )
  `);
  console.log(`Updated ${result.rowCount} rows.`);

  const after = await db.execute(
    sql`SELECT COUNT(*) as total, COUNT(CASE WHEN total_amount = 0 THEN 1 END) as zero,
           MIN(total_amount)::text as min_total, MAX(total_amount)::text as max_total,
           ROUND(AVG(total_amount), 2)::text as avg_total
        FROM purchase_orders`
  );
  console.log("After:", after.rows[0]);
  console.log("Done.");
}

fixPOTotals().catch(console.error);
