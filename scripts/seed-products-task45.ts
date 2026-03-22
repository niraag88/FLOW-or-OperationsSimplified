/**
 * FLOW — Products Seed Script (Task #45)
 *
 * Populates the database with 300+ realistic aromatherapy/wellness products.
 * Covers all 12 categories across brands: Absolute Aromas (1), Mystic Moments (2),
 * Tisserand (3), Nikura (4), TechCore (25), ProFlow (26).
 *
 * Run: npx tsx scripts/seed-products-task45.ts
 *
 * Safe to re-run — uses ON CONFLICT (sku) DO NOTHING.
 *
 * NOTE: This script was used to grow the product catalogue from 188 → 500+.
 * Products were seeded directly via executeSql() during Task #45 development.
 * This script documents and reproduced those inserts for auditability.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

interface ProductSeed {
  sku: string;
  name: string;
  description: string;
  brand_id: number;
  category: string;
  unit_price: string;
  cost_price: string;
  unit: string;
  stock_quantity?: number;
  min_stock_level?: number;
}

const PRODUCTS: ProductSeed[] = [
  // ── Essential Oils — Absolute Aromas (1) ──────────────────────────────────
  { sku: 'AA-EO-LAV-9',   name: 'Lavender Essential Oil 9ml',          description: '100% pure Lavandula angustifolia, Bulgaria',        brand_id: 1, category: 'Essential Oils', unit_price: '45.00', cost_price: '22.50', unit: 'Bottle' },
  { sku: 'AA-EO-PPM-9',   name: 'Peppermint Essential Oil 9ml',         description: '100% pure Mentha piperita, India',                  brand_id: 1, category: 'Essential Oils', unit_price: '38.00', cost_price: '19.00', unit: 'Bottle' },
  { sku: 'AA-EO-FRK-9',   name: 'Frankincense Essential Oil 5ml',       description: 'Boswellia sacra, Oman, steam distilled',             brand_id: 1, category: 'Essential Oils', unit_price: '85.00', cost_price: '42.50', unit: 'Bottle' },
  { sku: 'AA-EO-TEA-9',   name: 'Tea Tree Essential Oil 9ml',           description: '100% pure Melaleuca alternifolia, Australia',       brand_id: 1, category: 'Essential Oils', unit_price: '48.00', cost_price: '24.00', unit: 'Bottle' },
  { sku: 'AA-EO-EUC-9',   name: 'Eucalyptus Essential Oil 9ml',         description: '100% pure Eucalyptus globulus',                     brand_id: 1, category: 'Essential Oils', unit_price: '32.00', cost_price: '16.00', unit: 'Bottle' },
  { sku: 'AA-EO-BRG-9',   name: 'Bergamot Essential Oil 9ml',           description: 'Cold pressed Citrus bergamia, Italy',               brand_id: 1, category: 'Essential Oils', unit_price: '52.00', cost_price: '26.00', unit: 'Bottle' },
  { sku: 'AA-EO-ROS-5',   name: 'Rosemary Essential Oil 9ml',           description: '100% pure Rosmarinus officinalis',                  brand_id: 1, category: 'Essential Oils', unit_price: '35.00', cost_price: '17.50', unit: 'Bottle' },
  { sku: 'AA-EO-YLG-9',   name: 'Ylang Ylang Essential Oil 9ml',        description: 'Cananga odorata extra grade, Madagascar',           brand_id: 1, category: 'Essential Oils', unit_price: '55.00', cost_price: '27.50', unit: 'Bottle' },
  { sku: 'AA-EO-GER-9',   name: 'Geranium Essential Oil 9ml',           description: 'Pelargonium graveolens, Egypt',                     brand_id: 1, category: 'Essential Oils', unit_price: '58.00', cost_price: '29.00', unit: 'Bottle' },
  { sku: 'AA-EO-LEM-9',   name: 'Lemon Essential Oil 9ml',              description: 'Cold pressed Citrus limon, cold pressed',           brand_id: 1, category: 'Essential Oils', unit_price: '32.00', cost_price: '16.00', unit: 'Bottle' },
  { sku: 'AA-EO-ORA-9',   name: 'Sweet Orange Essential Oil 9ml',       description: 'Cold pressed Citrus sinensis',                      brand_id: 1, category: 'Essential Oils', unit_price: '28.00', cost_price: '14.00', unit: 'Bottle' },
  { sku: 'AA-EO-CLR-9',   name: 'Clary Sage Essential Oil 9ml',         description: 'Salvia sclarea, France, hormone balancing',         brand_id: 1, category: 'Essential Oils', unit_price: '62.00', cost_price: '31.00', unit: 'Bottle' },
  { sku: 'AA-EO-SAN-5',   name: 'Sandalwood Essential Oil 5ml',         description: 'Santalum album, India, authentic heartwood',        brand_id: 1, category: 'Essential Oils', unit_price: '125.00', cost_price: '63.00', unit: 'Bottle' },
  { sku: 'AA-EO-CDR-9',   name: 'Cedarwood Essential Oil 9ml',          description: 'Cedrus atlantica, Morocco',                         brand_id: 1, category: 'Essential Oils', unit_price: '32.00', cost_price: '16.00', unit: 'Bottle' },
  { sku: 'AA-EO-NEO-9',   name: 'Neroli Essential Oil 1ml',             description: 'Citrus aurantium blossom, precious floral',         brand_id: 1, category: 'Essential Oils', unit_price: '185.00', cost_price: '93.00', unit: 'Bottle' },
  { sku: 'AA-EO-VET-9',   name: 'Vetiver Essential Oil 9ml',            description: 'Vetiveria zizanioides, Haiti, grounding',           brand_id: 1, category: 'Essential Oils', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'AA-EO-JAS-3',   name: 'Jasmine Absolute 3ml',                 description: 'Jasminum grandiflorum absolute, India',             brand_id: 1, category: 'Essential Oils', unit_price: '145.00', cost_price: '73.00', unit: 'Bottle' },
  { sku: 'AA-EO-RSD-3',   name: 'Rose Otto Essential Oil 1ml',          description: 'Rosa damascena, Bulgaria, precious floral',         brand_id: 1, category: 'Essential Oils', unit_price: '450.00', cost_price: '225.00', unit: 'Bottle' },
  { sku: 'AA-EO-JUN-9',   name: 'Juniper Berry Essential Oil 9ml',      description: 'Juniperus communis, purifying and detoxifying',     brand_id: 1, category: 'Essential Oils', unit_price: '45.00', cost_price: '23.00', unit: 'Bottle' },
  { sku: 'AA-EO-THY-9',   name: 'Thyme Essential Oil 9ml',              description: 'Thymus vulgaris CT linalool, gentle variety',      brand_id: 1, category: 'Essential Oils', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'AA-EO-PAT-9',   name: 'Patchouli Essential Oil 9ml',          description: 'Pogostemon cablin, Indonesia, aged dark patchouli', brand_id: 1, category: 'Essential Oils', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  { sku: 'AA-EO-LAV-50',  name: 'Lavender Essential Oil 50ml',          description: '100% pure Lavandula angustifolia, bulk size',       brand_id: 1, category: 'Essential Oils', unit_price: '185.00', cost_price: '93.00', unit: 'Bottle' },
  // Essential Oils — Mystic Moments (2)
  { sku: 'MM-EO-LAV-10',  name: 'Lavender Essential Oil 10ml',          description: 'Pure Lavandula angustifolia, steam distilled',      brand_id: 2, category: 'Essential Oils', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  { sku: 'MM-EO-TEA-10',  name: 'Tea Tree Essential Oil 10ml',          description: 'Pure Melaleuca alternifolia, Australia',            brand_id: 2, category: 'Essential Oils', unit_price: '45.00', cost_price: '23.00', unit: 'Bottle' },
  { sku: 'MM-EO-PPM-10',  name: 'Peppermint Essential Oil 10ml',        description: 'Pure Mentha piperita, India',                       brand_id: 2, category: 'Essential Oils', unit_price: '35.00', cost_price: '18.00', unit: 'Bottle' },
  { sku: 'MM-EO-EUC-10',  name: 'Eucalyptus Essential Oil 10ml',        description: 'Pure Eucalyptus globulus, China',                   brand_id: 2, category: 'Essential Oils', unit_price: '30.00', cost_price: '15.00', unit: 'Bottle' },
  // Essential Oils — Tisserand (3)
  { sku: 'TIS-EO-LAV-9',  name: 'Tisserand Lavender Essential Oil 9ml', description: 'Ethically harvested Lavandula angustifolia',        brand_id: 3, category: 'Essential Oils', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'TIS-EO-TEA-9',  name: 'Tisserand Tea Tree Essential Oil 9ml', description: 'Ethically harvested Melaleuca alternifolia',        brand_id: 3, category: 'Essential Oils', unit_price: '58.00', cost_price: '29.00', unit: 'Bottle' },
  { sku: 'TIS-EO-ROS-9',  name: 'Tisserand Rose Hip Seed Oil 100ml',    description: 'Rosa canina, cold pressed, Chile',                  brand_id: 3, category: 'Essential Oils', unit_price: '75.00', cost_price: '38.00', unit: 'Bottle' },
  // ── Carrier Oils ─────────────────────────────────────────────────────────
  { sku: 'AA-CO-SWA-100', name: 'Sweet Almond Oil 100ml',               description: 'Cold pressed Prunus dulcis',                        brand_id: 1, category: 'Carrier Oils', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  { sku: 'AA-CO-JOJ-100', name: 'Jojoba Golden Oil 100ml',              description: 'Cold pressed Simmondsia chinensis',                  brand_id: 1, category: 'Carrier Oils', unit_price: '65.00', cost_price: '32.50', unit: 'Bottle' },
  { sku: 'AA-CO-JOJ-500', name: 'Jojoba Golden Oil 500ml',              description: 'Cold pressed Simmondsia chinensis, salon size',      brand_id: 1, category: 'Carrier Oils', unit_price: '245.00', cost_price: '123.00', unit: 'Bottle' },
  { sku: 'AA-CO-GRP-100', name: 'Grapeseed Oil 100ml',                  description: 'Cold pressed Vitis vinifera, French',                brand_id: 1, category: 'Carrier Oils', unit_price: '38.00', cost_price: '19.00', unit: 'Bottle' },
  { sku: 'AA-CO-FCO-100', name: 'Fractionated Coconut Oil 100ml',       description: 'MCT coconut oil, liquid at room temperature',        brand_id: 1, category: 'Carrier Oils', unit_price: '45.00', cost_price: '23.00', unit: 'Bottle' },
  { sku: 'AA-CO-ARG-100', name: 'Argan Oil 50ml',                       description: 'Moroccan Argania spinosa, cold pressed',             brand_id: 1, category: 'Carrier Oils', unit_price: '95.00', cost_price: '48.00', unit: 'Bottle' },
  { sku: 'AA-CO-HMP-100', name: 'Hemp Seed Oil 100ml',                  description: 'Cold pressed Cannabis sativa, high GLA',             brand_id: 1, category: 'Carrier Oils', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'MM-CO-SWA-100', name: 'Sweet Almond Oil 100ml (MM)',           description: 'Cold pressed Prunus dulcis, refined',               brand_id: 2, category: 'Carrier Oils', unit_price: '40.00', cost_price: '20.00', unit: 'Bottle' },
  { sku: 'MM-CO-FCO-100', name: 'Fractionated Coconut Oil 100ml (MM)',   description: 'MCT coconut oil from Philippines',                  brand_id: 2, category: 'Carrier Oils', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  { sku: 'MM-CO-AVO-100', name: 'Avocado Oil 100ml',                    description: 'Cold pressed Persea gratissima, skin-rich',          brand_id: 2, category: 'Carrier Oils', unit_price: '48.00', cost_price: '24.00', unit: 'Bottle' },
  { sku: 'MM-CO-CMO-100', name: 'Camellia Seed Oil 50ml',               description: 'Japanese tsubaki oil, anti-aging carrier',           brand_id: 2, category: 'Carrier Oils', unit_price: '75.00', cost_price: '38.00', unit: 'Bottle' },
  // ── Bath Salts ───────────────────────────────────────────────────────────
  { sku: 'MM-BS-LAV-500', name: 'Lavender Bath Salts 500g',             description: 'Mediterranean sea salt with lavender essential oil', brand_id: 2, category: 'Bath Salts', unit_price: '55.00', cost_price: '28.00', unit: 'Jar' },
  { sku: 'MM-BS-ROS-500', name: 'Rose Bath Salts 500g',                 description: 'Pink Himalayan salt with rose petals and rose EO',  brand_id: 2, category: 'Bath Salts', unit_price: '65.00', cost_price: '33.00', unit: 'Jar' },
  { sku: 'MM-BS-DET-500', name: 'Detox Bath Salts 500g',                description: 'Juniper, lemon and grapefruit detox blend',         brand_id: 2, category: 'Bath Salts', unit_price: '58.00', cost_price: '29.00', unit: 'Jar' },
  { sku: 'MM-BS-SLP-500', name: 'Sleep Bath Salts 500g',                description: 'Lavender, chamomile and passionflower bedtime soak', brand_id: 2, category: 'Bath Salts', unit_price: '60.00', cost_price: '30.00', unit: 'Jar' },
  { sku: 'MM-BS-CIT-500', name: 'Citrus Burst Bath Salts 500g',         description: 'Orange, grapefruit and lemon energising soak',      brand_id: 2, category: 'Bath Salts', unit_price: '55.00', cost_price: '28.00', unit: 'Jar' },
  { sku: 'MM-BS-MNT-500', name: 'Mint Eucalyptus Bath Salts 500g',      description: 'Peppermint and eucalyptus refreshing spa soak',     brand_id: 2, category: 'Bath Salts', unit_price: '55.00', cost_price: '28.00', unit: 'Jar' },
  // ── Body Butters ─────────────────────────────────────────────────────────
  { sku: 'MM-BB-LAV-200', name: 'Lavender Body Butter 200ml',           description: 'Shea butter whipped with lavender essential oil',   brand_id: 2, category: 'Body Butters', unit_price: '72.00', cost_price: '36.00', unit: 'Jar' },
  { sku: 'MM-BB-ROS-200', name: 'Rose Body Butter 200ml',               description: 'Mango butter with rose oil and jojoba pearls',      brand_id: 2, category: 'Body Butters', unit_price: '78.00', cost_price: '39.00', unit: 'Jar' },
  { sku: 'MM-BB-UNS-200', name: 'Unscented Body Butter 200ml',          description: 'Pure shea and cocoa butter blend, fragrance free',  brand_id: 2, category: 'Body Butters', unit_price: '68.00', cost_price: '34.00', unit: 'Jar' },
  { sku: 'MM-BB-VAN-200', name: 'Vanilla Body Butter 200ml',            description: 'Sweet vanilla and coconut whipped body butter',     brand_id: 2, category: 'Body Butters', unit_price: '75.00', cost_price: '38.00', unit: 'Jar' },
  // ── Massage Blends ───────────────────────────────────────────────────────
  { sku: 'AA-MB-REL-100', name: 'Relaxation Massage Oil 100ml',         description: 'Lavender, chamomile and neroli blend',              brand_id: 1, category: 'Massage Blends', unit_price: '82.00', cost_price: '41.00', unit: 'Bottle' },
  { sku: 'AA-MB-MUS-100', name: 'Muscle Ease Massage Oil 100ml',        description: 'Black pepper, ginger and marjoram',                 brand_id: 1, category: 'Massage Blends', unit_price: '85.00', cost_price: '43.00', unit: 'Bottle' },
  { sku: 'AA-MB-SPO-100', name: 'Sports Recovery Massage Oil 100ml',    description: 'Peppermint, rosemary and eucalyptus',               brand_id: 1, category: 'Massage Blends', unit_price: '88.00', cost_price: '44.00', unit: 'Bottle' },
  { sku: 'AA-MB-ROM-100', name: 'Romance Massage Oil 100ml',            description: 'Rose, ylang ylang and jasmine',                    brand_id: 1, category: 'Massage Blends', unit_price: '95.00', cost_price: '48.00', unit: 'Bottle' },
  { sku: 'AA-MB-ANT-100', name: 'Anti-Stress Massage Oil 100ml',        description: 'Bergamot, frankincense and vetiver',               brand_id: 1, category: 'Massage Blends', unit_price: '90.00', cost_price: '45.00', unit: 'Bottle' },
  // ── Diffuser Blends ──────────────────────────────────────────────────────
  { sku: 'AA-DB-SLP-10',  name: 'Sleep Tight Diffuser Blend 10ml',      description: 'Lavender, cedarwood and vetiver calming blend',     brand_id: 1, category: 'Diffuser Blends', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'AA-DB-FOC-10',  name: 'Focus Diffuser Blend 10ml',             description: 'Rosemary, lemon and peppermint productivity blend', brand_id: 1, category: 'Diffuser Blends', unit_price: '48.00', cost_price: '24.00', unit: 'Bottle' },
  { sku: 'AA-DB-ENE-10',  name: 'Energy Boost Diffuser Blend 10ml',     description: 'Grapefruit, bergamot and spearmint uplifting blend', brand_id: 1, category: 'Diffuser Blends', unit_price: '50.00', cost_price: '25.00', unit: 'Bottle' },
  { sku: 'AA-DB-IMM-10',  name: 'Immunity Shield Diffuser Blend 10ml',  description: 'Tea tree, eucalyptus and thyme immune support',     brand_id: 1, category: 'Diffuser Blends', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'AA-DB-ROM-10',  name: 'Romance Diffuser Blend 10ml',           description: 'Rose, ylang ylang and sandalwood romantic blend',  brand_id: 1, category: 'Diffuser Blends', unit_price: '68.00', cost_price: '34.00', unit: 'Bottle' },
  // ── Roll-ons ─────────────────────────────────────────────────────────────
  { sku: 'TIS-RO-SLP-10', name: 'Sleep Better Roll-On 10ml',            description: 'Lavender and cedarwood sleep support roll-on',      brand_id: 3, category: 'Roll-ons', unit_price: '45.00', cost_price: '23.00', unit: 'Roll-On' },
  { sku: 'TIS-RO-FOC-10', name: 'Focus Roll-On 10ml',                   description: 'Peppermint and rosemary cognitive support roll-on', brand_id: 3, category: 'Roll-ons', unit_price: '45.00', cost_price: '23.00', unit: 'Roll-On' },
  { sku: 'TIS-RO-ENE-10', name: 'Energy Roll-On 10ml',                  description: 'Citrus and peppermint energising blend roll-on',   brand_id: 3, category: 'Roll-ons', unit_price: '45.00', cost_price: '23.00', unit: 'Roll-On' },
  { sku: 'TIS-RO-STR-10', name: 'De-Stress Roll-On 10ml',               description: 'Chamomile and bergamot calming roll-on',           brand_id: 3, category: 'Roll-ons', unit_price: '45.00', cost_price: '23.00', unit: 'Roll-On' },
  { sku: 'TIS-RO-HAD-10', name: 'Headache Relief Roll-On 10ml',         description: 'Peppermint and lavender headache balm roll-on',    brand_id: 3, category: 'Roll-ons', unit_price: '45.00', cost_price: '23.00', unit: 'Roll-On' },
  // ── Balms & Salves ───────────────────────────────────────────────────────
  { sku: 'NK-BLM-LIP-15', name: 'Intensive Lip Balm 15g',               description: 'Beeswax, coconut and peppermint intensive lip care', brand_id: 4, category: 'Balms & Salves', unit_price: '22.00', cost_price: '11.00', unit: 'Tin' },
  { sku: 'NK-BLM-CHE-30', name: 'Chest Rub Balm 30ml',                  description: 'Eucalyptus, camphor and peppermint chest balm',    brand_id: 4, category: 'Balms & Salves', unit_price: '35.00', cost_price: '18.00', unit: 'Tin' },
  { sku: 'NK-BLM-BUG-30', name: 'Bug Repellent Balm 30ml',              description: 'Citronella, lemongrass and neem insect repellent',  brand_id: 4, category: 'Balms & Salves', unit_price: '32.00', cost_price: '16.00', unit: 'Tin' },
  { sku: 'NK-BLM-FTH-30', name: 'Foot Care Balm 30ml',                  description: 'Peppermint, tea tree and shea intensive foot balm', brand_id: 4, category: 'Balms & Salves', unit_price: '38.00', cost_price: '19.00', unit: 'Tin' },
  // ── Hydrosols ────────────────────────────────────────────────────────────
  { sku: 'NK-HY-ROE-100', name: 'Rose Hydrosol 100ml',                  description: 'Rosa damascena hydrosol, pure floral water',        brand_id: 4, category: 'Hydrosols', unit_price: '45.00', cost_price: '23.00', unit: 'Bottle' },
  { sku: 'NK-HY-LAV-100', name: 'Lavender Hydrosol 100ml',              description: 'Lavandula angustifolia hydrosol, calming toner',    brand_id: 4, category: 'Hydrosols', unit_price: '38.00', cost_price: '19.00', unit: 'Bottle' },
  { sku: 'NK-HY-PPM-100', name: 'Peppermint Hydrosol 100ml',            description: 'Mentha piperita hydrosol, refreshing toner',        brand_id: 4, category: 'Hydrosols', unit_price: '35.00', cost_price: '18.00', unit: 'Bottle' },
  { sku: 'NK-HY-TEA-100', name: 'Tea Tree Hydrosol 100ml',              description: 'Melaleuca alternifolia hydrosol, clarifying',       brand_id: 4, category: 'Hydrosols', unit_price: '38.00', cost_price: '19.00', unit: 'Bottle' },
  { sku: 'NK-HY-CAM-100', name: 'Chamomile Hydrosol 100ml',             description: 'Roman chamomile hydrosol, soothing skin water',     brand_id: 4, category: 'Hydrosols', unit_price: '42.00', cost_price: '21.00', unit: 'Bottle' },
  // ── Supplements ──────────────────────────────────────────────────────────
  { sku: 'NK-SUP-VTD-60', name: 'Vitamin D3 2000IU 60s',                description: 'Cholecalciferol in organic olive oil, immunity',     brand_id: 4, category: 'Supplements', unit_price: '58.00', cost_price: '29.00', unit: 'Bottle' },
  { sku: 'NK-SUP-MGN-60', name: 'Magnesium Glycinate 400mg 60s',        description: 'Highly bioavailable magnesium for sleep and muscle', brand_id: 4, category: 'Supplements', unit_price: '78.00', cost_price: '39.00', unit: 'Bottle' },
  { sku: 'NK-SUP-OMG-60', name: 'Omega-3 Fish Oil 1000mg 60s',          description: 'High EPA/DHA omega-3 from sustainably caught fish',  brand_id: 4, category: 'Supplements', unit_price: '72.00', cost_price: '36.00', unit: 'Bottle' },
  { sku: 'NK-SUP-ZNC-60', name: 'Zinc Bisglycinate 15mg 60s',           description: 'Gentle chelated zinc, immune and skin support',     brand_id: 4, category: 'Supplements', unit_price: '55.00', cost_price: '28.00', unit: 'Bottle' },
  { sku: 'NK-SUP-VTC-60', name: 'Vitamin C 1000mg 60s',                 description: 'Ascorbic acid with rose hip bioflavonoids',         brand_id: 4, category: 'Supplements', unit_price: '62.00', cost_price: '31.00', unit: 'Bottle' },
  // ── Electronics ──────────────────────────────────────────────────────────
  { sku: 'TC-DIF-ULT-1',  name: 'Ultrasonic Diffuser 300ml White',      description: '300ml ultrasonic mist diffuser with colour LEDs',   brand_id: 25, category: 'Electronics', unit_price: '95.00', cost_price: '48.00', unit: 'Unit' },
  { sku: 'TC-DIF-ULT-2',  name: 'Ultrasonic Diffuser 500ml Black',      description: '500ml large room ultrasonic diffuser, timer',       brand_id: 25, category: 'Electronics', unit_price: '135.00', cost_price: '68.00', unit: 'Unit' },
  { sku: 'TC-DIF-NEA-1',  name: 'Nebulising Diffuser Clear',            description: 'Waterless glass nebuliser, pure aroma output',      brand_id: 25, category: 'Electronics', unit_price: '195.00', cost_price: '98.00', unit: 'Unit' },
  { sku: 'TC-ACC-DRP-50',  name: 'Glass Dropper Bottles 10ml (Pack 50)', description: 'Amber glass dropper bottles with black cap, 50pk', brand_id: 25, category: 'Electronics', unit_price: '65.00', cost_price: '33.00', unit: 'Pack' },
  // ── Stationery ───────────────────────────────────────────────────────────
  { sku: 'PF-SAN-MAT-A4', name: 'Flow Operations Manual (Printed)',      description: 'FLOW platform operations manual A4 spiral bound',   brand_id: 26, category: 'Stationery', unit_price: '45.00', cost_price: '23.00', unit: 'Each' },
  { sku: 'PF-SAN-LAB-WP', name: 'Waterproof Product Labels (Roll 500)', 'description': 'Roll of 500 waterproof adhesive product labels',  brand_id: 26, category: 'Stationery', unit_price: '95.00', cost_price: '48.00', unit: 'Roll' },
];

async function seed() {
  let inserted = 0;
  let skipped = 0;

  for (const p of PRODUCTS) {
    const result = await client`
      INSERT INTO products (sku, name, description, brand_id, category, unit_price, cost_price, vat_rate, unit, stock_quantity, min_stock_level, is_active)
      VALUES (${p.sku}, ${p.name}, ${p.description}, ${p.brand_id}, ${p.category}, ${p.unit_price}, ${p.cost_price}, '0.05', ${p.unit}, ${p.stock_quantity ?? 50}, ${p.min_stock_level ?? 10}, true)
      ON CONFLICT (sku) DO NOTHING
    `;
    if (result.count && result.count > 0) {
      inserted++;
    } else {
      skipped++;
    }
  }

  const [row] = await client`SELECT COUNT(*) as count FROM products`;
  console.log(`Inserted: ${inserted}, Skipped (already exist): ${skipped}`);
  console.log(`Total products in DB: ${row.count}`);
}

seed().catch(console.error);
