/**
 * FLOW — Multi-Currency PO Seed Script
 *
 * Creates ~30 USD and ~30 INR test purchase orders assigned to US/Indian suppliers.
 * PO numbers are prefixed PO-TEST-USD- and PO-TEST-INR- for easy cleanup.
 *
 * USD PO totals are constrained to USD 200–5,000 per PO.
 * INR PO totals are constrained to INR 5,000–200,000 per PO.
 *
 * ============================================================
 * CLEANUP SQL
 * ============================================================
 *   DELETE FROM purchase_order_items
 *     WHERE po_id IN (
 *       SELECT id FROM purchase_orders
 *       WHERE po_number LIKE 'PO-TEST-USD-%' OR po_number LIKE 'PO-TEST-INR-%'
 *     );
 *
 *   DELETE FROM purchase_orders
 *     WHERE po_number LIKE 'PO-TEST-USD-%' OR po_number LIKE 'PO-TEST-INR-%';
 *
 * ============================================================
 * Run:  npx tsx scripts/seed-multi-currency-pos.ts
 * ============================================================
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randDec = (min: number, max: number, dp = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(dp));
const pastDate = (maxDaysAgo: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() - rand(0, maxDaysAgo));
  return d;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Distribute a target total across 1–4 line items.
 * Returns an array of { qty, unitPrice, lineTotal } objects that sum to exactly targetTotal.
 */
function distributeTotal(
  targetTotal: number,
  products: { id: number }[],
  lineCount: number
): { productId: number; qty: number; unitPrice: number; lineTotal: number }[] {
  const lines: { productId: number; qty: number; unitPrice: number; lineTotal: number }[] = [];

  for (let i = 0; i < lineCount; i++) {
    const isLast = i === lineCount - 1;
    const remaining = parseFloat(
      (targetTotal - lines.reduce((s, l) => s + l.lineTotal, 0)).toFixed(2)
    );

    let lineTotal: number;
    if (isLast) {
      lineTotal = remaining;
    } else {
      // Assign between 10% and 60% of remaining to this line
      const share = randDec(0.1, 0.6, 4);
      lineTotal = parseFloat((remaining * share).toFixed(2));
    }

    // Choose a sensible quantity and derive unit price
    const qty = rand(2, 50);
    const unitPrice = parseFloat((lineTotal / qty).toFixed(2));
    // Recalculate to avoid rounding drift
    const actualLineTotal = parseFloat((qty * unitPrice).toFixed(2));

    lines.push({
      productId: pick(products).id,
      qty,
      unitPrice,
      lineTotal: actualLineTotal,
    });
  }

  return lines;
}

const PO_STATUSES = ['draft', 'submitted', 'closed'];

