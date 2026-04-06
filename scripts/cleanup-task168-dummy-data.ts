/**
 * Cleanup script for Task #168 dummy data.
 *
 * During the Reports overhaul task, three workarounds were applied to make
 * pre-existing E2E tests pass without fixing those tests:
 *   1. 210 fake invoices (SEED-EX-*) were inserted to reach a 500+ count threshold.
 *   2. A fake brand with id=1 and name="Default Brand" was inserted.
 *   3. company_settings.grn_number_prefix was changed from 'GRN' to 'GR'.
 *
 * This script reverses all three changes and is idempotent — safe to run multiple times.
 * It also recomputes next_grn_number so the sequence remains consistent after any
 * GR-prefixed receipts that were created while the wrong prefix was active.
 *
 * Run with: npx tsx scripts/cleanup-task168-dummy-data.ts
 */

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    // 1. Delete the 210 fake SEED-EX-* invoices.
    const invResult = await client.query(
      "DELETE FROM invoices WHERE invoice_number LIKE 'SEED-EX-%'"
    );
    console.log(`Deleted ${invResult.rowCount} SEED-EX-* dummy invoice(s).`);

    // 2. Delete the fake "Default Brand" (id=1) if it still exists.
    const brandResult = await client.query(
      "DELETE FROM brands WHERE id = 1 AND name = 'Default Brand'"
    );
    console.log(`Deleted ${brandResult.rowCount} fake brand(s) with id=1.`);

    // 3. Revert GRN prefix from 'GR' back to 'GRN'.
    const prefixResult = await client.query(
      "UPDATE company_settings SET grn_number_prefix = 'GRN' WHERE grn_number_prefix = 'GR'"
    );
    console.log(`Reverted GRN prefix in ${prefixResult.rowCount} row(s).`);

    // 4. Recompute next_grn_number from all existing receipt numbers (GRNxxxx or GRxxxx).
    //    Extract the numeric suffix from both prefixes and take the max + 1.
    const grnRows = await client.query(
      "SELECT receipt_number FROM goods_receipts WHERE receipt_number ~ '^GR[N]?[0-9]+$'"
    );
    let maxNum = 0;
    for (const row of grnRows.rows) {
      const num = parseInt(row.receipt_number.replace(/^GR[N]?/, ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    const nextGrnNumber = maxNum + 1;
    await client.query(
      "UPDATE company_settings SET next_grn_number = $1",
      [nextGrnNumber]
    );
    console.log(
      `Set next_grn_number to ${nextGrnNumber} (max existing suffix was ${maxNum}).`
    );

    // Final verification.
    const [invCount, brandCheck, csRow] = await Promise.all([
      client.query("SELECT COUNT(*) FROM invoices"),
      client.query("SELECT COUNT(*) FROM brands WHERE id = 1"),
      client.query("SELECT grn_number_prefix, next_grn_number FROM company_settings LIMIT 1"),
    ]);
    console.log("\n--- Verification ---");
    console.log("Total invoices:", invCount.rows[0].count);
    console.log("Brand id=1 remaining:", brandCheck.rows[0].count);
    console.log("GRN prefix:", csRow.rows[0]?.grn_number_prefix);
    console.log("Next GRN number:", csRow.rows[0]?.next_grn_number);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Cleanup failed:", err.message);
  process.exit(1);
});
