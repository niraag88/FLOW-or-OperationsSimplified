/**
 * Task #421 (B4): one-shot backfill that recomputes the quotations
 * header totals (total_amount / vat_amount / grand_total) from the
 * quotation_items rows for every quotation that currently shows the
 * AED 0.00 default. Idempotent — re-running it is a no-op once every
 * row has its true totals.
 *
 * The aggregate matches the runtime helper in
 * server/businessStorage/quotations.ts so the list column and the
 * printed document agree.
 *
 * Run with:  npx tsx scripts/backfill-quotation-totals.ts
 *
 * Requires DATABASE_URL.
 */

import { Pool } from 'pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set; aborting.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url });
  try {
    const { rowCount } = await pool.query(`
      WITH agg AS (
        SELECT q.id AS quote_id,
               COALESCE(SUM(qi.line_total), 0)::numeric(12,2)                       AS subtotal,
               COALESCE(SUM(qi.line_total * qi.vat_rate), 0)::numeric(12,2)         AS vat,
               (COALESCE(SUM(qi.line_total), 0)
              + COALESCE(SUM(qi.line_total * qi.vat_rate), 0))::numeric(12,2)        AS grand
          FROM quotations q
          LEFT JOIN quotation_items qi ON qi.quote_id = q.id
         GROUP BY q.id
      )
      UPDATE quotations q
         SET total_amount = agg.subtotal,
             vat_amount   = agg.vat,
             grand_total  = agg.grand
        FROM agg
       WHERE q.id = agg.quote_id
         AND (
              COALESCE(q.total_amount, 0) <> agg.subtotal
           OR COALESCE(q.vat_amount,   0) <> agg.vat
           OR COALESCE(q.grand_total,  0) <> agg.grand
         );
    `);
    console.log(`backfill-quotation-totals: updated ${rowCount ?? 0} quotation rows`);
  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