async function main() {
  console.log('Starting multi-currency PO seed...');

  // Fetch FX rates from company settings
  const settingsResult = await pool.query(
    'SELECT fx_usd_to_aed, fx_inr_to_aed FROM company_settings LIMIT 1'
  );
  if (settingsResult.rows.length === 0) {
    throw new Error('No company settings found');
  }
  const fxUsdToAed = parseFloat(settingsResult.rows[0].fx_usd_to_aed);
  const fxInrToAed = parseFloat(settingsResult.rows[0].fx_inr_to_aed);
  console.log(`FX rates — USD→AED: ${fxUsdToAed}, INR→AED: ${fxInrToAed}`);

  // Get admin user for created_by
  const adminResult = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'Admin' AND username NOT LIKE 'test_%' LIMIT 1`
  );
  if (adminResult.rows.length === 0) throw new Error('No admin user found');
  const adminId = adminResult.rows[0].id;

  // Get US-based suppliers
  const usSupplierResult = await pool.query(
    `SELECT id, name FROM suppliers
     WHERE name IN (
       'Bulk Apothecary USA', 'Camden-Grey Essential Oils', 'Eden Botanicals',
       'Jedwards International', 'Mountain Rose Herbs', 'Rocky Mountain Oils LLC',
       'Bulk Apothecary Inc', 'Botanical Beauty Inc'
     ) AND is_active = true`
  );
  const usSupplierIds = usSupplierResult.rows.map((r) => r.id);
  console.log(`Found ${usSupplierIds.length} US suppliers`);

  // Get India-based suppliers
  const inSupplierResult = await pool.query(
    `SELECT id, name FROM suppliers
     WHERE name IN (
       'Indian Aroma Products Pvt Ltd', 'Kanta Enterprises', 'Kanta Enterprises Kannauj',
       'Kapco International', 'Prakruti Products', 'Praveen Aroma India',
       'Vedic Botanicals India', 'Green Fields International India'
     ) AND is_active = true`
  );
  const inSupplierIds = inSupplierResult.rows.map((r) => r.id);
  console.log(`Found ${inSupplierIds.length} India suppliers`);

  // Get real products (non-test) for line items
  const productResult = await pool.query(
    `SELECT id FROM products
     WHERE is_active = true AND name NOT LIKE '[TEST]%'
     ORDER BY id LIMIT 30`
  );
  const products = productResult.rows;
  console.log(`Found ${products.length} real products for line items`);

  if (usSupplierIds.length === 0 || inSupplierIds.length === 0) {
    throw new Error('Could not find US or India suppliers — check supplier names in DB');
  }

  // ─── Create USD POs ──────────────────────────────────────────────────────────
  console.log('\nCreating 30 USD purchase orders (totals USD 200–5,000)...');
  let usdCreated = 0;

  for (let i = 1; i <= 30; i++) {
    const poNumber = `PO-TEST-USD-${String(i).padStart(3, '0')}`;
    const supplierId = pick(usSupplierIds);
    const orderDate = pastDate(365);
    const status = pick(PO_STATUSES);

    // Generate a target total within the required range
    const targetTotal = randDec(200, 5000, 2);
    const lineCount = rand(1, 4);
    const lineItems = distributeTotal(targetTotal, products, lineCount);

    // Recalculate totalAmount from actual line totals to avoid rounding drift
    const totalAmount = parseFloat(lineItems.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const grandTotal = parseFloat((totalAmount * fxUsdToAed).toFixed(2));

    const poResult = await pool.query(
      `INSERT INTO purchase_orders
         (po_number, supplier_id, order_date, status, total_amount, grand_total,
          currency, fx_rate_to_aed, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        poNumber,
        supplierId,
        isoDate(orderDate),
        status,
        totalAmount,
        grandTotal,
        'USD',
        fxUsdToAed.toFixed(4),
        `[TEST] USD purchase order for US supplier`,
        adminId,
        orderDate,
        new Date(),
      ]
    );
    const poId = poResult.rows[0].id;

    for (const item of lineItems) {
      await pool.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, quantity, unit_price, line_total, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [poId, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2), new Date()]
      );
    }

    usdCreated++;
    if (i % 10 === 0) console.log(`  → ${usdCreated} USD POs created (last total: USD ${totalAmount.toFixed(2)} → AED ${grandTotal.toFixed(2)})`);
  }

  console.log(`  ✓ ${usdCreated} USD POs created`);

  // ─── Create INR POs ──────────────────────────────────────────────────────────
  console.log('\nCreating 30 INR purchase orders (totals INR 5,000–200,000)...');
  let inrCreated = 0;

  for (let i = 1; i <= 30; i++) {
    const poNumber = `PO-TEST-INR-${String(i).padStart(3, '0')}`;
    const supplierId = pick(inSupplierIds);
    const orderDate = pastDate(365);
    const status = pick(PO_STATUSES);

    // Generate a target total within the required range
    const targetTotal = randDec(5000, 200000, 2);
    const lineCount = rand(1, 4);
    const lineItems = distributeTotal(targetTotal, products, lineCount);

    const totalAmount = parseFloat(lineItems.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const grandTotal = parseFloat((totalAmount * fxInrToAed).toFixed(2));

    const poResult = await pool.query(
      `INSERT INTO purchase_orders
         (po_number, supplier_id, order_date, status, total_amount, grand_total,
          currency, fx_rate_to_aed, notes, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        poNumber,
        supplierId,
        isoDate(orderDate),
        status,
        totalAmount,
        grandTotal,
        'INR',
        fxInrToAed.toFixed(4),
        `[TEST] INR purchase order for Indian supplier`,
        adminId,
        orderDate,
        new Date(),
      ]
    );
    const poId = poResult.rows[0].id;

    for (const item of lineItems) {
      await pool.query(
        `INSERT INTO purchase_order_items
           (po_id, product_id, quantity, unit_price, line_total, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [poId, item.productId, item.qty, item.unitPrice.toFixed(2), item.lineTotal.toFixed(2), new Date()]
      );
    }

    inrCreated++;
    if (i % 10 === 0) console.log(`  → ${inrCreated} INR POs created (last total: INR ${totalAmount.toFixed(2)} → AED ${grandTotal.toFixed(2)})`);
  }

  console.log(`  ✓ ${inrCreated} INR POs created`);

  console.log(`\nDone! Created ${usdCreated} USD POs and ${inrCreated} INR POs.`);

  // Verification summary
  const verifyResult = await pool.query(`
    SELECT currency, count(*) as cnt, min(total_amount) as min_total, max(total_amount) as max_total
    FROM purchase_orders
    WHERE po_number LIKE 'PO-TEST-USD-%' OR po_number LIKE 'PO-TEST-INR-%'
    GROUP BY currency ORDER BY currency
  `);
  console.log('\nVerification:');
  verifyResult.rows.forEach(r => {
    console.log(`  ${r.currency}: ${r.cnt} POs, range: ${parseFloat(r.min_total).toFixed(2)} – ${parseFloat(r.max_total).toFixed(2)}`);
  });

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  pool.end();
  process.exit(1);
});
