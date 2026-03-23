/**
 * populate-products-api.ts
 * API-driven product population script — adds 300+ products via authenticated
 * POST /api/products. No direct SQL. Skip-safe: checks existing SKUs first.
 *
 * Strategy: generative — applies multiple size variants to each base formula,
 * covering all 12 product categories. A single run on an empty DB creates 319+
 * products; re-runs on a populated DB skip already-present SKUs.
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
  const prods = await r.json() as Array<{ sku: string }>;
  return new Set(prods.map((p) => p.sku));
}

async function createProduct(product: object, cookie: string) {
  const r = await fetch(`${BASE_URL}/api/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(product),
  });
  return { status: r.status, data: await r.json() };
}

interface BaseOil {
  name: string;
  skuBase: string;
  brand: string;
  basePrice: number;
  description: string;
}

const ESSENTIAL_OIL_BASES: BaseOil[] = [
  { name: 'Lavender', skuBase: 'EO-LAV', brand: 'Absolute Aromas', basePrice: 35, description: 'Lavandula angustifolia — calming, skin-healing, universally loved' },
  { name: 'Tea Tree', skuBase: 'EO-TEA', brand: 'Nikura', basePrice: 30, description: 'Melaleuca alternifolia — antimicrobial, cleansing, immune-supportive' },
  { name: 'Peppermint', skuBase: 'EO-PEP', brand: 'Absolute Aromas', basePrice: 32, description: 'Mentha x piperita — cooling, analgesic, mentally stimulating' },
  { name: 'Eucalyptus', skuBase: 'EO-EUC', brand: 'Nikura', basePrice: 28, description: 'Eucalyptus globulus — respiratory, decongestant, purifying' },
  { name: 'Frankincense', skuBase: 'EO-FRK', brand: 'Absolute Aromas', basePrice: 78, description: 'Boswellia carterii — anti-aging, meditative, grounding' },
  { name: 'Lemon', skuBase: 'EO-LEM', brand: 'Nikura', basePrice: 25, description: 'Citrus limon — uplifting, cleansing, detoxifying' },
  { name: 'Orange Sweet', skuBase: 'EO-ORS', brand: 'Mystic Moments', basePrice: 22, description: 'Citrus sinensis — cheerful, sweet, stress-relieving' },
  { name: 'Bergamot', skuBase: 'EO-BER', brand: 'Tisserand', basePrice: 42, description: 'Citrus bergamia — uplifting, antidepressant, anxiety-relieving' },
  { name: 'Ylang Ylang', skuBase: 'EO-YYL', brand: 'Absolute Aromas', basePrice: 55, description: 'Cananga odorata — exotic floral, balancing, sensual' },
  { name: 'Geranium', skuBase: 'EO-GER', brand: 'Tisserand', basePrice: 48, description: 'Pelargonium graveolens — hormonal balance, skin-toning' },
  { name: 'Cedarwood', skuBase: 'EO-CED', brand: 'Nikura', basePrice: 30, description: 'Cedrus atlantica — grounding, respiratory, insect-repelling' },
  { name: 'Clary Sage', skuBase: 'EO-CLS', brand: 'Absolute Aromas', basePrice: 52, description: 'Salvia sclarea — hormonal, euphoric, muscle-relaxing' },
  { name: 'Patchouli', skuBase: 'EO-PAT', brand: 'Mystic Moments', basePrice: 44, description: 'Pogostemon cablin — earthy, grounding, anti-inflammatory' },
  { name: 'Rosemary', skuBase: 'EO-ROS', brand: 'Tisserand', basePrice: 35, description: 'Rosmarinus officinalis ct. camphor — memory, scalp, muscle' },
  { name: 'Chamomile Roman', skuBase: 'EO-CHR', brand: 'Absolute Aromas', basePrice: 95, description: 'Anthemis nobilis — calming for children, anti-inflammatory' },
  { name: 'Sandalwood', skuBase: 'EO-SAN', brand: 'Tisserand', basePrice: 120, description: 'Santalum album — meditative, skin-softening, aphrodisiac' },
  { name: 'Vetiver', skuBase: 'EO-VET', brand: 'Absolute Aromas', basePrice: 75, description: 'Vetiveria zizanoides — grounding, earthy, anti-anxiety' },
  { name: 'Juniper Berry', skuBase: 'EO-JUN', brand: 'Nikura', basePrice: 40, description: 'Juniperus communis — detoxifying, diuretic, purifying' },
  { name: 'Black Pepper', skuBase: 'EO-BLK', brand: 'Mystic Moments', basePrice: 48, description: 'Piper nigrum — warming, analgesic, stimulating circulation' },
  { name: 'Ginger', skuBase: 'EO-GIN', brand: 'Absolute Aromas', basePrice: 50, description: 'Zingiber officinale — warming, digestive, nausea-relieving' },
  { name: 'Clove Bud', skuBase: 'EO-CLB', brand: 'Nikura', basePrice: 35, description: 'Syzygium aromaticum — analgesic, antimicrobial, warming' },
  { name: 'Cinnamon Bark', skuBase: 'EO-CIN', brand: 'Mystic Moments', basePrice: 45, description: 'Cinnamomum zeylanicum — warming, antibacterial, festive' },
  { name: 'Lemongrass', skuBase: 'EO-LGR', brand: 'Nikura', basePrice: 28, description: 'Cymbopogon citratus — toning, deodorising, insect-repelling' },
  { name: 'Basil Sweet', skuBase: 'EO-BAS', brand: 'Absolute Aromas', basePrice: 38, description: 'Ocimum basilicum ct. linalool — mental clarity, muscle spasm relief' },
  { name: 'Lime', skuBase: 'EO-LIM', brand: 'Tisserand', basePrice: 30, description: 'Citrus aurantifolia — uplifting, immune-supportive, refreshing' },
  { name: 'Mandarin', skuBase: 'EO-MAN', brand: 'Mystic Moments', basePrice: 36, description: 'Citrus reticulata — gentle citrus, safe for pregnancy and children' },
  { name: 'Grapefruit', skuBase: 'EO-GRF', brand: 'Absolute Aromas', basePrice: 32, description: 'Citrus x paradisi — uplifting, appetite-suppressing, detox' },
  { name: 'Spearmint', skuBase: 'EO-SPM', brand: 'Nikura', basePrice: 30, description: 'Mentha spicata — gentler than peppermint, digestive, cooling' },
  { name: 'Myrrh', skuBase: 'EO-MYR', brand: 'Absolute Aromas', basePrice: 82, description: 'Commiphora myrrha — wound-healing, meditative, anti-inflammatory' },
  { name: 'Helichrysum', skuBase: 'EO-HEL', brand: 'Absolute Aromas', basePrice: 89, description: 'Helichrysum italicum — immortelle, skin-regenerating, anti-bruising' },
];

const EO_SIZES = [
  { size: '5ml', skuSuffix: '005', priceMultiplier: 1.0, stock: 20 },
  { size: '10ml', skuSuffix: '010', priceMultiplier: 1.7, stock: 35 },
  { size: '30ml', skuSuffix: '030', priceMultiplier: 4.0, stock: 15 },
];

const CARRIER_OIL_BASES: BaseOil[] = [
  { name: 'Sweet Almond', skuBase: 'CO-SAL', brand: 'Mystic Moments', basePrice: 25, description: 'Prunus dulcis — light, nourishing, all skin types' },
  { name: 'Jojoba', skuBase: 'CO-JOJ', brand: 'Absolute Aromas', basePrice: 42, description: 'Simmondsia chinensis — liquid wax, sebum-balancing, long shelf life' },
  { name: 'Rosehip', skuBase: 'CO-RSH', brand: 'Tisserand', basePrice: 55, description: 'Rosa canina — trans-retinoic acid, scar-fading, anti-aging' },
  { name: 'Argan', skuBase: 'CO-ARG', brand: 'Mystic Moments', basePrice: 65, description: 'Argania spinosa — liquid gold, restorative, antioxidant' },
  { name: 'Coconut Fractionated', skuBase: 'CO-FCO', brand: 'Nikura', basePrice: 28, description: 'Cocos nucifera — light, odourless, MCT-rich, stays liquid' },
  { name: 'Castor', skuBase: 'CO-CAS', brand: 'Mystic Moments', basePrice: 22, description: 'Ricinus communis — thick, drawing, lash and brow growth' },
  { name: 'Grapeseed', skuBase: 'CO-GPS', brand: 'Nikura', basePrice: 20, description: 'Vitis vinifera — light, astringent, antioxidant, non-greasy' },
  { name: 'Avocado', skuBase: 'CO-AVO', brand: 'Absolute Aromas', basePrice: 38, description: 'Persea gratissima — rich, penetrating, dry and mature skin' },
  { name: 'Evening Primrose', skuBase: 'CO-EPO', brand: 'Absolute Aromas', basePrice: 58, description: 'Oenothera biennis — GLA-rich, hormonal skin, eczema-soothing' },
  { name: 'Hemp Seed', skuBase: 'CO-HEM', brand: 'Nikura', basePrice: 45, description: 'Cannabis sativa — omega-3/6 balance, anti-inflammatory, skin barrier' },
  { name: 'Sunflower', skuBase: 'CO-SUN', brand: 'Mystic Moments', basePrice: 18, description: 'Helianthus annuus — light, vitamin E-rich, affordable base oil' },
  { name: 'Olive', skuBase: 'CO-OLV', brand: 'Absolute Aromas', basePrice: 22, description: 'Olea europaea — rich, squalene-containing, Mediterranean staple' },
  { name: 'Neem', skuBase: 'CO-NEM', brand: 'Nikura', basePrice: 30, description: 'Azadirachta indica — powerful, strong aroma, insecticidal, medicinal' },
  { name: 'Tamanu', skuBase: 'CO-TAM', brand: 'Mystic Moments', basePrice: 70, description: 'Calophyllum inophyllum — wound-healing, acne, cicatrisant' },
  { name: 'Marula', skuBase: 'CO-MAR', brand: 'Absolute Aromas', basePrice: 72, description: 'Sclerocarya birrea — fast-absorbing, oleic-acid rich, luxury skin oil' },
];

const CO_SIZES = [
  { size: '30ml', skuSuffix: '030', priceMultiplier: 1.0, stock: 25 },
  { size: '100ml', skuSuffix: '100', priceMultiplier: 2.5, stock: 40 },
  { size: '250ml', skuSuffix: '250', priceMultiplier: 5.0, stock: 20 },
  { size: '500ml', skuSuffix: '500', priceMultiplier: 8.5, stock: 12 },
];

const BATH_SALT_BASES = [
  { name: 'Lavender & Chamomile', skuBase: 'BS-LAC', brand: 'Mystic Moments', basePrice: 38, description: 'Dead Sea salts, lavender and chamomile — sleep and calm' },
  { name: 'Rose Geranium', skuBase: 'BS-RGE', brand: 'Mystic Moments', basePrice: 42, description: 'Himalayan pink salt, rose geranium and patchouli' },
  { name: 'Detox Charcoal', skuBase: 'BS-DCH', brand: 'Absolute Aromas', basePrice: 45, description: 'Activated charcoal, eucalyptus and peppermint Himalayan soak' },
  { name: 'Muscle Ease Epsom', skuBase: 'BS-MUS', brand: 'Nikura', basePrice: 35, description: 'Magnesium sulphate, black pepper, ginger and clove' },
  { name: 'Himalayan Pink', skuBase: 'BS-HPS', brand: 'Mystic Moments', basePrice: 32, description: 'Coarse Himalayan pink salts with bergamot and lemon' },
  { name: 'Citrus Burst', skuBase: 'BS-CTB', brand: 'Nikura', basePrice: 30, description: 'Sea salt with grapefruit, orange and lemon — energising morning soak' },
  { name: 'Moroccan Rose', skuBase: 'BS-MOR', brand: 'Absolute Aromas', basePrice: 52, description: 'Dead Sea salt, Moroccan rose absolute and argan oil' },
  { name: 'Forest Bathing', skuBase: 'BS-FOR', brand: 'Mystic Moments', basePrice: 40, description: 'Himalayan salt, cedarwood, fir needle and vetiver — shinrin-yoku soak' },
];

const BS_SIZES = [
  { size: '250g', skuSuffix: '250', priceMultiplier: 1.0, stock: 30 },
  { size: '500g', skuSuffix: '500', priceMultiplier: 1.8, stock: 22 },
  { size: '1kg', skuSuffix: '001', priceMultiplier: 3.0, stock: 15 },
];

const BODY_BUTTER_BASES = [
  { name: 'Mango Shea', skuBase: 'BB-MAS', brand: 'Mystic Moments', basePrice: 58, description: 'Shea and mango butter, jasmine, ylang ylang' },
  { name: 'Cocoa Vanilla', skuBase: 'BB-COV', brand: 'Absolute Aromas', basePrice: 55, description: 'Raw cocoa butter with vanilla and sweet orange' },
  { name: 'Frankincense Anti-Aging', skuBase: 'BB-FRK', brand: 'Tisserand', basePrice: 82, description: 'Shea, baobab, frankincense and myrrh — mature skin' },
  { name: 'Lavender Calm', skuBase: 'BB-LAC', brand: 'Absolute Aromas', basePrice: 50, description: 'Shea butter, lavender and chamomile — bedtime ritual' },
  { name: 'Citrus Energise', skuBase: 'BB-CIE', brand: 'Mystic Moments', basePrice: 48, description: 'Mango butter, grapefruit, sweet orange and bergamot' },
  { name: 'Hemp & Rosehip', skuBase: 'BB-HMR', brand: 'Nikura', basePrice: 65, description: 'Hemp seed and rosehip butter with sea buckthorn' },
  { name: 'Aloe Vera Light', skuBase: 'BB-ALO', brand: 'Nikura', basePrice: 44, description: 'Lightweight whipped shea with aloe vera and cucumber' },
  { name: 'Myrrh & Sandalwood', skuBase: 'BB-MYS', brand: 'Absolute Aromas', basePrice: 78, description: 'Luxury shea with myrrh, sandalwood and patchouli' },
];

const BB_SIZES = [
  { size: '100ml', skuSuffix: '100', priceMultiplier: 1.0, stock: 25 },
  { size: '200ml', skuSuffix: '200', priceMultiplier: 1.75, stock: 18 },
  { size: '500ml', skuSuffix: '500', priceMultiplier: 3.5, stock: 10 },
];

const MASSAGE_BLEND_BASES = [
  { name: 'Relaxation Deep Tissue', skuBase: 'MB-RDT', brand: 'Absolute Aromas', basePrice: 85, description: 'Lavender, marjoram, vetiver in sweet almond — deep relaxation' },
  { name: 'Sports Recovery', skuBase: 'MB-SPR', brand: 'Nikura', basePrice: 78, description: 'Black pepper, ginger, eucalyptus in jojoba — post-workout' },
  { name: 'Lymphatic Drainage', skuBase: 'MB-LYM', brand: 'Absolute Aromas', basePrice: 95, description: 'Juniper, grapefruit, cypress in jojoba — detox protocol' },
  { name: 'Hot Stone Formula', skuBase: 'MB-HST', brand: 'Absolute Aromas', basePrice: 110, description: 'Basalt-stone formula — ginger, black pepper, sweet marjoram' },
  { name: 'Prenatal Gentle', skuBase: 'MB-PRE', brand: 'Tisserand', basePrice: 98, description: 'Mandarin, chamomile roman, neroli — safe for pregnancy' },
  { name: 'Anti-Cellulite', skuBase: 'MB-ANC', brand: 'Mystic Moments', basePrice: 88, description: 'Grapefruit, fennel, geranium, juniper — firming body massage' },
  { name: 'Headache Relief', skuBase: 'MB-HDR', brand: 'Tisserand', basePrice: 82, description: 'Peppermint, lavender, basil — temple and neck massage' },
  { name: 'Sleep Restore', skuBase: 'MB-SLP', brand: 'Absolute Aromas', basePrice: 90, description: 'Valerian, vetiver, frankincense, chamomile — pre-sleep ritual' },
];

const MB_SIZES = [
  { size: '50ml', skuSuffix: '050', priceMultiplier: 1.0, stock: 20 },
  { size: '100ml', skuSuffix: '100', priceMultiplier: 1.8, stock: 15 },
  { size: '200ml', skuSuffix: '200', priceMultiplier: 3.0, stock: 10 },
];

const DIFFUSER_BLEND_BASES = [
  { name: 'Productivity Focus', skuBase: 'DB-PRF', brand: 'Tisserand', basePrice: 42, description: 'Rosemary, basil, lemon — mental clarity and concentration' },
  { name: 'Romantic Evening', skuBase: 'DB-ROM', brand: 'Tisserand', basePrice: 52, description: 'Ylang ylang, sandalwood, rose — sensual warmth' },
  { name: 'Winter Spice', skuBase: 'DB-WIN', brand: 'Tisserand', basePrice: 48, description: 'Cinnamon, clove, orange, frankincense — festive warmth' },
  { name: 'Tropical Escape', skuBase: 'DB-TRO', brand: 'Mystic Moments', basePrice: 44, description: 'Ylang ylang, coconut, lime, patchouli — holiday mood' },
  { name: 'Spa Signature', skuBase: 'DB-SPA', brand: 'Absolute Aromas', basePrice: 58, description: 'Eucalyptus, peppermint, bergamot — classic spa atmosphere' },
  { name: 'Sleep Well', skuBase: 'DB-SLP', brand: 'Tisserand', basePrice: 46, description: 'Lavender, cedarwood, vetiver — bedtime diffusion' },
  { name: 'Immunity Boost', skuBase: 'DB-IMM', brand: 'Absolute Aromas', basePrice: 50, description: 'Eucalyptus, tea tree, lemon, rosemary — winter wellness' },
  { name: 'Morning Energy', skuBase: 'DB-MOR', brand: 'Nikura', basePrice: 38, description: 'Peppermint, grapefruit, rosemary — energising start' },
];

const DB_SIZES = [
  { size: '5ml', skuSuffix: '005', priceMultiplier: 1.0, stock: 35 },
  { size: '10ml', skuSuffix: '010', priceMultiplier: 1.7, stock: 28 },
  { size: '30ml', skuSuffix: '030', priceMultiplier: 4.0, stock: 15 },
];

const ROLLON_BASES = [
  { name: 'Migraine Relief', skuBase: 'RO-MIG', brand: 'Tisserand', basePrice: 35, description: 'Peppermint, lavender, basil in fractionated coconut oil' },
  { name: 'Skin Clear', skuBase: 'RO-SKC', brand: 'Nikura', basePrice: 32, description: 'Tea tree, lavender, frankincense — spot treatment' },
  { name: 'Tension Tamer', skuBase: 'RO-TEN', brand: 'Absolute Aromas', basePrice: 33, description: 'Lavender, marjoram, chamomile — neck and shoulder tension' },
  { name: 'Jet Lag Relief', skuBase: 'RO-JET', brand: 'Tisserand', basePrice: 36, description: 'Peppermint, rosemary, grapefruit — alertness on the go' },
  { name: 'Anxiety Ease', skuBase: 'RO-ANX', brand: 'Tisserand', basePrice: 38, description: 'Bergamot, lavender, vetiver — pocket-sized calm' },
  { name: 'Sleep Drops', skuBase: 'RO-SLP', brand: 'Absolute Aromas', basePrice: 34, description: 'Chamomile, cedarwood, vetiver — apply to pulse points at bedtime' },
  { name: 'Immunity Guard', skuBase: 'RO-IMM', brand: 'Nikura', basePrice: 30, description: 'Eucalyptus, tea tree, lemon — roll on chest and throat' },
  { name: 'Focus Flow', skuBase: 'RO-FOC', brand: 'Tisserand', basePrice: 36, description: 'Rosemary, peppermint, basil — roll on temples for concentration' },
];

const RO_SIZES = [
  { size: '5ml', skuSuffix: '005', priceMultiplier: 1.0, stock: 40 },
  { size: '10ml', skuSuffix: '010', priceMultiplier: 1.65, stock: 35 },
];

const BALM_BASES = [
  { name: 'Arnica Muscle', skuBase: 'BL-ARM', brand: 'Nikura', basePrice: 55, description: 'Arnica infused beeswax — bruising, sprains, muscle aches' },
  { name: 'Calendula Healing', skuBase: 'BL-CAL', brand: 'Absolute Aromas', basePrice: 48, description: 'Organic calendula and chamomile beeswax — dry cracked skin' },
  { name: 'Eczema Soothe', skuBase: 'BL-ECZ', brand: 'Tisserand', basePrice: 62, description: 'Oat extract, chamomile, lavender — sensitive reactive skin' },
  { name: 'Lip Repair', skuBase: 'BL-LIP', brand: 'Nikura', basePrice: 28, description: 'Beeswax, shea, vitamin E, peppermint — intensive lip conditioning' },
  { name: 'Cuticle Nourish', skuBase: 'BL-CUT', brand: 'Mystic Moments', basePrice: 32, description: 'Jojoba, lemon, myrrh — softening nail cuticle balm' },
  { name: 'Joint Ease', skuBase: 'BL-JNT', brand: 'Absolute Aromas', basePrice: 68, description: 'Frankincense, ginger, black pepper, turmeric — joint comfort' },
  { name: 'Scar Fade', skuBase: 'BL-SCR', brand: 'Tisserand', basePrice: 78, description: 'Rosehip, tamanu, helichrysum — scar tissue fading balm' },
  { name: 'Nappy Rash', skuBase: 'BL-NAP', brand: 'Absolute Aromas', basePrice: 38, description: 'Zinc, calendula, chamomile — gentle baby protective balm' },
];

const BL_SIZES = [
  { size: '30ml', skuSuffix: '030', priceMultiplier: 1.0, stock: 30 },
  { size: '60ml', skuSuffix: '060', priceMultiplier: 1.7, stock: 22 },
  { size: '100ml', skuSuffix: '100', priceMultiplier: 2.5, stock: 15 },
];

const HYDROSOL_BASES = [
  { name: 'Rose', skuBase: 'HY-ROS', brand: 'Nikura', basePrice: 32, description: 'Rosa damascena distillate — toning, hydrating facial mist' },
  { name: 'Frankincense', skuBase: 'HY-FRK', brand: 'Nikura', basePrice: 40, description: 'Boswellia carterii distillate — anti-aging facial mist' },
  { name: 'Lavender', skuBase: 'HY-LAV', brand: 'Absolute Aromas', basePrice: 28, description: 'Lavandula angustifolia distillate — soothing all-purpose mist' },
  { name: 'Chamomile', skuBase: 'HY-CHM', brand: 'Mystic Moments', basePrice: 35, description: 'Anthemis nobilis distillate — anti-inflammatory, sensitive skin' },
  { name: 'Peppermint', skuBase: 'HY-PEP', brand: 'Nikura', basePrice: 26, description: 'Mentha x piperita distillate — cooling, refreshing body mist' },
  { name: 'Neroli', skuBase: 'HY-NER', brand: 'Absolute Aromas', basePrice: 55, description: 'Citrus aurantium blossom distillate — luxury facial toner' },
];

const HY_SIZES = [
  { size: '100ml', skuSuffix: '100', priceMultiplier: 1.0, stock: 30 },
  { size: '200ml', skuSuffix: '200', priceMultiplier: 1.8, stock: 20 },
  { size: '500ml', skuSuffix: '500', priceMultiplier: 3.5, stock: 12 },
];

const FIXED_PRODUCTS = [
  { name: 'Evening Primrose Oil Capsules 90s', sku: 'SUP-EPO-090', category: 'Supplements', brand: 'Nikura', unitPrice: 95, costPrice: 45, unit: 'Bottle', size: '90 capsules', description: 'GLA-rich EPO — hormonal balance, skin health', stock: 25 },
  { name: 'Black Seed Oil Capsules 60s', sku: 'SUP-BSO-060', category: 'Supplements', brand: 'Nikura', unitPrice: 88, costPrice: 42, unit: 'Bottle', size: '60 capsules', description: 'Nigella sativa — immune, anti-inflammatory', stock: 20 },
  { name: 'Ashwagandha Extract Capsules 60s', sku: 'SUP-ASH-060', category: 'Supplements', brand: 'Nikura', unitPrice: 92, costPrice: 44, unit: 'Bottle', size: '60 capsules', description: 'KSM-66 — adaptogen, stress and cortisol balance', stock: 22 },
  { name: 'Omega-3 Fish Oil Capsules 90s', sku: 'SUP-OMG-090', category: 'Supplements', brand: 'Nikura', unitPrice: 78, costPrice: 36, unit: 'Bottle', size: '90 capsules', description: 'EPA and DHA fish oil — heart, brain, anti-inflammatory', stock: 28 },
  { name: 'Magnesium Glycinate 60s', sku: 'SUP-MAG-060', category: 'Supplements', brand: 'Nikura', unitPrice: 85, costPrice: 40, unit: 'Bottle', size: '60 capsules', description: 'High-absorption magnesium — sleep, muscle, mood', stock: 18 },
  { name: 'Ultrasonic Diffuser 200ml White', sku: 'ELC-UDW-200', category: 'Electronics', brand: 'Tisserand', unitPrice: 195, costPrice: 95, unit: 'Unit', size: '200ml', description: '200ml ultrasonic diffuser — USB, LED mood light', stock: 15 },
  { name: 'Nebulising Diffuser Beech Wood', sku: 'ELC-NBZ-BWD', category: 'Electronics', brand: 'Tisserand', unitPrice: 420, costPrice: 210, unit: 'Unit', description: 'Cold-air nebuliser — no heat, no water, max therapeutic benefit', stock: 8 },
  { name: 'Car Diffuser USB Vent Clip', sku: 'ELC-CAR-USB', category: 'Electronics', brand: 'Tisserand', unitPrice: 85, costPrice: 40, unit: 'Unit', description: 'USB-C car diffuser — 10ml reservoir, auto shut-off', stock: 25 },
  { name: 'Ultrasonic Diffuser 500ml Rose Gold', sku: 'ELC-UDR-500', category: 'Electronics', brand: 'Tisserand', unitPrice: 285, costPrice: 140, unit: 'Unit', size: '500ml', description: '500ml premium ultrasonic diffuser — 10 colour LED, timer', stock: 10 },
  { name: 'Aromatherapy Inhaler Blanks 10-pack', sku: 'ELC-INH-010', category: 'Electronics', brand: 'Nikura', unitPrice: 55, costPrice: 25, unit: 'Pack', description: 'Empty personal aromatherapy inhalers with wicks — 10 per pack', stock: 40 },
  { name: 'Amber Glass Roller Bottles 10ml 12-pack', sku: 'STA-RLB-010', category: 'Stationery', brand: 'Nikura', unitPrice: 45, costPrice: 20, unit: 'Pack', description: 'Amber glass roll-on bottles with steel ball — 12 per pack', stock: 50 },
  { name: 'Dark Blue Dropper Bottles 30ml 6-pack', sku: 'STA-DDB-030', category: 'Stationery', brand: 'Nikura', unitPrice: 38, costPrice: 17, unit: 'Pack', description: 'Blue glass dropper bottles with pipette — 6 per pack', stock: 40 },
  { name: 'Fragrance Labels Handwritten Style 100s', sku: 'STA-LBL-HWS', category: 'Stationery', brand: 'Mystic Moments', unitPrice: 28, costPrice: 12, unit: 'Pack', description: 'Pre-printed handwriting-style product labels — 100 per sheet pack', stock: 60 },
  { name: 'Essential Oil Record Book A5', sku: 'STA-BKA5-EOR', category: 'Stationery', brand: 'Mystic Moments', unitPrice: 32, costPrice: 14, unit: 'Unit', description: 'A5 aromatherapy blending journal with pre-formatted log pages', stock: 25 },
  { name: 'Bamboo Blending Spatula Set 5-piece', sku: 'STA-SPA-BMS', category: 'Stationery', brand: 'Nikura', unitPrice: 22, costPrice: 9, unit: 'Set', description: 'Bamboo spatulas for measuring and blending — 5 sizes', stock: 35 },
];

interface ProductRow {
  name: string;
  sku: string;
  category: string;
  brand: string;
  unitPrice: number;
  costPrice: number;
  unit: string;
  size?: string;
  description: string;
  stock: number;
}

function buildProducts(): ProductRow[] {
  const rows: ProductRow[] = [];

  for (const oil of ESSENTIAL_OIL_BASES) {
    for (const s of EO_SIZES) {
      const price = Math.round(oil.basePrice * s.priceMultiplier);
      rows.push({
        name: `${oil.name} Essential Oil ${s.size}`,
        sku: `${oil.skuBase}-${s.skuSuffix}`,
        category: 'Essential Oils',
        brand: oil.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.5),
        unit: 'Bottle',
        size: s.size,
        description: oil.description,
        stock: s.stock,
      });
    }
  }

  for (const oil of CARRIER_OIL_BASES) {
    for (const s of CO_SIZES) {
      const price = Math.round(oil.basePrice * s.priceMultiplier);
      rows.push({
        name: `${oil.name} Oil ${s.size}`,
        sku: `${oil.skuBase}-${s.skuSuffix}`,
        category: 'Carrier Oils',
        brand: oil.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.48),
        unit: 'Bottle',
        size: s.size,
        description: oil.description,
        stock: s.stock,
      });
    }
  }

  for (const b of BATH_SALT_BASES) {
    for (const s of BS_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Bath Salts ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Bath Salts',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.46),
        unit: s.size.endsWith('kg') ? 'Bag' : 'Jar',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of BODY_BUTTER_BASES) {
    for (const s of BB_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Body Butter ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Body Butters',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.47),
        unit: 'Jar',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of MASSAGE_BLEND_BASES) {
    for (const s of MB_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Massage Blend ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Massage Blends',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.49),
        unit: 'Bottle',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of DIFFUSER_BLEND_BASES) {
    for (const s of DB_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Diffuser Blend ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Diffuser Blends',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.50),
        unit: 'Bottle',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of ROLLON_BASES) {
    for (const s of RO_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Roll-on ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Roll-ons',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.47),
        unit: 'Bottle',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of BALM_BASES) {
    for (const s of BL_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Balm ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Balms & Salves',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.46),
        unit: 'Tin',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const b of HYDROSOL_BASES) {
    for (const s of HY_SIZES) {
      const price = Math.round(b.basePrice * s.priceMultiplier);
      rows.push({
        name: `${b.name} Hydrosol ${s.size}`,
        sku: `${b.skuBase}-${s.skuSuffix}`,
        category: 'Hydrosols',
        brand: b.brand,
        unitPrice: price,
        costPrice: Math.round(price * 0.46),
        unit: 'Bottle',
        size: s.size,
        description: b.description,
        stock: s.stock,
      });
    }
  }

  for (const p of FIXED_PRODUCTS) {
    rows.push({
      name: p.name,
      sku: p.sku,
      category: p.category,
      brand: p.brand,
      unitPrice: p.unitPrice,
      costPrice: p.costPrice,
      unit: p.unit,
      size: p.size,
      description: p.description,
      stock: p.stock,
    });
  }

  return rows;
}

async function main() {
  const cookie = await login();
  const brands = await getBrands(cookie);
  const existingSkus = await getExistingSkus(cookie);

  const products = buildProducts();
  console.log(`Generated ${products.length} product definitions`);
  console.log(`Loaded ${Object.keys(brands).length} brands, ${existingSkus.size} existing SKUs`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const prod of products) {
    if (existingSkus.has(prod.sku)) {
      skipped++;
      continue;
    }

    const brandId = brands[prod.brand];
    if (!brandId) {
      console.warn(`  ⚠ Brand not found: "${prod.brand}" — skipping ${prod.sku}`);
      failed++;
      continue;
    }

    const { status, data } = await createProduct({
      name: prod.name,
      sku: prod.sku,
      category: prod.category,
      unitPrice: prod.unitPrice.toFixed(2),
      costPrice: prod.costPrice.toFixed(2),
      vatRate: '0.05',
      unit: prod.unit,
      size: prod.size ?? null,
      description: prod.description,
      brandId,
      stockQuantity: prod.stock,
      minStockLevel: Math.max(2, Math.floor(prod.stock * 0.15)),
    }, cookie);

    if (status === 201) {
      created++;
      process.stdout.write(`  ✓ ${prod.sku}\n`);
    } else {
      failed++;
      console.error(`  ✗ Failed (${status}): ${prod.sku} — ${JSON.stringify(data).substring(0, 80)}`);
    }
  }

  console.log(`\nDone. Generated: ${products.length}, Created: ${created}, Skipped (existing): ${skipped}, Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
