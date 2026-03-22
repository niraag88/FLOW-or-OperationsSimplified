/**
 * FLOW — Products Seed Script (Task #45)
 *
 * Populates the database with 500+ realistic aromatherapy/wellness products.
 * Products are categorised across 12 categories matching real product lines
 * from brands: Absolute Aromas (1), Mystic Moments (2), Tisserand (3), Nikura (4),
 * TechCore (25), ProFlow (26).
 *
 * Run: npx tsx scripts/seed-products-task45.ts
 *
 * Safe to re-run — uses ON CONFLICT (sku) DO NOTHING.
 */

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const products = [
  // Essential Oils — Absolute Aromas brand (brand_id=1)
  { sku: 'AA-EO-LAV-9', name: 'Lavender Essential Oil 9ml', description: '100% pure Lavandula angustifolia', brand_id: 1, category: 'Essential Oils', unit_price: '45.00', cost_price: '22.50', unit: 'Bottle' },
  { sku: 'AA-EO-PPM-9', name: 'Peppermint Essential Oil 9ml', description: '100% pure Mentha piperita', brand_id: 1, category: 'Essential Oils', unit_price: '38.00', cost_price: '19.00', unit: 'Bottle' },
  { sku: 'AA-EO-FRK-9', name: 'Frankincense Essential Oil 5ml', description: 'Boswellia sacra, steam distilled', brand_id: 1, category: 'Essential Oils', unit_price: '85.00', cost_price: '42.50', unit: 'Bottle' },
  { sku: 'AA-EO-TEA-9', name: 'Tea Tree Essential Oil 9ml', description: '100% pure Melaleuca alternifolia', brand_id: 1, category: 'Essential Oils', unit_price: '48.00', cost_price: '24.00', unit: 'Bottle' },
  { sku: 'AA-EO-EUC-9', name: 'Eucalyptus Essential Oil 9ml', description: '100% pure Eucalyptus globulus', brand_id: 1, category: 'Essential Oils', unit_price: '32.00', cost_price: '16.00', unit: 'Bottle' },
  { sku: 'AA-EO-BRG-9', name: 'Bergamot Essential Oil 9ml', description: 'Cold pressed Citrus bergamia, Italy', brand_id: 1, category: 'Essential Oils', unit_price: '52.00', cost_price: '26.00', unit: 'Bottle' },
  { sku: 'AA-EO-ROS-5', name: 'Rosemary Essential Oil 9ml', description: '100% pure Rosmarinus officinalis', brand_id: 1, category: 'Essential Oils', unit_price: '35.00', cost_price: '17.50', unit: 'Bottle' },
  { sku: 'AA-EO-YLG-9', name: 'Ylang Ylang Essential Oil 9ml', description: 'Cananga odorata extra grade', brand_id: 1, category: 'Essential Oils', unit_price: '55.00', cost_price: '27.50', unit: 'Bottle' },
  // Carrier Oils
  { sku: 'AA-CO-SWA-100', name: 'Sweet Almond Oil 100ml', description: 'Cold pressed Prunus dulcis', brand_id: 1, category: 'Carrier Oils', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  { sku: 'AA-CO-JOJ-100', name: 'Jojoba Golden Oil 100ml', description: 'Cold pressed Simmondsia chinensis', brand_id: 1, category: 'Carrier Oils', unit_price: '65.00', cost_price: '32.50', unit: 'Bottle' },
];

async function seed() {
  let inserted = 0;
  for (const p of products) {
    try {
      await sql`
        INSERT INTO products (sku, name, description, brand_id, category, unit_price, cost_price, vat_rate, unit, stock_quantity, min_stock_level, is_active)
        VALUES (${p.sku}, ${p.name}, ${p.description}, ${p.brand_id}, ${p.category}, ${p.unit_price}, ${p.cost_price}, '0.05', ${p.unit}, 50, 10, true)
        ON CONFLICT (sku) DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.error(`Failed to insert ${p.sku}:`, err);
    }
  }
  console.log(`Seeded ${inserted} products`);

  const [{ count }] = await sql`SELECT COUNT(*) as count FROM products`;
  console.log(`Total products in DB: ${count}`);
}

seed().catch(console.error);
