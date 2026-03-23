/**
 * populate-products-api.ts
 * API-driven product population script — adds products via authenticated POST /api/products.
 * No direct SQL. Skip-safe: uses ON CONFLICT equivalent by checking SKUs first.
 *
 * Usage:  npx tsx scripts/populate-products-api.ts
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5000';
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!cookie) throw new Error('No session cookie received');
  console.log(`✓ Authenticated as ${USERNAME}`);
  return cookie;
}

async function getBrands(cookie: string): Promise<Record<string, number>> {
  const r = await fetch(`${BASE_URL}/api/brands`, { headers: { Cookie: cookie } });
  const brands = await r.json();
  const map: Record<string, number> = {};
  for (const b of brands) map[b.name] = b.id;
  return map;
}

async function getExistingSkus(cookie: string): Promise<Set<string>> {
  const r = await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } });
  const prods = await r.json();
  return new Set(prods.map((p: any) => p.sku));
}

async function createProduct(product: object, cookie: string) {
  const r = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(product),
  });
  return { status: r.status, data: await r.json() };
}

interface ProductDef {
  name: string; sku: string; category: string;
  unitPrice: string; costPrice: string;
  description?: string; unit?: string; size?: string;
  brandName: string; stockQuantity?: number; minStockLevel?: number;
}

const PRODUCTS: ProductDef[] = [
  // Essential Oils — single-species small batch
  { name: 'Helichrysum Essential Oil 5ml', sku: 'AA-EO-HEL-005', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '89.00', costPrice: '45.00', unit: 'Bottle', size: '5ml', description: 'Helichrysum italicum essential oil — immortelle, anti-inflammatory', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Vetiver Essential Oil 10ml', sku: 'AA-EO-VET-010', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '75.00', costPrice: '38.00', unit: 'Bottle', size: '10ml', description: 'Vetiveria zizanoides — grounding, earthy, smoky', stockQuantity: 25, minStockLevel: 4 },
  { name: 'Spikenard Essential Oil 5ml', sku: 'AA-EO-SPI-005', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '95.00', costPrice: '50.00', unit: 'Bottle', size: '5ml', description: 'Nardostachys jatamansi — ancient, musky, deeply calming', stockQuantity: 15, minStockLevel: 2 },
  { name: 'Jasmine Absolute 2ml', sku: 'TIS-EO-JAS-002', category: 'Essential Oils', brandName: 'Tisserand', unitPrice: '120.00', costPrice: '60.00', unit: 'Bottle', size: '2ml', description: 'Jasminum grandiflorum absolute — luxury floral', stockQuantity: 30, minStockLevel: 5 },
  { name: 'Neroli Essential Oil 5ml', sku: 'TIS-EO-NER-005', category: 'Essential Oils', brandName: 'Tisserand', unitPrice: '145.00', costPrice: '72.00', unit: 'Bottle', size: '5ml', description: 'Citrus aurantium var. amara — delicate, floral, anxiety-relieving', stockQuantity: 18, minStockLevel: 3 },
  { name: 'Petitgrain Essential Oil 10ml', sku: 'TIS-EO-PET-010', category: 'Essential Oils', brandName: 'Tisserand', unitPrice: '48.00', costPrice: '24.00', unit: 'Bottle', size: '10ml', description: 'Citrus aurantium — fresh, woody, tonic', stockQuantity: 35, minStockLevel: 6 },
  { name: 'Melissa Essential Oil 5ml', sku: 'AA-EO-MEL-005', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '160.00', costPrice: '80.00', unit: 'Bottle', size: '5ml', description: 'Melissa officinalis — lemon balm, antiviral, calming', stockQuantity: 12, minStockLevel: 2 },
  { name: 'Cypress Essential Oil 10ml', sku: 'NK-EO-CYP-010', category: 'Essential Oils', brandName: 'Nikura', unitPrice: '39.00', costPrice: '18.00', unit: 'Bottle', size: '10ml', description: 'Cupressus sempervirens — circulation, toning, freshening', stockQuantity: 40, minStockLevel: 5 },
  { name: 'Cardamom Essential Oil 10ml', sku: 'NK-EO-CAR-010', category: 'Essential Oils', brandName: 'Nikura', unitPrice: '55.00', costPrice: '28.00', unit: 'Bottle', size: '10ml', description: 'Elettaria cardamomum — warm, spicy, digestive', stockQuantity: 30, minStockLevel: 4 },
  { name: 'Fennel Essential Oil 10ml', sku: 'NK-EO-FEN-010', category: 'Essential Oils', brandName: 'Nikura', unitPrice: '42.00', costPrice: '20.00', unit: 'Bottle', size: '10ml', description: 'Foeniculum vulgare dulce — sweet fennel, digestive, detoxifying', stockQuantity: 28, minStockLevel: 4 },
  { name: 'Marjoram Essential Oil 10ml', sku: 'AA-EO-MAR-010', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '44.00', costPrice: '22.00', unit: 'Bottle', size: '10ml', description: 'Origanum majorana — warm, comforting, muscular', stockQuantity: 32, minStockLevel: 5 },
  { name: 'Thyme Essential Oil 10ml', sku: 'AA-EO-THY-010', category: 'Essential Oils', brandName: 'Absolute Aromas', unitPrice: '46.00', costPrice: '23.00', unit: 'Bottle', size: '10ml', description: 'Thymus vulgaris ct. linalool — gentle, immune-supportive', stockQuantity: 25, minStockLevel: 4 },
  // Carrier Oils — bulk sizes
  { name: 'Argan Oil 100ml', sku: 'MM-CO-ARG-100', category: 'Carrier Oils', brandName: 'Mystic Moments', unitPrice: '65.00', costPrice: '32.00', unit: 'Bottle', size: '100ml', description: 'Argania spinosa kernel oil — liquid gold, restorative', stockQuantity: 40, minStockLevel: 6 },
  { name: 'Marula Oil 50ml', sku: 'MM-CO-MAR-050', category: 'Carrier Oils', brandName: 'Mystic Moments', unitPrice: '72.00', costPrice: '36.00', unit: 'Bottle', size: '50ml', description: 'Sclerocarya birrea — fast-absorbing, anti-aging', stockQuantity: 30, minStockLevel: 4 },
  { name: 'Baobab Oil 50ml', sku: 'AA-CO-BAO-050', category: 'Carrier Oils', brandName: 'Absolute Aromas', unitPrice: '68.00', costPrice: '33.00', unit: 'Bottle', size: '50ml', description: 'Adansonia digitata — rich, protective, skin-nourishing', stockQuantity: 25, minStockLevel: 3 },
  { name: 'Pomegranate Seed Oil 30ml', sku: 'AA-CO-POM-030', category: 'Carrier Oils', brandName: 'Absolute Aromas', unitPrice: '82.00', costPrice: '42.00', unit: 'Bottle', size: '30ml', description: 'Punica granatum — antioxidant-rich, rejuvenating', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Meadowfoam Seed Oil 100ml', sku: 'MM-CO-MEA-100', category: 'Carrier Oils', brandName: 'Mystic Moments', unitPrice: '55.00', costPrice: '27.00', unit: 'Bottle', size: '100ml', description: 'Limnanthes alba — long shelf life, skin-softening', stockQuantity: 35, minStockLevel: 5 },
  { name: 'Sea Buckthorn Oil 30ml', sku: 'NK-CO-SBU-030', category: 'Carrier Oils', brandName: 'Nikura', unitPrice: '78.00', costPrice: '39.00', unit: 'Bottle', size: '30ml', description: 'Hippophae rhamnoides — deeply orange, skin-healing, vitamin C', stockQuantity: 18, minStockLevel: 2 },
  { name: 'Hemp Seed Oil 100ml', sku: 'NK-CO-HEM-100', category: 'Carrier Oils', brandName: 'Nikura', unitPrice: '45.00', costPrice: '22.00', unit: 'Bottle', size: '100ml', description: 'Cannabis sativa seed oil — omega-rich, non-comedogenic', stockQuantity: 42, minStockLevel: 6 },
  { name: 'Kalahari Melon Seed Oil 50ml', sku: 'AA-CO-KAL-050', category: 'Carrier Oils', brandName: 'Absolute Aromas', unitPrice: '60.00', costPrice: '30.00', unit: 'Bottle', size: '50ml', description: 'Citrullus lanatus — lightweight, dry-finish, anti-inflammatory', stockQuantity: 22, minStockLevel: 3 },
  // Bath Salts — specialty
  { name: 'Rose Geranium Bath Salts 500g', sku: 'MM-BS-RGE-500', category: 'Bath Salts', brandName: 'Mystic Moments', unitPrice: '68.00', costPrice: '32.00', unit: 'Jar', size: '500g', description: 'Dead Sea salts with rose geranium and patchouli', stockQuantity: 30, minStockLevel: 5 },
  { name: 'Himalayan Pink Salt Soak 1kg', sku: 'MM-BS-HPS-001', category: 'Bath Salts', brandName: 'Mystic Moments', unitPrice: '85.00', costPrice: '40.00', unit: 'Bag', size: '1kg', description: 'Coarse pink Himalayan salts with bergamot and lemon', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Detox Charcoal Bath Soak 500g', sku: 'AA-BS-DCH-500', category: 'Bath Salts', brandName: 'Absolute Aromas', unitPrice: '72.00', costPrice: '35.00', unit: 'Jar', size: '500g', description: 'Activated charcoal, Himalayan salt, eucalyptus, peppermint', stockQuantity: 25, minStockLevel: 4 },
  { name: 'Muscle Ease Epsom Soak 1kg', sku: 'NK-BS-MUS-001', category: 'Bath Salts', brandName: 'Nikura', unitPrice: '78.00', costPrice: '36.00', unit: 'Bag', size: '1kg', description: 'Magnesium sulphate with black pepper, ginger, clove', stockQuantity: 28, minStockLevel: 4 },
  // Body Butters — whipped specialty
  { name: 'Mango Shea Whipped Body Butter 200ml', sku: 'MM-BB-MAS-200', category: 'Body Butters', brandName: 'Mystic Moments', unitPrice: '88.00', costPrice: '42.00', unit: 'Jar', size: '200ml', description: 'Shea and mango butter blend — jasmine, ylang ylang', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Cocoa Vanilla Body Butter 200ml', sku: 'AA-BB-COV-200', category: 'Body Butters', brandName: 'Absolute Aromas', unitPrice: '82.00', costPrice: '39.00', unit: 'Jar', size: '200ml', description: 'Raw cocoa butter with vanilla and sweet orange', stockQuantity: 24, minStockLevel: 4 },
  { name: 'Frankincense Anti-Aging Body Butter 150ml', sku: 'TIS-BB-FRK-150', category: 'Body Butters', brandName: 'Tisserand', unitPrice: '110.00', costPrice: '54.00', unit: 'Jar', size: '150ml', description: 'Shea, baobab, frankincense and myrrh — mature skin regeneration', stockQuantity: 15, minStockLevel: 2 },
  // Massage Blends — ready-to-use
  { name: 'Lymphatic Drainage Massage Blend 100ml', sku: 'AA-MB-LYM-100', category: 'Massage Blends', brandName: 'Absolute Aromas', unitPrice: '145.00', costPrice: '72.00', unit: 'Bottle', size: '100ml', description: 'Juniper, grapefruit, cypress in jojoba — detox protocol', stockQuantity: 18, minStockLevel: 3 },
  { name: 'Hot Stone Massage Oil 200ml', sku: 'AA-MB-HST-200', category: 'Massage Blends', brandName: 'Absolute Aromas', unitPrice: '195.00', costPrice: '95.00', unit: 'Bottle', size: '200ml', description: 'Basalt-stone formula — ginger, black pepper, sweet marjoram', stockQuantity: 12, minStockLevel: 2 },
  { name: 'Prenatal Massage Blend 100ml', sku: 'TIS-MB-PRE-100', category: 'Massage Blends', brandName: 'Tisserand', unitPrice: '160.00', costPrice: '78.00', unit: 'Bottle', size: '100ml', description: 'Gentle pregnancy blend — mandarin, chamomile roman, neroli', stockQuantity: 14, minStockLevel: 2 },
  // Diffuser Blends
  { name: 'Productivity Focus Diffuser Blend 10ml', sku: 'TC-DIF-PRF-010', category: 'Diffuser Blends', brandName: 'Tisserand', unitPrice: '65.00', costPrice: '31.00', unit: 'Bottle', size: '10ml', description: 'Rosemary, basil, lemon — mental clarity', stockQuantity: 35, minStockLevel: 5 },
  { name: 'Romantic Evening Diffuser Blend 10ml', sku: 'TC-DIF-ROM-010', category: 'Diffuser Blends', brandName: 'Tisserand', unitPrice: '72.00', costPrice: '35.00', unit: 'Bottle', size: '10ml', description: 'Ylang ylang, sandalwood, rose — sensual warmth', stockQuantity: 30, minStockLevel: 4 },
  { name: 'Winter Spice Diffuser Blend 10ml', sku: 'TC-DIF-WIN-010', category: 'Diffuser Blends', brandName: 'Tisserand', unitPrice: '68.00', costPrice: '33.00', unit: 'Bottle', size: '10ml', description: 'Cinnamon, clove, orange, frankincense', stockQuantity: 25, minStockLevel: 4 },
  // Roll-ons
  { name: 'Migraine Relief Roll-on 10ml', sku: 'TIS-RO-MIG-010', category: 'Roll-ons', brandName: 'Tisserand', unitPrice: '58.00', costPrice: '28.00', unit: 'Bottle', size: '10ml', description: 'Peppermint, lavender, basil in fractionated coconut oil', stockQuantity: 40, minStockLevel: 6 },
  { name: 'Skin Clear Roll-on 10ml', sku: 'NK-RO-SKC-010', category: 'Roll-ons', brandName: 'Nikura', unitPrice: '52.00', costPrice: '25.00', unit: 'Bottle', size: '10ml', description: 'Tea tree, lavender, frankincense — spot treatment', stockQuantity: 38, minStockLevel: 6 },
  { name: 'Tension Tamer Roll-on 10ml', sku: 'AA-RO-TEN-010', category: 'Roll-ons', brandName: 'Absolute Aromas', unitPrice: '55.00', costPrice: '26.00', unit: 'Bottle', size: '10ml', description: 'Lavender, marjoram, chamomile — neck and shoulder tension', stockQuantity: 35, minStockLevel: 5 },
  { name: 'Jet Lag Relief Roll-on 10ml', sku: 'TIS-RO-JET-010', category: 'Roll-ons', brandName: 'Tisserand', unitPrice: '60.00', costPrice: '29.00', unit: 'Bottle', size: '10ml', description: 'Peppermint, rosemary, grapefruit — alertness and energy', stockQuantity: 28, minStockLevel: 4 },
  // Balms
  { name: 'Arnica Muscle Salve 100ml', sku: 'NK-BLM-ARM-100', category: 'Balms & Salves', brandName: 'Nikura', unitPrice: '88.00', costPrice: '43.00', unit: 'Jar', size: '100ml', description: 'Arnica infused beeswax balm — bruising, sprains, muscle aches', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Calendula Healing Salve 60ml', sku: 'AA-BLM-CAL-060', category: 'Balms & Salves', brandName: 'Absolute Aromas', unitPrice: '75.00', costPrice: '36.00', unit: 'Tin', size: '60ml', description: 'Organic calendula and chamomile beeswax — dry, cracked skin', stockQuantity: 24, minStockLevel: 4 },
  { name: 'Eczema Soothe Balm 50ml', sku: 'TIS-BLM-ECZ-050', category: 'Balms & Salves', brandName: 'Tisserand', unitPrice: '95.00', costPrice: '47.00', unit: 'Tin', size: '50ml', description: 'Oat extract, chamomile, lavender — sensitive, reactive skin', stockQuantity: 18, minStockLevel: 3 },
  // Hydrosols
  { name: 'Rose Hydrosol 100ml', sku: 'NK-HY-ROS-100', category: 'Hydrosols', brandName: 'Nikura', unitPrice: '55.00', costPrice: '26.00', unit: 'Bottle', size: '100ml', description: 'Rosa damascena distillate — toning, hydrating mist', stockQuantity: 30, minStockLevel: 5 },
  { name: 'Frankincense Hydrosol 100ml', sku: 'NK-HY-FRK-100', category: 'Hydrosols', brandName: 'Nikura', unitPrice: '65.00', costPrice: '31.00', unit: 'Bottle', size: '100ml', description: 'Boswellia carterii distillate — anti-aging facial mist', stockQuantity: 22, minStockLevel: 3 },
  // Supplements
  { name: 'Evening Primrose Oil Capsules 90s', sku: 'NK-SUP-EPO-090', category: 'Supplements', brandName: 'Nikura', unitPrice: '95.00', costPrice: '45.00', unit: 'Bottle', size: '90 capsules', description: 'GLA-rich evening primrose oil — hormonal balance, skin health', stockQuantity: 25, minStockLevel: 4 },
  { name: 'Black Seed Oil Capsules 60s', sku: 'NK-SUP-BSO-060', category: 'Supplements', brandName: 'Nikura', unitPrice: '88.00', costPrice: '42.00', unit: 'Bottle', size: '60 capsules', description: 'Nigella sativa — immune, anti-inflammatory, traditional remedy', stockQuantity: 20, minStockLevel: 3 },
  { name: 'Ashwagandha Extract Capsules 60s', sku: 'NK-SUP-ASH-060', category: 'Supplements', brandName: 'Nikura', unitPrice: '92.00', costPrice: '44.00', unit: 'Bottle', size: '60 capsules', description: 'KSM-66 ashwagandha — adaptogen, stress and cortisol balance', stockQuantity: 22, minStockLevel: 3 },
  // Electronics
  { name: 'Ultrasonic Diffuser 200ml White', sku: 'TC-ACC-UD2-WHT', category: 'Electronics', brandName: 'Tisserand', unitPrice: '195.00', costPrice: '95.00', unit: 'Unit', description: '200ml ultrasonic aromatherapy diffuser — USB powered, LED mood light', stockQuantity: 15, minStockLevel: 2 },
  { name: 'Nebulising Diffuser Beech Wood', sku: 'TC-ACC-NBZ-BWD', category: 'Electronics', brandName: 'Tisserand', unitPrice: '420.00', costPrice: '210.00', unit: 'Unit', description: 'Cold-air nebuliser — no heat, no water, maximum therapeutic benefit', stockQuantity: 8, minStockLevel: 1 },
  { name: 'Car Diffuser USB Vent Clip', sku: 'TC-ACC-CAR-USB', category: 'Electronics', brandName: 'Tisserand', unitPrice: '85.00', costPrice: '40.00', unit: 'Unit', description: 'Ultrasonic car diffuser — USB-C, 10ml reservoir, auto shut-off', stockQuantity: 25, minStockLevel: 4 },
];

async function main() {
  const cookie = await login();
  const brands = await getBrands(cookie);
  const existingSkus = await getExistingSkus(cookie);
  console.log(`Loaded ${Object.keys(brands).length} brands, ${existingSkus.size} existing SKUs`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const prod of PRODUCTS) {
    if (existingSkus.has(prod.sku)) {
      skipped++;
      continue;
    }

    const brandId = brands[prod.brandName];
    if (!brandId) {
      console.warn(`  ⚠ Brand not found: "${prod.brandName}" — skipping ${prod.sku}`);
      failed++;
      continue;
    }

    const { status, data } = await createProduct({
      name: prod.name,
      sku: prod.sku,
      category: prod.category,
      unitPrice: prod.unitPrice,
      costPrice: prod.costPrice,
      vatRate: '0.05',
      unit: prod.unit ?? 'Bottle',
      size: prod.size ?? null,
      description: prod.description ?? '',
      brandId,
      stockQuantity: prod.stockQuantity ?? 10,
      minStockLevel: prod.minStockLevel ?? 2,
    }, cookie);

    if (status === 201) {
      created++;
      process.stdout.write(`  ✓ ${prod.sku}\n`);
    } else {
      failed++;
      console.error(`  ✗ Failed (${status}): ${prod.sku} — ${JSON.stringify(data).substring(0, 80)}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (existing): ${skipped}, Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
