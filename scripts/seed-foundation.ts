/**
 * seed-foundation.ts — Task #54
 * Comprehensive foundation seeder. Runs in order:
 *   1. 14 users  (4 Manager, 10 Staff)
 *   2. 25+ brands
 *   3. 70+ suppliers  (UK 20+, India 15+, USA 10+, France 8+, Germany 5+, Australia 5+, UAE 5+, Italy 5+)
 *   4. 600+ products across all 12 categories with mixed cost-price currencies
 *      (GBP for first ~200, USD for next ~200, INR for next ~200, AED for remainder)
 *
 * Usage:  npx tsx scripts/seed-foundation.ts
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:5000';
const USERNAME = process.env.ADMIN_USERNAME ?? 'admin';
const PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// FX rates matching company_settings defaults
const FX = { GBP: 4.85, USD: 3.6725, INR: 0.044 };

// ─── Auth ──────────────────────────────────────────────────────────────────

async function login(): Promise<string> {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed: ${r.status} ${await r.text()}`);
  const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  if (!cookie) throw new Error('No session cookie');
  console.log(`✓ Authenticated as ${USERNAME}`);
  return cookie;
}

async function apiPost(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

// ─── 1. USERS ──────────────────────────────────────────────────────────────

const USERS = [
  // Managers
  { username: 'sara.almansouri',  firstName: 'Sara',      lastName: 'Al-Mansouri', email: 'sara.almansouri@flowuae.com',    role: 'Manager' },
  { username: 'ahmed.alrashidi',  firstName: 'Ahmed',     lastName: 'Al-Rashidi',  email: 'ahmed.alrashidi@flowuae.com',   role: 'Manager' },
  { username: 'priya.nair',       firstName: 'Priya',     lastName: 'Nair',        email: 'priya.nair@flowuae.com',        role: 'Manager' },
  { username: 'james.wilson',     firstName: 'James',     lastName: 'Wilson',      email: 'james.wilson@flowuae.com',      role: 'Manager' },
  // Staff
  { username: 'fatima.alzaabi',   firstName: 'Fatima',    lastName: 'Al-Zaabi',    email: 'fatima.alzaabi@flowuae.com',   role: 'Staff' },
  { username: 'mohammed.alshehhi',firstName: 'Mohammed',  lastName: 'Al-Shehhi',   email: 'mohammed.alshehhi@flowuae.com',role: 'Staff' },
  { username: 'rania.hassan',     firstName: 'Rania',     lastName: 'Hassan',      email: 'rania.hassan@flowuae.com',     role: 'Staff' },
  { username: 'david.chen',       firstName: 'David',     lastName: 'Chen',        email: 'david.chen@flowuae.com',       role: 'Staff' },
  { username: 'aisha.albloushi',  firstName: 'Aisha',     lastName: 'Al-Bloushi',  email: 'aisha.albloushi@flowuae.com',  role: 'Staff' },
  { username: 'omar.khaled',      firstName: 'Omar',      lastName: 'Khaled',      email: 'omar.khaled@flowuae.com',      role: 'Staff' },
  { username: 'deepa.patel',      firstName: 'Deepa',     lastName: 'Patel',       email: 'deepa.patel@flowuae.com',      role: 'Staff' },
  { username: 'carlos.martinez',  firstName: 'Carlos',    lastName: 'Martinez',    email: 'carlos.martinez@flowuae.com',  role: 'Staff' },
  { username: 'layla.alfarsi',    firstName: 'Layla',     lastName: 'Al-Farsi',    email: 'layla.alfarsi@flowuae.com',    role: 'Staff' },
  { username: 'abdullah.alhamdan',firstName: 'Abdullah',  lastName: 'Al-Hamdan',   email: 'abdullah.alhamdan@flowuae.com',role: 'Staff' },
];

async function seedUsers(cookie: string) {
  console.log('\n── Creating users ─────────────────────────────────────────');
  const existing = await fetch(`${BASE_URL}/api/users`, { headers: { Cookie: cookie } });
  const existingData = await existing.json() as unknown;
  const existingList: Array<{ username: string }> = Array.isArray(existingData)
    ? existingData as Array<{ username: string }>
    : ((existingData as { users?: Array<{ username: string }> }).users ?? []);
  const existingUsernames = new Set(existingList.map((u: { username: string }) => u.username));

  let created = 0, skipped = 0;
  for (const u of USERS) {
    if (existingUsernames.has(u.username)) { skipped++; continue; }
    const { status, data } = await apiPost('/api/users', { ...u, password: 'Pass@1234' }, cookie);
    if (status === 201) { created++; console.log(`  ✓ ${u.role}: ${u.firstName} ${u.lastName}`); }
    else console.error(`  ✗ ${u.username}: ${JSON.stringify(data).substring(0, 80)}`);
  }
  console.log(`  Users: created ${created}, skipped ${skipped}`);
}

// ─── 2. BRANDS ─────────────────────────────────────────────────────────────

const BRANDS = [
  'Absolute Aromas', 'Mystic Moments', 'Tisserand', 'Nikura',
  "Neal's Yard Remedies", 'Pranarom', 'Weleda', 'Florame', 'Oshadhi',
  'Eden Botanicals', 'Rocky Mountain Oils', 'Plant Therapy', 'Now Foods',
  'Aura Cacia', 'doTERRA', 'Young Living', 'Edens Garden', 'Revive Essential Oils',
  'Majestic Pure', 'Viva Naturals', 'Base Formula', 'Naissance', 'Amphora Aromatics',
  'Essentially Oils', 'Aromantic', 'Australian Botanical Products',
  'Mountain Rose Herbs', 'Gya Labs', 'Sala Essentials', 'Certified Natural',
  'Freshskin Beauty',
];

async function seedBrands(cookie: string): Promise<Record<string, number>> {
  console.log('\n── Creating brands ────────────────────────────────────────');
  const r = await fetch(`${BASE_URL}/api/brands`, { headers: { Cookie: cookie } });
  const existingList = await r.json() as Array<{ id: number; name: string }>;
  const brandMap: Record<string, number> = {};
  for (const b of existingList) brandMap[b.name] = b.id;

  let created = 0;
  for (const name of BRANDS) {
    if (brandMap[name]) continue;
    const { status, data } = await apiPost('/api/brands', { name }, cookie);
    if (status === 201) { brandMap[name] = data.id; created++; console.log(`  ✓ ${name}`); }
    else console.error(`  ✗ ${name}: ${JSON.stringify(data).substring(0, 60)}`);
  }
  console.log(`  Brands: created ${created}, total ${Object.keys(brandMap).length}`);
  return brandMap;
}

// ─── 3. SUPPLIERS ──────────────────────────────────────────────────────────

const SUPPLIERS = [
  // ── UK (20+) ──
  { name: 'Amphora Aromatics Ltd', email: 'trade@amphora-retail.co.uk', phone: '+44 117 904 7212', address: 'Unit 1, Aldermoor Way, Longwell Green, Bristol BS30 7DA', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Essential oils, carrier oils' },
  { name: 'Naissance Natural Health Ltd', email: 'wholesale@naissance.com', phone: '+44 1639 825 107', address: 'Unit 4, Baglan Energy Park, Port Talbot SA12 7AX', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Carrier oils, butters, certified organic' },
  { name: 'Aromantic Ltd', email: 'orders@aromantic.co.uk', phone: '+44 1309 696 900', address: 'Unit 1, Pike Road Industrial Estate, Forres IV36 2GH', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Skincare ingredients, botanicals' },
  { name: 'Freshskin Beauty Ltd', email: 'wholesale@freshskinbeauty.co.uk', phone: '+44 1327 351 104', address: '1 Chalcot Court, Daventry NN11 8YH', country: 'United Kingdom', payment_terms: 'Net 30' },
  { name: 'Essentially Oils Ltd', email: 'info@essentiallyoils.com', phone: '+44 1608 659 544', address: '8-10 Mount Farm, Junction Road, Churchill OX7 6NP', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'GC/MS tested therapeutic grade EOs' },
  { name: 'Base Formula Ltd', email: 'wholesale@baseformula.com', phone: '+44 1273 301 483', address: '17 Burgess Hill Business Centre, Burgess Hill RH15 8JL', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Base ingredients for cosmetics and aromatherapy' },
  { name: 'G Baldwin & Co', email: 'trade@baldwins.co.uk', phone: '+44 20 7703 5550', address: '171-173 Walworth Road, London SE17 1RW', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'London\'s oldest herbalist since 1844' },
  { name: 'The Soap Kitchen Ltd', email: 'wholesale@thesoakitchen.co.uk', phone: '+44 1803 868 989', address: 'Unit 2 Blatchcombe Business Park, Paignton TQ3 1RF', country: 'United Kingdom', payment_terms: 'Net 30' },
  { name: 'NHR Organic Oils', email: 'trade@nhr.co.uk', phone: '+44 1273 746 850', address: '46 New Writtle Street, Chelmsford CM2 0SL', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Certified organic, biodynamic, wild-crafted' },
  { name: 'Aqua Oleum UK', email: 'wholesale@aquaoleum.co.uk', phone: '+44 1453 794 350', address: 'Unit 4, Wheatpieces, Tewkesbury GL20 7BY', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Ethical sourcing, community trade certified' },
  { name: 'Oshadhi UK Distribution', email: 'uk@oshadhi.co.uk', phone: '+44 1787 474 974', address: '14 High Street, Lavenham CO10 9PT', country: 'United Kingdom', payment_terms: 'Net 45', notes: 'European certified organic EOs, Ayurvedic herbs' },
  { name: 'Hermitage Oils', email: 'info@hermitage-oils.com', phone: '+44 1837 659 100', address: 'Hermitage Farm, Winkleigh EX19 8JS', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Small-batch distillation, UK-grown herbs' },
  { name: 'Tisserand Institute UK', email: 'trade@tisserand.com', phone: '+44 1273 325 666', address: 'Enterprise House, Queens Road, Brighton BN1 3XE', country: 'United Kingdom', payment_terms: 'Net 45', notes: 'Aromatherapy research and certified products' },
  { name: 'Florihana UK Office', email: 'uk@florihana.co.uk', phone: '+44 20 3051 0120', address: 'Innovation Centre, 103 Clarendon Road, Leeds LS2 9DF', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'French-certified organic hydrosols and EOs' },
  { name: 'Neals Yard Remedies Wholesale', email: 'wholesale@nealsyardremedies.com', phone: '+44 1747 834 600', address: 'Peacemarsh, Gillingham, Dorset SP8 4EU', country: 'United Kingdom', payment_terms: 'Net 45', notes: 'Organic health and beauty, strong ethics' },
  { name: 'Plant Therapy UK Ltd', email: 'uk@planttherapy.com', phone: '+44 20 3481 2345', address: '40 Bank Street, Canary Wharf, London E14 5NR', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'GC/MS batch testing, KidSafe certified' },
  { name: 'Absolute Aromas Ltd', email: 'wholesale@absolute-aromas.com', phone: '+44 1420 540 400', address: 'Burford Lodge, Mill Lane, Alton GU34 2QG', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'UK founding aromatherapy house' },
  { name: 'Crystal Spring Ltd', email: 'trade@crystalspring.co.uk', phone: '+44 1273 494 614', address: '16 Westview Close, Peacehaven BN10 7QR', country: 'United Kingdom', payment_terms: 'Net 30' },
  { name: 'Caurnie Soap Company', email: 'wholesale@caurnie.com', phone: '+44 1236 875 735', address: 'Chapelhill Farm, Kilsyth, Glasgow G65 0RN', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Natural soap bases, shampoo bars, body wash bases' },
  { name: 'Weleda UK Ltd', email: 'uk.wholesale@weleda.com', phone: '+44 115 944 8200', address: 'Heanor Road, Ilkeston DE7 8DR', country: 'United Kingdom', payment_terms: 'Net 60', notes: 'Biodynamic, Demeter certified anthroposophic remedies' },

  // ── India (15+) ──
  { name: 'Indian Aroma Products Pvt Ltd', email: 'export@indianaroma.in', phone: '+91 99 1234 5678', address: '52 Sector 18, Noida, Uttar Pradesh 201 301', country: 'India', payment_terms: 'Net 60', notes: 'Therapeutic grade EOs, bulk carriers' },
  { name: 'Kanta Enterprises Kannauj', email: 'sales@kantaenterpriseskannauj.com', phone: '+91 51 6222 2345', address: 'Kannauj, Uttar Pradesh 209 726', country: 'India', payment_terms: 'Net 60', notes: 'Rose otto, jasmine, sandalwood — Kannauj attar tradition' },
  { name: 'Prakruti Products', email: 'exports@prakrutiproducts.com', phone: '+91 79 2630 0011', address: '501 Sakar III, Ashram Road, Ahmedabad 380 009', country: 'India', payment_terms: 'Net 45', notes: 'COSMOS certified organics, fair trade' },
  { name: 'Green Fields International India', email: 'info@greenfieldsintl.in', phone: '+91 22 2836 0077', address: '221 Nariman Point, Mumbai 400 021', country: 'India', payment_terms: 'Net 60' },
  { name: 'Paras Perfumers Pvt Ltd', email: 'export@parasperfumers.com', phone: '+91 22 2387 1155', address: '48 Phule Market, Dharavi, Mumbai 400 017', country: 'India', payment_terms: 'Net 45', notes: 'Perfume bases, attars, floral concretes' },
  { name: 'Global Agri Trade India', email: 'exports@globalagritrade.co.in', phone: '+91 40 2765 0000', address: 'Hitech City, Hyderabad 500 081', country: 'India', payment_terms: 'Net 60', notes: 'Turmeric, neem, tulsi, ashwagandha botanicals' },
  { name: 'Herbal Hills Pvt Ltd', email: 'exports@herbalhills.com', phone: '+91 20 6641 5050', address: '5th Floor, Sharada Arcade, Pune 411 005', country: 'India', payment_terms: 'Net 45', notes: 'Ayurvedic herbs, extracts, vegetable capsules' },
  { name: 'SVA Organics Inc', email: 'exports@svaorganics.com', phone: '+91 20 2669 3440', address: 'Lonavala, Pune District, Maharashtra 410 401', country: 'India', payment_terms: 'Net 45', notes: 'USDA organic certified EOs, hydrosols' },
  { name: 'Moksha Lifestyle Products', email: 'exports@mokshalifestyle.com', phone: '+91 11 2581 0000', address: 'Plot 16, Sector 6, Faridabad, Haryana 121 006', country: 'India', payment_terms: 'Net 30', notes: 'ISO certified, GC/MS tested EOs' },
  { name: 'Veda Oils India', email: 'export@vedaoils.com', phone: '+91 95 5959 9821', address: 'NH-1, Karnal, Haryana 132 001', country: 'India', payment_terms: 'Net 30', notes: 'Retail and wholesale, 200+ EOs and carriers' },
  { name: 'AOS Products Pvt Ltd', email: 'export@aosproducts.com', phone: '+91 5692 251 000', address: 'Opp. Collectorate, Kannauj 209 726', country: 'India', payment_terms: 'Net 45', notes: 'Large-scale EO distillation, ISO 9001:2015' },
  { name: 'Kama Ayurveda Ingredients', email: 'wholesale@kamaayurveda.com', phone: '+91 11 4163 0999', address: 'E-175, Greater Kailash Part 1, New Delhi 110 048', country: 'India', payment_terms: 'Net 45', notes: 'Premium Ayurvedic ingredients, sustainably sourced' },
  { name: 'Shalimar Exports Pvt Ltd', email: 'info@shalimarexports.com', phone: '+91 11 2326 6600', address: '33/2 Ajmeri Gate, Delhi 110 006', country: 'India', payment_terms: 'Net 60', notes: 'Oud, rose, jasmine absolutes — old Delhi trade house' },
  { name: 'Organics Bhoomi Pvt Ltd', email: 'export@organicsbhoomi.com', phone: '+91 94 1489 9777', address: 'Raipur, Chhattisgarh 492 001', country: 'India', payment_terms: 'Net 45', notes: 'Organic aloe vera, neem extracts, herbal powders' },
  { name: 'Himalayan Herbs India', email: 'export@himalayanherbsindia.com', phone: '+91 13 3222 3456', address: 'Mall Road, Shimla, Himachal Pradesh 171 001', country: 'India', payment_terms: 'Net 60', notes: 'Alpine herbs, rhododendron, Himalayan spices' },

  // ── USA (10+) ──
  { name: 'Rocky Mountain Oils LLC', email: 'wholesale@rockymountainoils.com', phone: '+1 888 330 0051', address: '2076 South State Street, Orem, Utah 84058', country: 'United States', payment_terms: 'Net 30', notes: 'GC/MS tested, seed to seal' },
  { name: 'Bulk Apothecary Inc', email: 'wholesale@bulkapothecary.com', phone: '+1 888 728 7612', address: '45 Fir Hill, Akron, Ohio 44304', country: 'United States', payment_terms: 'Net 30', notes: 'Carrier oils, butters, waxes, candle supplies' },
  { name: 'Botanical Beauty Inc', email: 'b2b@botanicalbeauty.com', phone: '+1 310 745 3331', address: '2355 Westwood Blvd, Los Angeles, CA 90064', country: 'United States', payment_terms: 'Net 45' },
  { name: 'Mountain Rose Herbs', email: 'wholesale@mountainroseherbs.com', phone: '+1 800 879 3337', address: 'PO Box 50220, Eugene, Oregon 97405', country: 'United States', payment_terms: 'Net 30', notes: 'Certified organic, fair trade, activist company' },
  { name: 'Plant Therapy International', email: 'b2b@planttherapy.com', phone: '+1 800 917 6577', address: '1900 Whitley Drive, Twin Falls, Idaho 83301', country: 'United States', payment_terms: 'Net 30', notes: 'KidSafe range, GC/MS certified' },
  { name: 'NOW Health Group Inc', email: 'wholesale@nowfoods.com', phone: '+1 630 545 9000', address: '244 Knollwood Drive, Bloomingdale, Illinois 60108', country: 'United States', payment_terms: 'Net 30', notes: 'Supplements, EOs, carrier oils — broad range' },
  { name: 'Aura Cacia Inc', email: 'wholesale@auracacia.com', phone: '+1 800 437 3301', address: '108 West Street, Urbana, Iowa 52345', country: 'United States', payment_terms: 'Net 45', notes: 'Fair trade and sustainably sourced aromatherapy' },
  { name: 'Starwest Botanicals', email: 'wholesale@starwestbotanicals.com', phone: '+1 888 273 4372', address: '161 Main Avenue, Sacramento, California 95838', country: 'United States', payment_terms: 'Net 30', notes: 'Bulk dried herbs, tinctures, spices — 600+ items' },
  { name: 'Edens Garden LLC', email: 'b2b@edensgarden.com', phone: '+1 866 381 0593', address: '809 Balboa Avenue, San Marcos, California 92078', country: 'United States', payment_terms: 'Net 30', notes: 'GC/MS verified, no MLM, family-founded' },
  { name: 'SVA Organics USA', email: 'wholesale@svaorganicsusa.com', phone: '+1 805 220 0820', address: '1122 Westlake Village Rd, Thousand Oaks, CA 91361', country: 'United States', payment_terms: 'Net 30', notes: 'USDA organic certified EOs and hydrosols' },

  // ── France (8+) ──
  { name: 'Biolandes Aromates SARL', email: 'export@biolandes.com', phone: '+33 5 58 78 16 16', address: '40 Route de Roquefort, 40120 Retjons', country: 'France', payment_terms: 'Net 60', notes: 'French lavender, lavandin, mint' },
  { name: 'Robertet SA', email: 'naturalmaterials@robertet.com', phone: '+33 4 94 60 90 00', address: '1 Place Général de Gaulle, 83170 Brignoles', country: 'France', payment_terms: 'Net 90', notes: 'Premium fragrance naturals — rose de mai, jasmine' },
  { name: 'Huiles & Sens France', email: 'b2b@huiles-et-sens.com', phone: '+33 4 90 09 34 80', address: 'ZI Les Gaffins, 84220 Roussillon', country: 'France', payment_terms: 'Net 45' },
  { name: 'Florame SARL', email: 'export@florame.com', phone: '+33 4 90 05 16 55', address: 'Chemin de Marcelline, 13210 Saint-Rémy-de-Provence', country: 'France', payment_terms: 'Net 45', notes: 'AB certified organic, Provence heritage since 1995' },
  { name: 'Pranarom International SA', email: 'export.fr@pranarom.com', phone: '+33 2 99 14 25 00', address: '98 Rue du Bignon, 35134 Vezin-le-Coquet', country: 'France', payment_terms: 'Net 60', notes: 'Scientifically validated aromatherapy' },
  { name: 'Elixens France', email: 'b2b@elixens.com', phone: '+33 5 58 71 82 00', address: 'ZI du Maalon, 40090 Mees, Landes', country: 'France', payment_terms: 'Net 45', notes: 'Distillation of regional French aromatic plants' },
  { name: 'Lloyds Agro Chimie', email: 'export@lloydsagro.fr', phone: '+33 4 90 22 59 29', address: 'Route de Cheval Blanc, 13300 Salon-de-Provence', country: 'France', payment_terms: 'Net 60', notes: 'Lavender and lavandin regional cooperative' },
  { name: 'ID Parfums France', email: 'export@idparfums.fr', phone: '+33 1 43 38 47 50', address: '23 Rue Jacob, 75006 Paris', country: 'France', payment_terms: 'Net 45', notes: 'Niche fragrance ingredients, absolutes, concretes' },

  // ── Germany (5+) ──
  { name: 'Primavera Life GmbH', email: 'export@primaveralife.com', phone: '+49 8379 9287 0', address: 'Aumühleweg 1, 87477 Sulzberg-Moosbach', country: 'Germany', payment_terms: 'Net 45', notes: 'Certified organic essential oils' },
  { name: 'Wala Heilmittel GmbH', email: 'international@wala.de', phone: '+49 7164 930 0', address: 'Dorfstraße 1, 73087 Bad Boll', country: 'Germany', payment_terms: 'Net 60', notes: 'Biodynamic plant extracts, Dr. Hauschka base oils' },
  { name: 'Sonett GmbH', email: 'export@sonett.eu', phone: '+49 7823 8600 0', address: 'Lindenweg 2, 77963 Schwanau', country: 'Germany', payment_terms: 'Net 30', notes: 'BDIH certified, biodynamic, ecological household range' },
  { name: 'Werner Mäntele KG', email: 'trade@drweilerschemie.de', phone: '+49 89 3092 0', address: 'Fraunhoferstr. 33, 82152 Planegg', country: 'Germany', payment_terms: 'Net 45', notes: 'Cosmetic active ingredients, emulsifiers, preservatives' },
  { name: 'Aromaheim GmbH', email: 'export@aromaheim.de', phone: '+49 421 5467 4040', address: 'Überseestadt, Am Weser-Terminal 5, 28217 Bremen', country: 'Germany', payment_terms: 'Net 30', notes: 'Wholesale aromatherapy, distribution across DACH region' },

  // ── Australia (5+) ──
  { name: 'Australian Wholesale Oils', email: 'trade@australianwholesaleoils.com.au', phone: '+61 3 9558 4411', address: '12 Moncrief Road, Nunawading VIC 3131', country: 'Australia', payment_terms: 'Net 45', notes: 'Tea tree, eucalyptus, kanuka, manuka natives' },
  { name: 'Jurlique Farm Supplies', email: 'procurement@jurlique.com.au', phone: '+61 8 8388 1255', address: 'Mount Barker Road, Stirling SA 5152', country: 'Australia', payment_terms: 'Net 60', notes: 'Certified biodynamic — rose hip, calendula, chamomile' },
  { name: 'Perfect Potion Australia', email: 'wholesale@perfectpotion.com.au', phone: '+61 7 3399 2111', address: '29 Doggett Street, Newstead QLD 4006', country: 'Australia', payment_terms: 'Net 30', notes: 'Organic certified, aromatherapy education and supply' },
  { name: 'New Directions Australia', email: 'b2b@newdirections.com.au', phone: '+61 2 8577 5999', address: '4/41 Higginbotham Road, Gladesville NSW 2111', country: 'Australia', payment_terms: 'Net 30', notes: 'One-stop cosmetic ingredients supplier' },
  { name: 'Aussie Soap Supplies', email: 'wholesale@aussiesoapsupplies.com.au', phone: '+61 7 5437 8722', address: '6/63 Gympie Way, Noosaville QLD 4566', country: 'Australia', payment_terms: 'Net 30', notes: 'Soap bases, melt and pour, natural additives' },

  // ── Italy (5+) ──
  { name: 'Aboca SpA Società Agricola', email: 'export@aboca.com', phone: '+39 0575 746 1', address: 'Loc. Aboca 20, 52037 Sansepolcro (AR)', country: 'Italy', payment_terms: 'Net 60', notes: 'Certified organic medicinal herbs and botanical extracts' },
  { name: 'Farchioni Olii SpA', email: 'export@farchioni.com', phone: '+39 0744 930 811', address: 'Localita San Martino, 05020 Gualdo Cattaneo (PG)', country: 'Italy', payment_terms: 'Net 45', notes: 'Extra virgin olive oil, cold-pressed carriers' },
  { name: 'Biolchim SpA', email: 'export@biolchim.com', phone: '+39 051 641 5711', address: 'Via G. Pascoli 1, 40062 Molinella (BO)', country: 'Italy', payment_terms: 'Net 45', notes: 'Biostimulants, plant extracts, organic inputs' },
  { name: 'IL Health & Beauty SRL', email: 'export@ilhealthbeauty.it', phone: '+39 0432 720 021', address: 'Via del Commercio 38, 33050 Pavia di Udine (UD)', country: 'Italy', payment_terms: 'Net 45', notes: 'Private label cosmetics, Italian botanical heritage' },
  { name: 'Botanica Group Italy', email: 'export@botanicagroup.it', phone: '+39 06 9760 5100', address: 'Via delle Aquile 22, 00100 Rome', country: 'Italy', payment_terms: 'Net 60', notes: 'Phytotherapy, standardised herbal extracts, tinctures' },

  // ── UAE (5+) ──
  { name: 'Ajmal Perfumes Wholesale', email: 'wholesale@ajmalperfumes.com', phone: '+971 4 224 2000', address: 'Deira, Dubai, UAE', country: 'UAE', payment_terms: 'Net 30', notes: 'Oud, rose, musk — traditional Arabian aromatics' },
  { name: 'Emirates Bio Farm', email: 'trade@emiratesbiofarm.ae', phone: '+971 2 575 0555', address: 'Al Ain Agricultural Area, Al Ain', country: 'UAE', payment_terms: 'Net 30', notes: 'UAE-grown herbs, camel milk, ghaf extracts' },
  { name: 'Global Natural Ingredients FZE', email: 'sales@gnifze.com', phone: '+971 4 883 8700', address: 'Jebel Ali Free Zone, Dubai', country: 'UAE', payment_terms: 'Net 45', notes: 'Import-export hub for natural ingredients' },
  { name: 'Al Haramain Perfumes Co LLC', email: 'b2b@alharamain.com', phone: '+971 6 569 9002', address: 'Ajman Industrial Area, Ajman', country: 'UAE', payment_terms: 'Net 30', notes: 'Oudh, bukhoor, Arabic perfume bases' },
  { name: 'Dibaj Aromatics Trading', email: 'orders@dibajaro.ae', phone: '+971 4 339 1122', address: 'Al Quoz Industrial 4, Dubai', country: 'UAE', payment_terms: 'Net 30' },

  // ── Rest of world ──
  { name: 'Atlas Botanicals Maroc', email: 'export@atlasbotanicals.ma', phone: '+212 5 24 43 22 00', address: '12 Rue Ibn Sina, Marrakech 40000', country: 'Morocco', payment_terms: 'Net 60', notes: 'Rose de Damas, argan, thyme — Atlas mountain sourcing' },
  { name: 'Cinnamon Dreams Lanka', email: 'export@cinnamondreams.lk', phone: '+94 11 234 5678', address: 'No. 55 Galle Road, Colombo 3', country: 'Sri Lanka', payment_terms: 'Net 60', notes: 'Ceylon cinnamon, clove, cardamom, vetiver' },
  { name: 'Madagascar Oils SARL', email: 'export@madagascaroils.mg', phone: '+261 20 22 34 567', address: 'Zone Industrielle, Antananarivo 101', country: 'Madagascar', payment_terms: 'Net 60', notes: 'Ylang ylang, ravintsara, niaouli, clove' },
  { name: 'Himalayan Herb Works', email: 'export@himalayanherbworks.com.np', phone: '+977 1 553 0088', address: 'New Baneshwor, Kathmandu', country: 'Nepal', payment_terms: 'Net 45', notes: 'Juniper, rhododendron, neem — Himalayan wildcrafted' },
  { name: 'Treatt España SL', email: 'ventas@treatt-espana.com', phone: '+34 93 741 2200', address: 'Polígono Industrial Can Torrella, 08233 Vacarisses, Barcelona', country: 'Spain', payment_terms: 'Net 45', notes: 'Citrus oils — lemon, orange, lime, grapefruit' },
  { name: 'Citróleo Group', email: 'export@citroleo.com.br', phone: '+55 19 3872 2000', address: 'Rua Comendador Monteiro, Limeira, SP 13480-000', country: 'Brazil', payment_terms: 'Net 60', notes: 'Copaiba, buriti, andiroba, Amazonian carrier oils' },
  { name: 'Nippon Essential Oil Co', email: 'export@nipponessentialoil.co.jp', phone: '+81 3 3665 1234', address: '2-15-1 Nihonbashi, Chuo-ku, Tokyo 103-0027', country: 'Japan', payment_terms: 'Net 60', notes: 'Hinoki cypress, yuzu, shiso — premium Japanese aromatics' },
];

async function seedSuppliers(cookie: string) {
  console.log('\n── Creating suppliers ─────────────────────────────────────');
  const r = await fetch(`${BASE_URL}/api/suppliers`, { headers: { Cookie: cookie } });
  const existingList = await r.json() as unknown;
  const list: Array<{ id: number; name: string; paymentTerms?: string }> = Array.isArray(existingList)
    ? existingList as Array<{ id: number; name: string; paymentTerms?: string }>
    : ((existingList as { suppliers?: Array<{ id: number; name: string; paymentTerms?: string }> }).suppliers ?? []);
  const existingMap = new Map(list.map((s) => [s.name, s]));

  let created = 0, updated = 0;
  for (const sup of SUPPLIERS) {
    const fullAddress = sup.country ? `${sup.address}, ${sup.country}` : sup.address;
    const payload = {
      name: sup.name,
      email: sup.email,
      phone: sup.phone,
      address: fullAddress,
      paymentTerms: sup.payment_terms,
    };
    const existing = existingMap.get(sup.name);
    if (existing) {
      if (existing.paymentTerms !== sup.payment_terms) {
        const { status } = await apiFetch('PUT', `/api/suppliers/${existing.id}`, payload, cookie);
        if (status === 200) { updated++; }
        else console.error(`  ✗ Update failed: ${sup.name}`);
      }
    } else {
      const { status } = await apiPost('/api/suppliers', payload, cookie);
      if (status === 201) { created++; process.stdout.write(`  ✓ ${sup.name}\n`); }
      else console.error(`  ✗ Failed: ${sup.name}`);
    }
  }
  console.log(`  Suppliers: created ${created}, updated ${updated}, total defined ${SUPPLIERS.length}`);
}

async function apiFetch(method: string, path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

// ─── 4. PRODUCTS ───────────────────────────────────────────────────────────
// Currency assignment: every 200th product rotates: GBP → USD → INR → AED

type Currency = 'GBP' | 'USD' | 'INR' | 'AED';

function assignCurrency(idx: number): Currency {
  if (idx < 150) return 'GBP';
  if (idx < 300) return 'USD';
  if (idx < 450) return 'INR';
  return 'AED';
}

function costInCurrency(unitPriceAed: number, currency: Currency): number {
  const marginFactor = 0.48;
  const costAed = unitPriceAed * marginFactor;
  if (currency === 'AED') return Math.round(costAed * 100) / 100;
  return Math.round((costAed / FX[currency]) * 100) / 100;
}

interface Base { name: string; skuBase: string; brand: string; basePrice: number; description: string }

// ── Essential Oils (40 bases × 4 sizes = 160) ──────────────────────────────
const EO_BASES: Base[] = [
  { name: 'Lavender',         skuBase: 'EO-LAV', brand: 'Absolute Aromas',  basePrice: 35,  description: 'Lavandula angustifolia — calming, skin-healing' },
  { name: 'Tea Tree',         skuBase: 'EO-TEA', brand: 'Nikura',            basePrice: 30,  description: 'Melaleuca alternifolia — antimicrobial, cleansing' },
  { name: 'Peppermint',       skuBase: 'EO-PEP', brand: 'Absolute Aromas',  basePrice: 32,  description: 'Mentha x piperita — cooling, analgesic' },
  { name: 'Eucalyptus',       skuBase: 'EO-EUC', brand: 'Nikura',            basePrice: 28,  description: 'Eucalyptus globulus — respiratory, decongestant' },
  { name: 'Frankincense',     skuBase: 'EO-FRK', brand: 'Absolute Aromas',  basePrice: 78,  description: 'Boswellia carterii — anti-aging, meditative' },
  { name: 'Lemon',            skuBase: 'EO-LEM', brand: 'Nikura',            basePrice: 25,  description: 'Citrus limon — uplifting, cleansing' },
  { name: 'Orange Sweet',     skuBase: 'EO-ORS', brand: 'Mystic Moments',   basePrice: 22,  description: 'Citrus sinensis — cheerful, stress-relieving' },
  { name: 'Bergamot',         skuBase: 'EO-BER', brand: 'Tisserand',         basePrice: 42,  description: 'Citrus bergamia — uplifting, anxiety-relieving' },
  { name: 'Ylang Ylang',      skuBase: 'EO-YYL', brand: 'Absolute Aromas',  basePrice: 55,  description: 'Cananga odorata — exotic floral, sensual' },
  { name: 'Geranium',         skuBase: 'EO-GER', brand: 'Tisserand',         basePrice: 48,  description: 'Pelargonium graveolens — hormonal balance' },
  { name: 'Cedarwood',        skuBase: 'EO-CED', brand: 'Nikura',            basePrice: 30,  description: 'Cedrus atlantica — grounding, respiratory' },
  { name: 'Clary Sage',       skuBase: 'EO-CLS', brand: 'Absolute Aromas',  basePrice: 52,  description: 'Salvia sclarea — hormonal, euphoric' },
  { name: 'Patchouli',        skuBase: 'EO-PAT', brand: 'Mystic Moments',   basePrice: 44,  description: 'Pogostemon cablin — earthy, anti-inflammatory' },
  { name: 'Rosemary',         skuBase: 'EO-ROS', brand: 'Tisserand',         basePrice: 35,  description: 'Rosmarinus officinalis — memory, scalp, muscle' },
  { name: 'Chamomile Roman',  skuBase: 'EO-CHR', brand: 'Absolute Aromas',  basePrice: 95,  description: 'Anthemis nobilis — calming, anti-inflammatory' },
  { name: 'Sandalwood',       skuBase: 'EO-SAN', brand: 'Tisserand',         basePrice: 120, description: 'Santalum album — meditative, skin-softening' },
  { name: 'Vetiver',          skuBase: 'EO-VET', brand: 'Absolute Aromas',  basePrice: 75,  description: 'Vetiveria zizanoides — grounding, anti-anxiety' },
  { name: 'Juniper Berry',    skuBase: 'EO-JUN', brand: 'Nikura',            basePrice: 40,  description: 'Juniperus communis — detoxifying, purifying' },
  { name: 'Black Pepper',     skuBase: 'EO-BLK', brand: 'Mystic Moments',   basePrice: 48,  description: 'Piper nigrum — warming, analgesic' },
  { name: 'Ginger',           skuBase: 'EO-GIN', brand: 'Absolute Aromas',  basePrice: 50,  description: 'Zingiber officinale — warming, digestive' },
  { name: 'Clove Bud',        skuBase: 'EO-CLB', brand: 'Nikura',            basePrice: 35,  description: 'Syzygium aromaticum — analgesic, antimicrobial' },
  { name: 'Cinnamon Bark',    skuBase: 'EO-CIN', brand: 'Mystic Moments',   basePrice: 45,  description: 'Cinnamomum zeylanicum — warming, antibacterial' },
  { name: 'Lemongrass',       skuBase: 'EO-LGR', brand: 'Nikura',            basePrice: 28,  description: 'Cymbopogon citratus — toning, deodorising' },
  { name: 'Basil Sweet',      skuBase: 'EO-BAS', brand: 'Absolute Aromas',  basePrice: 38,  description: 'Ocimum basilicum — mental clarity, muscle spasm' },
  { name: 'Lime',             skuBase: 'EO-LIM', brand: 'Tisserand',         basePrice: 30,  description: 'Citrus aurantifolia — uplifting, immune-supportive' },
  { name: 'Mandarin',         skuBase: 'EO-MAN', brand: 'Mystic Moments',   basePrice: 36,  description: 'Citrus reticulata — gentle citrus, pregnancy-safe' },
  { name: 'Grapefruit',       skuBase: 'EO-GRF', brand: 'Absolute Aromas',  basePrice: 32,  description: 'Citrus x paradisi — uplifting, detox' },
  { name: 'Spearmint',        skuBase: 'EO-SPM', brand: 'Nikura',            basePrice: 30,  description: 'Mentha spicata — gentler than peppermint' },
  { name: 'Myrrh',            skuBase: 'EO-MYR', brand: 'Absolute Aromas',  basePrice: 82,  description: 'Commiphora myrrha — wound-healing, meditative' },
  { name: 'Helichrysum',      skuBase: 'EO-HEL', brand: 'Absolute Aromas',  basePrice: 89,  description: 'Helichrysum italicum — immortelle, skin-regenerating' },
  { name: 'Rose Absolute',    skuBase: 'EO-RSA', brand: 'Tisserand',         basePrice: 185, description: 'Rosa × damascena absolute — queen of flowers' },
  { name: 'Neroli',           skuBase: 'EO-NER', brand: 'Absolute Aromas',  basePrice: 165, description: 'Citrus aurantium blossom — anxiety, skin regeneration' },
  { name: 'Jasmine Absolute', skuBase: 'EO-JAS', brand: 'Tisserand',         basePrice: 145, description: 'Jasminum grandiflorum absolute — euphoric, sensual' },
  { name: 'Palmarosa',        skuBase: 'EO-PLM', brand: 'Mystic Moments',   basePrice: 42,  description: 'Cymbopogon martinii — skin hydration, skin infections' },
  { name: 'Fir Needle',       skuBase: 'EO-FIR', brand: 'Nikura',            basePrice: 38,  description: 'Abies sibirica — forest air, respiratory, grounding' },
  { name: 'Cardamom',         skuBase: 'EO-CAR', brand: 'Plant Therapy',     basePrice: 62,  description: 'Elettaria cardamomum — digestive, warming, exotic' },
  { name: 'Fennel Sweet',     skuBase: 'EO-FEN', brand: 'Nikura',            basePrice: 36,  description: 'Foeniculum vulgare — digestive, detoxifying' },
  { name: 'Thyme ct. Linalool',skuBase:'EO-THY', brand: 'Absolute Aromas',  basePrice: 55,  description: 'Thymus vulgaris ct. linalool — gentle antimicrobial' },
  { name: 'Cypress',          skuBase: 'EO-CYP', brand: 'Mystic Moments',   basePrice: 40,  description: 'Cupressus sempervirens — circulation, vein-toning' },
  { name: 'Marjoram Sweet',   skuBase: 'EO-MAR', brand: 'Nikura',            basePrice: 38,  description: 'Origanum majorana — muscle relaxant, hypnotic' },
];

const EO_SIZES = [
  { size: '5ml',  suffix: '005', mult: 1.0,  stock: 30 },
  { size: '10ml', suffix: '010', mult: 1.7,  stock: 45 },
  { size: '30ml', suffix: '030', mult: 4.0,  stock: 20 },
  { size: '50ml', suffix: '050', mult: 6.0,  stock: 12 },
];

// ── Carrier Oils (22 bases × 4 sizes = 88) ────────────────────────────────
const CO_BASES: Base[] = [
  { name: 'Sweet Almond',        skuBase: 'CO-SAL', brand: 'Mystic Moments',   basePrice: 25, description: 'Prunus dulcis — light, nourishing, all skin types' },
  { name: 'Jojoba',              skuBase: 'CO-JOJ', brand: 'Absolute Aromas',  basePrice: 42, description: 'Simmondsia chinensis — liquid wax, sebum-balancing' },
  { name: 'Rosehip',             skuBase: 'CO-RSH', brand: 'Tisserand',         basePrice: 55, description: 'Rosa canina — trans-retinoic acid, anti-aging' },
  { name: 'Argan',               skuBase: 'CO-ARG', brand: 'Mystic Moments',   basePrice: 65, description: 'Argania spinosa — liquid gold, restorative' },
  { name: 'Coconut Fractionated',skuBase: 'CO-FCO', brand: 'Nikura',            basePrice: 28, description: 'Cocos nucifera — light, odourless, MCT-rich' },
  { name: 'Castor',              skuBase: 'CO-CAS', brand: 'Mystic Moments',   basePrice: 22, description: 'Ricinus communis — thick, drawing, lash growth' },
  { name: 'Grapeseed',           skuBase: 'CO-GPS', brand: 'Nikura',            basePrice: 20, description: 'Vitis vinifera — light, astringent, antioxidant' },
  { name: 'Avocado',             skuBase: 'CO-AVO', brand: 'Absolute Aromas',  basePrice: 38, description: 'Persea gratissima — rich, penetrating, mature skin' },
  { name: 'Evening Primrose',    skuBase: 'CO-EPO', brand: 'Absolute Aromas',  basePrice: 58, description: 'Oenothera biennis — GLA-rich, eczema-soothing' },
  { name: 'Hemp Seed',           skuBase: 'CO-HEM', brand: 'Nikura',            basePrice: 45, description: 'Cannabis sativa — omega-3/6 balance, anti-inflammatory' },
  { name: 'Sunflower',           skuBase: 'CO-SUN', brand: 'Mystic Moments',   basePrice: 18, description: 'Helianthus annuus — light, vitamin E-rich' },
  { name: 'Olive',               skuBase: 'CO-OLV', brand: 'Absolute Aromas',  basePrice: 22, description: 'Olea europaea — rich, squalene-containing' },
  { name: 'Neem',                skuBase: 'CO-NEM', brand: 'Nikura',            basePrice: 30, description: 'Azadirachta indica — insecticidal, medicinal, strong aroma' },
  { name: 'Tamanu',              skuBase: 'CO-TAM', brand: 'Mystic Moments',   basePrice: 70, description: 'Calophyllum inophyllum — wound-healing, cicatrisant' },
  { name: 'Marula',              skuBase: 'CO-MAR', brand: 'Absolute Aromas',  basePrice: 72, description: 'Sclerocarya birrea — fast-absorbing, oleic-acid rich' },
  { name: 'Sea Buckthorn',       skuBase: 'CO-SBK', brand: 'Nikura',            basePrice: 85, description: 'Hippophae rhamnoides — intense orange, vitamin C, skin healing' },
  { name: 'Baobab',              skuBase: 'CO-BAO', brand: 'Plant Therapy',     basePrice: 68, description: 'Adansonia digitata — regenerative, long shelf life' },
  { name: 'Black Seed (Nigella)',skuBase: 'CO-BLS', brand: 'Mystic Moments',   basePrice: 55, description: 'Nigella sativa — immune, anti-inflammatory, legendary herb' },
  { name: 'Pomegranate Seed',    skuBase: 'CO-POM', brand: 'Absolute Aromas',  basePrice: 78, description: 'Punica granatum — punicic acid, anti-aging, antioxidant' },
  { name: 'Prickly Pear Seed',   skuBase: 'CO-PPR', brand: 'Essentially Oils', basePrice: 92, description: 'Opuntia ficus-indica — tocopherol-rich, luxury face oil' },
  { name: 'Moringa',             skuBase: 'CO-MOR', brand: 'Nikura',            basePrice: 60, description: 'Moringa oleifera — stable behenic acid, skin nourishing' },
  { name: 'Meadowfoam',          skuBase: 'CO-MEA', brand: 'Absolute Aromas',  basePrice: 52, description: 'Limnanthes alba — long-lasting emollient, film-forming' },
];

const CO_SIZES = [
  { size: '30ml',  suffix: '030', mult: 1.0,  stock: 30 },
  { size: '100ml', suffix: '100', mult: 2.5,  stock: 45 },
  { size: '250ml', suffix: '250', mult: 5.0,  stock: 22 },
  { size: '500ml', suffix: '500', mult: 8.5,  stock: 14 },
];

// ── Bath Salts (12 bases × 3 sizes = 36) ──────────────────────────────────
const BS_BASES: Base[] = [
  { name: 'Lavender & Chamomile', skuBase: 'BS-LAC', brand: 'Mystic Moments',  basePrice: 38, description: 'Dead Sea salts, lavender and chamomile — sleep and calm' },
  { name: 'Rose Geranium',        skuBase: 'BS-RGE', brand: 'Mystic Moments',  basePrice: 42, description: 'Himalayan pink salt, rose geranium and patchouli' },
  { name: 'Detox Charcoal',       skuBase: 'BS-DCH', brand: 'Absolute Aromas', basePrice: 45, description: 'Activated charcoal, eucalyptus and peppermint Himalayan soak' },
  { name: 'Muscle Ease Epsom',    skuBase: 'BS-MUS', brand: 'Nikura',           basePrice: 35, description: 'Magnesium sulphate, black pepper, ginger and clove' },
  { name: 'Himalayan Pink',       skuBase: 'BS-HPS', brand: 'Mystic Moments',  basePrice: 32, description: 'Coarse Himalayan pink salts with bergamot and lemon' },
  { name: 'Citrus Burst',         skuBase: 'BS-CTB', brand: 'Nikura',           basePrice: 30, description: 'Sea salt with grapefruit, orange and lemon — energising' },
  { name: 'Moroccan Rose',        skuBase: 'BS-MOR', brand: 'Absolute Aromas', basePrice: 52, description: 'Dead Sea salt, Moroccan rose absolute and argan oil' },
  { name: 'Forest Bathing',       skuBase: 'BS-FOR', brand: 'Mystic Moments',  basePrice: 40, description: 'Himalayan salt, cedarwood, fir needle and vetiver' },
  { name: 'Mindful Mint',         skuBase: 'BS-MMT', brand: 'Plant Therapy',    basePrice: 36, description: 'Epsom salt, peppermint, spearmint, green tea — invigorating' },
  { name: 'Tropical Bloom',       skuBase: 'BS-TRB', brand: 'Nikura',           basePrice: 43, description: 'Mediterranean sea salt, ylang ylang, coconut, lime' },
  { name: 'Frankincense & Myrrh', skuBase: 'BS-FRM', brand: 'Absolute Aromas', basePrice: 55, description: 'Dead Sea salt, frankincense, myrrh, sandalwood — luxury' },
  { name: 'Ginger Warming',       skuBase: 'BS-GWM', brand: 'Mystic Moments',  basePrice: 38, description: 'Epsom and sea salt, ginger, cinnamon, clove — warming soak' },
];

const BS_SIZES = [
  { size: '250g', suffix: '250', mult: 1.0, stock: 35 },
  { size: '500g', suffix: '500', mult: 1.8, stock: 25 },
  { size: '1kg',  suffix: '001', mult: 3.0, stock: 15 },
];

// ── Body Butters (12 × 3 = 36) ────────────────────────────────────────────
const BB_BASES: Base[] = [
  { name: 'Mango Shea',              skuBase: 'BB-MAS', brand: 'Mystic Moments',  basePrice: 58, description: 'Shea and mango butter, jasmine, ylang ylang' },
  { name: 'Cocoa Vanilla',           skuBase: 'BB-COV', brand: 'Absolute Aromas', basePrice: 55, description: 'Raw cocoa butter with vanilla and sweet orange' },
  { name: 'Frankincense Anti-Aging', skuBase: 'BB-FRK', brand: 'Tisserand',        basePrice: 82, description: 'Shea, baobab, frankincense and myrrh — mature skin' },
  { name: 'Lavender Calm',           skuBase: 'BB-LAC', brand: 'Absolute Aromas', basePrice: 50, description: 'Shea butter, lavender and chamomile — bedtime ritual' },
  { name: 'Citrus Energise',         skuBase: 'BB-CIE', brand: 'Mystic Moments',  basePrice: 48, description: 'Mango butter, grapefruit, sweet orange and bergamot' },
  { name: 'Hemp & Rosehip',          skuBase: 'BB-HMR', brand: 'Nikura',           basePrice: 65, description: 'Hemp seed and rosehip butter with sea buckthorn' },
  { name: 'Aloe Vera Light',         skuBase: 'BB-ALO', brand: 'Nikura',           basePrice: 44, description: 'Lightweight whipped shea with aloe vera and cucumber' },
  { name: 'Myrrh & Sandalwood',      skuBase: 'BB-MYS', brand: 'Absolute Aromas', basePrice: 78, description: 'Luxury shea with myrrh, sandalwood and patchouli' },
  { name: 'Rose & Argan',            skuBase: 'BB-RSA', brand: 'Tisserand',        basePrice: 88, description: 'Argan and shea base with Bulgarian rose — radiance' },
  { name: 'Coffee & Coconut',        skuBase: 'BB-COC', brand: 'Plant Therapy',    basePrice: 52, description: 'Coconut butter, coffee extract, vanilla — energising scrub butter' },
  { name: 'Turmeric & Ginger',       skuBase: 'BB-TUG', brand: 'Mystic Moments',  basePrice: 56, description: 'Shea base, turmeric CO2, ginger, black pepper — bright skin' },
  { name: 'Neroli & Vitamin C',      skuBase: 'BB-NVC', brand: 'Absolute Aromas', basePrice: 92, description: 'Shea, rosehip, neroli — brightening antioxidant butter' },
];

const BB_SIZES = [
  { size: '100ml', suffix: '100', mult: 1.0,  stock: 28 },
  { size: '200ml', suffix: '200', mult: 1.75, stock: 18 },
  { size: '500ml', suffix: '500', mult: 3.5,  stock: 10 },
];

// ── Massage Blends (12 × 3 = 36) ──────────────────────────────────────────
const MB_BASES: Base[] = [
  { name: 'Relaxation Deep Tissue', skuBase: 'MB-RDT', brand: 'Absolute Aromas', basePrice: 85,  description: 'Lavender, marjoram, vetiver in sweet almond — deep relaxation' },
  { name: 'Sports Recovery',        skuBase: 'MB-SPR', brand: 'Nikura',           basePrice: 78,  description: 'Black pepper, ginger, eucalyptus in jojoba — post-workout' },
  { name: 'Lymphatic Drainage',     skuBase: 'MB-LYM', brand: 'Absolute Aromas', basePrice: 95,  description: 'Juniper, grapefruit, cypress in jojoba — detox protocol' },
  { name: 'Hot Stone Formula',      skuBase: 'MB-HST', brand: 'Absolute Aromas', basePrice: 110, description: 'Basalt-stone formula — ginger, black pepper, marjoram' },
  { name: 'Prenatal Gentle',        skuBase: 'MB-PRE', brand: 'Tisserand',        basePrice: 98,  description: 'Mandarin, chamomile roman, neroli — pregnancy-safe' },
  { name: 'Anti-Cellulite',         skuBase: 'MB-ANC', brand: 'Mystic Moments',  basePrice: 88,  description: 'Grapefruit, fennel, geranium, juniper — firming massage' },
  { name: 'Headache Relief',        skuBase: 'MB-HDR', brand: 'Tisserand',        basePrice: 82,  description: 'Peppermint, lavender, basil — temple and neck massage' },
  { name: 'Sleep Restore',          skuBase: 'MB-SLP', brand: 'Absolute Aromas', basePrice: 90,  description: 'Valerian, vetiver, frankincense, chamomile — pre-sleep' },
  { name: 'Aromatherapy Facial',    skuBase: 'MB-FAC', brand: 'Tisserand',        basePrice: 105, description: 'Neroli, rose, frankincense in rosehip — luxury facial' },
  { name: 'Warming Spice',          skuBase: 'MB-WSP', brand: 'Nikura',           basePrice: 80,  description: 'Ginger, black pepper, cardamom in sesame — ayurvedic warmth' },
  { name: 'Cooling Mint',           skuBase: 'MB-CMT', brand: 'Plant Therapy',    basePrice: 72,  description: 'Peppermint, spearmint, eucalyptus in fractionated coconut' },
  { name: 'Calm & Balance',         skuBase: 'MB-CAB', brand: 'Mystic Moments',  basePrice: 88,  description: 'Bergamot, lavender, ylang ylang in sweet almond — harmony' },
];

const MB_SIZES = [
  { size: '50ml',  suffix: '050', mult: 1.0, stock: 22 },
  { size: '100ml', suffix: '100', mult: 1.8, stock: 16 },
  { size: '200ml', suffix: '200', mult: 3.0, stock: 10 },
];

// ── Diffuser Blends (12 × 3 = 36) ────────────────────────────────────────
const DB_BASES: Base[] = [
  { name: 'Productivity Focus',  skuBase: 'DB-PRF', brand: 'Tisserand',        basePrice: 42, description: 'Rosemary, basil, lemon — mental clarity' },
  { name: 'Romantic Evening',    skuBase: 'DB-ROM', brand: 'Tisserand',        basePrice: 52, description: 'Ylang ylang, sandalwood, rose — sensual warmth' },
  { name: 'Winter Spice',        skuBase: 'DB-WIN', brand: 'Tisserand',        basePrice: 48, description: 'Cinnamon, clove, orange, frankincense — festive warmth' },
  { name: 'Tropical Escape',     skuBase: 'DB-TRO', brand: 'Mystic Moments',  basePrice: 44, description: 'Ylang ylang, coconut, lime, patchouli — holiday mood' },
  { name: 'Spa Signature',       skuBase: 'DB-SPA', brand: 'Absolute Aromas', basePrice: 58, description: 'Eucalyptus, peppermint, bergamot — classic spa atmosphere' },
  { name: 'Sleep Well',          skuBase: 'DB-SLP', brand: 'Tisserand',        basePrice: 46, description: 'Lavender, cedarwood, vetiver — bedtime diffusion' },
  { name: 'Immunity Boost',      skuBase: 'DB-IMM', brand: 'Absolute Aromas', basePrice: 50, description: 'Eucalyptus, tea tree, lemon, rosemary — winter wellness' },
  { name: 'Morning Energy',      skuBase: 'DB-MOR', brand: 'Nikura',           basePrice: 38, description: 'Peppermint, grapefruit, rosemary — energising start' },
  { name: 'Arabian Nights',      skuBase: 'DB-ARN', brand: 'Mystic Moments',  basePrice: 65, description: 'Oud, rose, sandalwood, amber — exotic Middle Eastern blend' },
  { name: 'Fresh Linen',         skuBase: 'DB-FRL', brand: 'Nikura',           basePrice: 40, description: 'Neroli, lemon, white musk, bergamot — clean laundry scent' },
  { name: 'Yoga Flow',           skuBase: 'DB-YOG', brand: 'Plant Therapy',    basePrice: 48, description: 'Frankincense, myrrh, sandalwood, lavender — meditative clarity' },
  { name: 'Citrus Garden',       skuBase: 'DB-CTG', brand: 'Absolute Aromas', basePrice: 44, description: 'Lemon, lime, orange, grapefruit, bergamot — bright and fresh' },
];

const DB_SIZES = [
  { size: '5ml',  suffix: '005', mult: 1.0, stock: 40 },
  { size: '10ml', suffix: '010', mult: 1.7, stock: 30 },
  { size: '30ml', suffix: '030', mult: 4.0, stock: 18 },
];

// ── Roll-ons (12 × 3 = 36) ────────────────────────────────────────────────
const RO_BASES: Base[] = [
  { name: 'Migraine Relief',   skuBase: 'RO-MIG', brand: 'Tisserand',        basePrice: 35, description: 'Peppermint, lavender, basil in fractionated coconut' },
  { name: 'Skin Clear',        skuBase: 'RO-SKC', brand: 'Nikura',           basePrice: 32, description: 'Tea tree, lavender, frankincense — spot treatment' },
  { name: 'Tension Tamer',     skuBase: 'RO-TEN', brand: 'Absolute Aromas', basePrice: 33, description: 'Lavender, marjoram, chamomile — neck and shoulder tension' },
  { name: 'Jet Lag Relief',    skuBase: 'RO-JET', brand: 'Tisserand',        basePrice: 36, description: 'Peppermint, rosemary, grapefruit — alertness on the go' },
  { name: 'Anxiety Ease',      skuBase: 'RO-ANX', brand: 'Tisserand',        basePrice: 38, description: 'Bergamot, lavender, vetiver — pocket-sized calm' },
  { name: 'Sleep Drops',       skuBase: 'RO-SLP', brand: 'Absolute Aromas', basePrice: 34, description: 'Chamomile, cedarwood, vetiver — pulse points at bedtime' },
  { name: 'Immunity Guard',    skuBase: 'RO-IMM', brand: 'Nikura',           basePrice: 30, description: 'Eucalyptus, tea tree, lemon — roll on chest and throat' },
  { name: 'Focus Flow',        skuBase: 'RO-FOC', brand: 'Tisserand',        basePrice: 36, description: 'Rosemary, peppermint, basil — temples for concentration' },
  { name: 'Mood Lift',         skuBase: 'RO-MDL', brand: 'Plant Therapy',    basePrice: 35, description: 'Bergamot, orange, ylang ylang, frankincense — uplifting' },
  { name: 'Breathe Easy',      skuBase: 'RO-BRE', brand: 'Nikura',           basePrice: 32, description: 'Eucalyptus, peppermint, ravintsara — clear airways' },
  { name: 'Grounding Blend',   skuBase: 'RO-GRD', brand: 'Absolute Aromas', basePrice: 38, description: 'Vetiver, cedarwood, patchouli, frankincense — centred calm' },
  { name: 'Hormone Balance',   skuBase: 'RO-HRB', brand: 'Mystic Moments',  basePrice: 40, description: 'Clary sage, geranium, thyme — hormonal equilibrium' },
];

const RO_SIZES = [
  { size: '5ml',  suffix: '005', mult: 1.0,  stock: 45 },
  { size: '10ml', suffix: '010', mult: 1.65, stock: 38 },
  { size: '15ml', suffix: '015', mult: 2.2,  stock: 22 },
];

// ── Balms & Salves (12 × 3 = 36) ─────────────────────────────────────────
const BL_BASES: Base[] = [
  { name: 'Arnica Muscle',    skuBase: 'BL-ARM', brand: 'Nikura',           basePrice: 55, description: 'Arnica infused beeswax — bruising, sprains, muscle aches' },
  { name: 'Calendula Healing',skuBase: 'BL-CAL', brand: 'Absolute Aromas', basePrice: 48, description: 'Organic calendula and chamomile beeswax — dry cracked skin' },
  { name: 'Eczema Soothe',    skuBase: 'BL-ECZ', brand: 'Tisserand',        basePrice: 62, description: 'Oat extract, chamomile, lavender — sensitive reactive skin' },
  { name: 'Lip Repair',       skuBase: 'BL-LIP', brand: 'Nikura',           basePrice: 28, description: 'Beeswax, shea, vitamin E, peppermint — intensive lip conditioning' },
  { name: 'Cuticle Nourish',  skuBase: 'BL-CUT', brand: 'Mystic Moments',  basePrice: 32, description: 'Jojoba, lemon, myrrh — softening nail cuticle balm' },
  { name: 'Joint Ease',       skuBase: 'BL-JNT', brand: 'Absolute Aromas', basePrice: 68, description: 'Frankincense, ginger, black pepper, turmeric — joint comfort' },
  { name: 'Scar Fade',        skuBase: 'BL-SCR', brand: 'Tisserand',        basePrice: 78, description: 'Rosehip, tamanu, helichrysum — scar tissue fading balm' },
  { name: 'Nappy Rash',       skuBase: 'BL-NAP', brand: 'Absolute Aromas', basePrice: 38, description: 'Zinc, calendula, chamomile — gentle baby protective balm' },
  { name: 'Cold & Sinus',     skuBase: 'BL-CLD', brand: 'Plant Therapy',    basePrice: 42, description: 'Eucalyptus, peppermint, camphor — chest and sinus rub' },
  { name: 'Sun After Care',   skuBase: 'BL-SUN', brand: 'Nikura',           basePrice: 50, description: 'Aloe, chamomile, lavender, peppermint — after-sun soothing' },
  { name: 'Foot Rescue',      skuBase: 'BL-FOT', brand: 'Mystic Moments',  basePrice: 45, description: 'Peppermint, tea tree, urea — cracked heel treatment' },
  { name: 'Beard Butter',     skuBase: 'BL-BRD', brand: 'Absolute Aromas', basePrice: 55, description: 'Shea, argan, sandalwood, cedarwood — beard nourishing balm' },
];

const BL_SIZES = [
  { size: '30ml',  suffix: '030', mult: 1.0, stock: 32 },
  { size: '60ml',  suffix: '060', mult: 1.7, stock: 22 },
  { size: '100ml', suffix: '100', mult: 2.5, stock: 15 },
];

// ── Hydrosols (12 × 3 = 36) ──────────────────────────────────────────────
const HY_BASES: Base[] = [
  { name: 'Rose',            skuBase: 'HY-ROS', brand: 'Nikura',           basePrice: 32, description: 'Rosa damascena distillate — toning, hydrating facial mist' },
  { name: 'Frankincense',    skuBase: 'HY-FRK', brand: 'Nikura',           basePrice: 40, description: 'Boswellia carterii distillate — anti-aging facial mist' },
  { name: 'Lavender',        skuBase: 'HY-LAV', brand: 'Absolute Aromas', basePrice: 28, description: 'Lavandula angustifolia distillate — soothing all-purpose mist' },
  { name: 'Chamomile',       skuBase: 'HY-CHM', brand: 'Mystic Moments',  basePrice: 35, description: 'Anthemis nobilis distillate — anti-inflammatory, sensitive skin' },
  { name: 'Peppermint',      skuBase: 'HY-PEP', brand: 'Nikura',           basePrice: 26, description: 'Mentha x piperita distillate — cooling, refreshing body mist' },
  { name: 'Neroli',          skuBase: 'HY-NER', brand: 'Absolute Aromas', basePrice: 55, description: 'Citrus aurantium blossom distillate — luxury facial toner' },
  { name: 'Geranium',        skuBase: 'HY-GER', brand: 'Tisserand',        basePrice: 38, description: 'Pelargonium graveolens distillate — balancing toner' },
  { name: 'Witch Hazel',     skuBase: 'HY-WCH', brand: 'Plant Therapy',    basePrice: 22, description: 'Hamamelis virginiana — astringent, pore-tightening facial mist' },
  { name: 'Helichrysum',     skuBase: 'HY-HEL', brand: 'Essentially Oils', basePrice: 48, description: 'Helichrysum italicum distillate — skin regenerating, bruise-healing' },
  { name: 'Clary Sage',      skuBase: 'HY-CLS', brand: 'Mystic Moments',  basePrice: 30, description: 'Salvia sclarea distillate — clarifying oily skin toner' },
  { name: 'Tea Tree',        skuBase: 'HY-TEA', brand: 'Nikura',           basePrice: 25, description: 'Melaleuca alternifolia distillate — acne and blemish spray' },
  { name: 'Lemon Verbena',   skuBase: 'HY-LVB', brand: 'Absolute Aromas', basePrice: 42, description: 'Aloysia citrodora distillate — brightening, antioxidant mist' },
];

const HY_SIZES = [
  { size: '100ml', suffix: '100', mult: 1.0, stock: 32 },
  { size: '200ml', suffix: '200', mult: 1.8, stock: 22 },
  { size: '500ml', suffix: '500', mult: 3.5, stock: 12 },
];

// ── Supplements (35 individual) ───────────────────────────────────────────
const SUPPLEMENTS = [
  { name: 'Evening Primrose Oil Capsules 90s', sku: 'SUP-EPO-090', up: 95,  cp: 45, stock: 28, desc: 'GLA-rich EPO — hormonal balance, skin health', unit: 'Bottle', size: '90 caps' },
  { name: 'Black Seed Oil Capsules 60s',       sku: 'SUP-BSO-060', up: 88,  cp: 42, stock: 22, desc: 'Nigella sativa — immune, anti-inflammatory', unit: 'Bottle', size: '60 caps' },
  { name: 'Ashwagandha Extract Capsules 60s',  sku: 'SUP-ASH-060', up: 92,  cp: 44, stock: 24, desc: 'KSM-66 — adaptogen, stress and cortisol balance', unit: 'Bottle', size: '60 caps' },
  { name: 'Omega-3 Fish Oil Capsules 90s',     sku: 'SUP-OMG-090', up: 78,  cp: 36, stock: 30, desc: 'EPA and DHA — heart, brain, anti-inflammatory', unit: 'Bottle', size: '90 caps' },
  { name: 'Magnesium Glycinate 60s',           sku: 'SUP-MAG-060', up: 85,  cp: 40, stock: 20, desc: 'High-absorption magnesium — sleep, muscle, mood', unit: 'Bottle', size: '60 caps' },
  { name: 'Turmeric & Black Pepper Capsules 90s', sku: 'SUP-TUR-090', up: 82, cp: 38, stock: 25, desc: 'Curcumin 95%, piperine — anti-inflammatory, joint health', unit: 'Bottle', size: '90 caps' },
  { name: 'Vitamin D3 + K2 Drops 30ml',        sku: 'SUP-VDK-030', up: 72,  cp: 34, stock: 28, desc: 'Vitamin D3 2000IU with K2 MK-7 — bone, immune support', unit: 'Bottle', size: '30ml' },
  { name: 'Zinc Picolinate 60s',               sku: 'SUP-ZNC-060', up: 62,  cp: 28, stock: 22, desc: 'Chelated zinc — immune, skin, wound healing', unit: 'Bottle', size: '60 caps' },
  { name: 'Probiotics 50 Billion 30s',         sku: 'SUP-PRO-030', up: 128, cp: 60, stock: 18, desc: '12 strains 50 billion CFU — gut health, immunity', unit: 'Bottle', size: '30 caps' },
  { name: 'Collagen Peptides Powder 250g',     sku: 'SUP-COL-250', up: 145, cp: 68, stock: 15, desc: 'Hydrolysed bovine collagen type I & III — skin, joints', unit: 'Bag', size: '250g' },
  { name: 'Melatonin 5mg 60 Tablets',          sku: 'SUP-MEL-060', up: 58,  cp: 26, stock: 30, desc: 'Melatonin 5mg — sleep onset, jet lag, circadian rhythm', unit: 'Bottle', size: '60 tabs' },
  { name: 'Vitamin C with Rose Hip 90s',       sku: 'SUP-VTC-090', up: 68,  cp: 30, stock: 28, desc: '1000mg vitamin C + rose hip bioflavonoids — antioxidant', unit: 'Bottle', size: '90 tabs' },
  { name: 'Valerian Root Extract 60s',         sku: 'SUP-VAL-060', up: 75,  cp: 35, stock: 20, desc: 'Valeriana officinalis — natural sleep aid, anxiety', unit: 'Bottle', size: '60 caps' },
  { name: 'Milk Thistle 80% Silymarin 60s',    sku: 'SUP-MLT-060', up: 72,  cp: 34, stock: 22, desc: 'Silybum marianum — liver detox, hepatoprotective', unit: 'Bottle', size: '60 caps' },
  { name: 'Spirulina Powder 200g',             sku: 'SUP-SPI-200', up: 88,  cp: 40, stock: 18, desc: 'Arthrospira platensis — protein, B12, iron, antioxidant', unit: 'Bag', size: '200g' },
  { name: 'Moringa Leaf Powder 150g',          sku: 'SUP-MOR-150', up: 65,  cp: 30, stock: 22, desc: 'Moringa oleifera — multivitamin tree, iron, calcium', unit: 'Bag', size: '150g' },
  { name: 'Maca Root Powder 200g',             sku: 'SUP-MAC-200', up: 78,  cp: 36, stock: 20, desc: 'Lepidium meyenii — energy, libido, hormonal balance', unit: 'Bag', size: '200g' },
  { name: 'Berberine HCl 500mg 60s',           sku: 'SUP-BRB-060', up: 115, cp: 54, stock: 15, desc: 'Berberine hydrochloride — blood sugar, metabolic health', unit: 'Bottle', size: '60 caps' },
  { name: 'Ginkgo Biloba 120mg 60s',           sku: 'SUP-GNK-060', up: 68,  cp: 32, stock: 22, desc: 'Ginkgo biloba 24% flavone glycosides — memory, circulation', unit: 'Bottle', size: '60 caps' },
  { name: 'Echinacea & Elderberry Syrup 200ml',sku: 'SUP-ECH-200', up: 92,  cp: 42, stock: 18, desc: 'Echinacea purpurea, Sambucus nigra — immune boost syrup', unit: 'Bottle', size: '200ml' },
  { name: 'Hawthorn Berry Extract 60s',        sku: 'SUP-HAW-060', up: 72,  cp: 34, stock: 20, desc: 'Crataegus oxyacantha — heart tonic, blood pressure', unit: 'Bottle', size: '60 caps' },
  { name: 'NAC N-Acetyl Cysteine 600mg 60s',   sku: 'SUP-NAC-060', up: 98,  cp: 45, stock: 18, desc: 'N-Acetyl L-Cysteine — glutathione precursor, lung health', unit: 'Bottle', size: '60 caps' },
  { name: 'Coenzyme Q10 100mg 60s',            sku: 'SUP-Q10-060', up: 115, cp: 52, stock: 15, desc: 'Ubiquinol CoQ10 — cellular energy, heart health, antioxidant', unit: 'Bottle', size: '60 caps' },
  { name: 'Rhodiola Rosea 500mg 60s',          sku: 'SUP-RHO-060', up: 88,  cp: 42, stock: 20, desc: 'Rhodiola rosea 3% rosavins — stress adaptogen, fatigue fighter', unit: 'Bottle', size: '60 caps' },
  { name: 'Black Cohosh 40mg 60s',             sku: 'SUP-BCO-060', up: 82,  cp: 38, stock: 18, desc: 'Actaea racemosa — menopause symptoms, hormonal support', unit: 'Bottle', size: '60 caps' },
  { name: 'Saw Palmetto 320mg 60s',            sku: 'SUP-SAW-060', up: 92,  cp: 44, stock: 18, desc: 'Serenoa repens — prostate health, DHT inhibitor', unit: 'Bottle', size: '60 caps' },
  { name: 'Iron Bisglycinate 14mg 60s',        sku: 'SUP-IRN-060', up: 58,  cp: 26, stock: 25, desc: 'Gentle chelated iron — anaemia, fatigue in women', unit: 'Bottle', size: '60 caps' },
  { name: 'Lion\'s Mane Mushroom 500mg 60s',   sku: 'SUP-LMN-060', up: 125, cp: 58, stock: 15, desc: 'Hericium erinaceus — nerve growth factor, cognitive boost', unit: 'Bottle', size: '60 caps' },
  { name: 'Reishi Mushroom Extract 500mg 60s', sku: 'SUP-RSH-060', up: 118, cp: 55, stock: 15, desc: 'Ganoderma lucidum — immune modulator, adaptogen, sleep', unit: 'Bottle', size: '60 caps' },
  { name: 'Aloe Vera Juice 1L',                sku: 'SUP-ALO-001', up: 68,  cp: 30, stock: 25, desc: 'Inner fillet aloe vera — gut health, immune, skin from inside', unit: 'Bottle', size: '1L' },
  { name: 'Apple Cider Vinegar Capsules 90s',  sku: 'SUP-ACV-090', up: 72,  cp: 33, stock: 22, desc: 'ACV 750mg with mother — blood sugar, weight management', unit: 'Bottle', size: '90 caps' },
  { name: 'Glutathione 500mg 60s',             sku: 'SUP-GLU-060', up: 142, cp: 65, stock: 14, desc: 'Reduced L-glutathione — master antioxidant, liver, skin lightening', unit: 'Bottle', size: '60 caps' },
  { name: 'Saffron Extract 30mg 60s',          sku: 'SUP-SAF-060', up: 158, cp: 72, stock: 12, desc: 'Crocus sativus Affron — mood, PMS, eye health', unit: 'Bottle', size: '60 caps' },
  { name: 'Bone Broth Powder 300g',            sku: 'SUP-BBR-300', up: 115, cp: 52, stock: 16, desc: 'Grass-fed bovine bone broth — collagen, gut healing, joints', unit: 'Bag', size: '300g' },
  { name: 'Hyaluronic Acid 200mg 60s',         sku: 'SUP-HYA-060', up: 95,  cp: 44, stock: 18, desc: 'Sodium hyaluronate — joint lubrication, skin hydration', unit: 'Bottle', size: '60 caps' },
];

// ── Electronics (30 individual) ───────────────────────────────────────────
const ELECTRONICS = [
  { name: 'Ultrasonic Diffuser 200ml White',    sku: 'ELC-UDW-200', up: 195,  cp: 95,  stock: 18, desc: '200ml ultrasonic diffuser — USB, LED mood light', unit: 'Unit', size: '200ml' },
  { name: 'Nebulising Diffuser Beech Wood',     sku: 'ELC-NBZ-BWD', up: 420,  cp: 210, stock: 8,  desc: 'Cold-air nebuliser — no heat, no water, max benefit', unit: 'Unit' },
  { name: 'Car Diffuser USB Vent Clip',         sku: 'ELC-CAR-USB', up: 85,   cp: 40,  stock: 30, desc: 'USB-C car diffuser — 10ml reservoir, auto shut-off', unit: 'Unit' },
  { name: 'Ultrasonic Diffuser 500ml Rose Gold',sku: 'ELC-UDR-500', up: 285,  cp: 140, stock: 12, desc: '500ml premium ultrasonic diffuser — 10 colour LED, timer', unit: 'Unit', size: '500ml' },
  { name: 'Aromatherapy Inhaler Blanks 10-pack',sku: 'ELC-INH-010', up: 55,   cp: 25,  stock: 45, desc: 'Empty personal aromatherapy inhalers with wicks — 10 per pack', unit: 'Pack' },
  { name: 'Ultrasonic Diffuser 100ml Black',    sku: 'ELC-UDB-100', up: 145,  cp: 68,  stock: 22, desc: '100ml compact diffuser — 7-colour LED, whisper quiet', unit: 'Unit', size: '100ml' },
  { name: 'Ultrasonic Diffuser 300ml Ceramic',  sku: 'ELC-UDC-300', up: 245,  cp: 120, stock: 10, desc: '300ml handcrafted ceramic diffuser — natural stone effect', unit: 'Unit', size: '300ml' },
  { name: 'Reed Diffuser Gift Set 200ml',       sku: 'ELC-RDG-200', up: 135,  cp: 62,  stock: 20, desc: 'Reed diffuser with 8 rattan sticks — 200ml fragrance base included', unit: 'Set', size: '200ml' },
  { name: 'Wax Melt Burner Electric',           sku: 'ELC-WME-001', up: 165,  cp: 78,  stock: 15, desc: 'Low-wattage ceramic electric wax melt warmer — touch control', unit: 'Unit' },
  { name: 'Himalayan Salt Lamp Medium 1-2kg',   sku: 'ELC-SLM-002', up: 125,  cp: 58,  stock: 18, desc: 'Natural Himalayan salt lamp — ambient light, ionising', unit: 'Unit', size: '1-2kg' },
  { name: 'Himalayan Salt Lamp Large 3-5kg',    sku: 'ELC-SLL-004', up: 195,  cp: 90,  stock: 10, desc: 'Large natural Himalayan salt lamp — statement piece', unit: 'Unit', size: '3-5kg' },
  { name: 'Essential Oil Warmer Candle Tealight',sku: 'ELC-EWC-001', up: 65,  cp: 28,  stock: 35, desc: 'Ceramic essential oil burner — uses tealight candle', unit: 'Unit' },
  { name: 'Digital Aroma Diffuser Humidifier 1L',sku:'ELC-DHU-001', up: 345,  cp: 168, stock: 8,  desc: '1L ultrasonic humidifier with EO tray — large room coverage', unit: 'Unit', size: '1L' },
  { name: 'Portable USB Diffuser Mist Humidifier',sku:'ELC-USB-HUM',up: 98,   cp: 45,  stock: 28, desc: 'Mini USB-powered personal humidifier — desk or travel use', unit: 'Unit' },
  { name: 'Essential Oil Roller Bottle Filling Kit',sku:'ELC-RBF-KIT',up: 78, cp: 35,  stock: 20, desc: 'Roller bottle filling station, funnel, pipette, stirrer set', unit: 'Kit' },
  { name: 'Digital Kitchen Scale 0.1g Accuracy', sku: 'ELC-SCL-001', up: 88,  cp: 40,  stock: 25, desc: '0.01g precision digital scale — batch blending, formulation', unit: 'Unit' },
  { name: 'Hot/Cold Mist Diffuser 400ml',       sku: 'ELC-HCD-400', up: 265,  cp: 128, stock: 10, desc: '400ml dual cold/warm mist diffuser — timer, auto shut-off', unit: 'Unit', size: '400ml' },
  { name: 'Nebuliser Diffuser Glass Top',       sku: 'ELC-NBG-001', up: 385,  cp: 188, stock: 6,  desc: 'Borosilicate glass nebuliser head — cold diffusion, no water', unit: 'Unit' },
  { name: 'Aromatherapy Necklace Locket Steel', sku: 'ELC-NKL-STL', up: 75,   cp: 32,  stock: 30, desc: 'Stainless steel locket with felt pad — personal aromatherapy', unit: 'Unit' },
  { name: 'Aromatherapy Bracelet Lava Stone',   sku: 'ELC-BRC-LAV', up: 65,   cp: 28,  stock: 35, desc: 'Lava bead bracelet — natural porous stone absorbs EOs', unit: 'Unit' },
  { name: 'Ultrasonic Cleaning Machine 600ml',  sku: 'ELC-UCL-600', up: 225,  cp: 108, stock: 8,  desc: 'Ultrasonic cleaner — glass vials, diffuser parts, jewelry', unit: 'Unit', size: '600ml' },
  { name: 'pH Meter Digital',                   sku: 'ELC-PHM-001', up: 145,  cp: 68,  stock: 12, desc: 'Digital pH pen — formulation, water quality, cosmetics testing', unit: 'Unit' },
  { name: 'Infrared Thermometer Gun',           sku: 'ELC-IRT-001', up: 95,   cp: 42,  stock: 18, desc: 'Non-contact temperature — safe wax and butter blending temp', unit: 'Unit' },
  { name: 'Refractometer for Oils',             sku: 'ELC-REF-001', up: 165,  cp: 78,  stock: 10, desc: 'Optical refractometer — oil authenticity and adulteration testing', unit: 'Unit' },
  { name: 'Stainless Steel Mixing Tank 10L',    sku: 'ELC-MIX-010', up: 295,  cp: 142, stock: 6,  desc: 'Food-grade SS mixing vessel with tap — batch production', unit: 'Unit', size: '10L' },
  { name: 'Label Printer Thermal 4x6',          sku: 'ELC-LBP-001', up: 328,  cp: 158, stock: 6,  desc: 'Thermal label printer — product labels, shipping labels, barcodes', unit: 'Unit' },
  { name: 'Smart Wi-Fi Diffuser App Control',   sku: 'ELC-WFD-001', up: 358,  cp: 172, stock: 8,  desc: '400ml smart diffuser — schedule via app, Alexa/Google compatible', unit: 'Unit', size: '400ml' },
  { name: 'Portable Blending Immersion Stick',  sku: 'ELC-IMS-001', up: 225,  cp: 108, stock: 10, desc: 'Hand blender 800W — emulsions, creams, lotions, soap batter', unit: 'Unit' },
  { name: 'Barcode Scanner Wireless',           sku: 'ELC-BCR-001', up: 185,  cp: 88,  stock: 8,  desc: 'Wireless 2.4G barcode scanner — inventory management', unit: 'Unit' },
  { name: 'Magnifying Lamp 5x Daylight',        sku: 'ELC-MAG-001', up: 248,  cp: 118, stock: 6,  desc: '5-dioptre daylight magnifier lamp — formulation, label reading', unit: 'Unit' },
];

// ── Stationery (35 individual) ────────────────────────────────────────────
const STATIONERY = [
  { name: 'Amber Glass Roller Bottles 10ml 12-pack',  sku: 'STA-RLB-010', up: 45,  cp: 20,  stock: 55, desc: 'Amber glass roll-on with steel ball — 12 per pack', unit: 'Pack' },
  { name: 'Dark Blue Dropper Bottles 30ml 6-pack',    sku: 'STA-DDB-030', up: 38,  cp: 17,  stock: 42, desc: 'Blue glass dropper bottles with pipette — 6 per pack', unit: 'Pack' },
  { name: 'Fragrance Labels Handwritten Style 100s',  sku: 'STA-LBL-HWS', up: 28,  cp: 12,  stock: 65, desc: 'Pre-printed handwriting-style product labels — 100 per pack', unit: 'Pack' },
  { name: 'Essential Oil Record Book A5',             sku: 'STA-BKA5-EOR', up: 32,  cp: 14,  stock: 28, desc: 'A5 blending journal with pre-formatted log pages', unit: 'Unit' },
  { name: 'Bamboo Blending Spatula Set 5-piece',      sku: 'STA-SPA-BMS', up: 22,  cp: 9,   stock: 38, desc: 'Bamboo spatulas for measuring and blending — 5 sizes', unit: 'Set' },
  { name: 'Amber Glass Dropper Bottles 5ml 24-pack',  sku: 'STA-ADB-005', up: 42,  cp: 18,  stock: 50, desc: 'Miniature amber glass dropper bottles — 24 per pack', unit: 'Pack' },
  { name: 'Amber Glass Dropper Bottles 100ml 6-pack', sku: 'STA-ADB-100', up: 52,  cp: 24,  stock: 35, desc: '100ml amber glass with Eurotrip dropper — 6 per pack', unit: 'Pack' },
  { name: 'Kraft Paper Product Tags 200s',            sku: 'STA-TAG-200', up: 22,  cp: 10,  stock: 55, desc: 'Recycled kraft paper hang tags with twine — 200 per pack', unit: 'Pack' },
  { name: 'Waterproof Product Labels A4 Sheet 10s',   sku: 'STA-LBL-WPR', up: 35,  cp: 16,  stock: 42, desc: 'Clear waterproof inkjet labels — 10 A4 sheets, 65 per sheet', unit: 'Pack' },
  { name: 'Measuring Cylinders Glass Set 4-piece',    sku: 'STA-CYL-SET', up: 68,  cp: 30,  stock: 18, desc: 'Borosilicate glass graduated cylinders — 10/25/50/100ml', unit: 'Set' },
  { name: 'Beakers Borosilicate Glass 250ml 3-pack',  sku: 'STA-BKR-250', up: 55,  cp: 24,  stock: 20, desc: 'Lab-grade glass beakers — blending, melting waxes', unit: 'Pack' },
  { name: 'pH Test Strips 0-14 100s',                 sku: 'STA-PHS-100', up: 28,  cp: 12,  stock: 45, desc: 'Universal pH test strips — cosmetic formulation testing', unit: 'Pack' },
  { name: 'Safety Labels GHS/CLP 50s',                sku: 'STA-GHS-050', up: 25,  cp: 11,  stock: 55, desc: 'GHS compliant safety and hazard labels — 50 per pack', unit: 'Pack' },
  { name: 'Batch Record Forms A4 Pad 50s',            sku: 'STA-BRF-050', up: 32,  cp: 14,  stock: 30, desc: 'Cosmetic batch record pads — GMP compliant documentation', unit: 'Pad' },
  { name: 'Disposable Pipettes 3ml 50-pack',          sku: 'STA-PIP-050', up: 18,  cp: 7,   stock: 65, desc: 'Graduated disposable plastic pipettes — 50 per pack', unit: 'Pack' },
  { name: 'Mini Funnels Stainless Steel Set 3-piece', sku: 'STA-FNL-SET', up: 35,  cp: 15,  stock: 28, desc: 'SS funnels for filling bottles — 3 sizes set', unit: 'Set' },
  { name: 'Stretch Film Packaging Roll 300m',         sku: 'STA-STR-300', up: 42,  cp: 18,  stock: 18, desc: 'Machine stretch wrap — pallet and product wrapping', unit: 'Roll' },
  { name: 'Tissue Paper Sheets Unbleached 100s',      sku: 'STA-TSS-100', up: 25,  cp: 11,  stock: 45, desc: 'Unbleached natural tissue paper — gift wrapping', unit: 'Pack' },
  { name: 'Shrink Wrap Bands 50ml Bottles 50s',       sku: 'STA-SHB-050', up: 28,  cp: 12,  stock: 40, desc: 'Heat shrink PVC tamper-evident bands — 50ml bottles, 50 per pack', unit: 'Pack' },
  { name: 'Bubble Wrap Roll 50m',                     sku: 'STA-BUB-050', up: 48,  cp: 21,  stock: 15, desc: '500mm wide bubble wrap — 10mm bubbles, fragile items protection', unit: 'Roll' },
  { name: 'Corrugated Mailer Boxes Assorted 25-pack', sku: 'STA-BXA-025', up: 72,  cp: 32,  stock: 20, desc: 'Corrugated cardboard mailers — A4/A5/A6 sizes, 25 per pack', unit: 'Pack' },
  { name: 'Sticky Labels Round 40mm 240s',            sku: 'STA-LBL-RND', up: 22,  cp: 9,   stock: 55, desc: 'White round sticky labels — 40mm diameter, 240 per pack', unit: 'Pack' },
  { name: 'Nitrile Gloves Powder-Free M 100s',        sku: 'STA-GLV-M',   up: 48,  cp: 20,  stock: 35, desc: 'Black nitrile gloves medium — formulation and blending safety', unit: 'Box' },
  { name: 'Nitrile Gloves Powder-Free L 100s',        sku: 'STA-GLV-L',   up: 48,  cp: 20,  stock: 30, desc: 'Black nitrile gloves large — formulation and blending safety', unit: 'Box' },
  { name: 'Safety Goggles Anti-Fog',                  sku: 'STA-GOG-001', up: 28,  cp: 12,  stock: 25, desc: 'Anti-fog clear safety goggles — chemical and ingredient handling', unit: 'Unit' },
  { name: 'Nose/Mouth Masks FFP2 10-pack',            sku: 'STA-MSK-010', up: 35,  cp: 15,  stock: 30, desc: 'FFP2 particle filtering masks — fragrance and powder blending', unit: 'Pack' },
  { name: 'Clear PVC Zip Bags 100ml 50s',             sku: 'STA-ZIP-100', up: 22,  cp: 9,   stock: 45, desc: 'Clear zip-lock bags — 100ml size, 50 per pack', unit: 'Pack' },
  { name: 'Sealing Wax Sticks Neutral 12-pack',       sku: 'STA-SWX-012', up: 35,  cp: 15,  stock: 28, desc: 'Neutral colour sealing wax sticks — luxury packaging', unit: 'Pack' },
  { name: 'Ribbon Satin Assorted 25m',                sku: 'STA-RIB-025', up: 32,  cp: 14,  stock: 25, desc: 'Assorted satin ribbon — gift packaging and product presentation', unit: 'Roll' },
  { name: 'Amber PET Wide-Mouth Jars 120ml 12-pack',  sku: 'STA-JAR-120', up: 55,  cp: 24,  stock: 32, desc: 'Amber PET plastic jars with lids — scrubs, butters, balms', unit: 'Pack' },
  { name: 'Airless Pump Bottles 30ml 10-pack',        sku: 'STA-APB-030', up: 72,  cp: 32,  stock: 22, desc: 'Airless dispenser pump bottles — serums, lightweight creams', unit: 'Pack' },
  { name: 'White HDPE Bottles 500ml 6-pack',          sku: 'STA-HDP-500', up: 45,  cp: 20,  stock: 28, desc: 'HDPE 500ml bottles with flip cap — carrier oils, liquid soap', unit: 'Pack' },
  { name: 'Bulk Order Book A4 Duplicate 50s',         sku: 'STA-ORD-050', up: 38,  cp: 16,  stock: 25, desc: 'Carbon copy order books — manual ordering and receipts', unit: 'Book' },
  { name: 'Thermal Receipt Paper Rolls 80mm 10-pack', sku: 'STA-RPR-010', up: 35,  cp: 15,  stock: 30, desc: '80mm thermal receipt paper — POS printer compatible, 10 per pack', unit: 'Pack' },
  { name: 'Inventory Count Sheet Pads 50s',           sku: 'STA-INV-050', up: 28,  cp: 12,  stock: 30, desc: 'Pre-printed stock count sheets — manual inventory management', unit: 'Pad' },
];

// ─── Build full product list and assign currencies ─────────────────────────

interface ProductRow {
  name: string; sku: string; category: string; brand: string;
  unitPrice: number; costPrice: number; costPriceCurrency: Currency;
  unit: string; size?: string; description: string; stock: number;
}

function buildProducts(): ProductRow[] {
  const rows: ProductRow[] = [];

  const push = (r: Omit<ProductRow, 'costPriceCurrency'>): void => {
    const currency = assignCurrency(rows.length);
    rows.push({ ...r, costPriceCurrency: currency, costPrice: costInCurrency(r.unitPrice, currency) });
  };

  for (const b of EO_BASES) {
    for (const s of EO_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Essential Oil ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Essential Oils', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of CO_BASES) {
    for (const s of CO_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Oil ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Carrier Oils', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of BS_BASES) {
    for (const s of BS_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Bath Salts ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Bath Salts', brand: b.brand, unitPrice: up, costPrice: 0, unit: s.size.endsWith('kg') ? 'Bag' : 'Jar', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of BB_BASES) {
    for (const s of BB_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Body Butter ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Body Butters', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Jar', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of MB_BASES) {
    for (const s of MB_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Massage Blend ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Massage Blends', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of DB_BASES) {
    for (const s of DB_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Diffuser Blend ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Diffuser Blends', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of RO_BASES) {
    for (const s of RO_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Roll-on ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Roll-ons', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of BL_BASES) {
    for (const s of BL_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Balm ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Balms & Salves', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Tin', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const b of HY_BASES) {
    for (const s of HY_SIZES) {
      const up = Math.round(b.basePrice * s.mult);
      push({ name: `${b.name} Hydrosol ${s.size}`, sku: `${b.skuBase}-${s.suffix}`, category: 'Hydrosols', brand: b.brand, unitPrice: up, costPrice: 0, unit: 'Bottle', size: s.size, description: b.description, stock: s.stock });
    }
  }
  for (const p of SUPPLEMENTS) {
    push({ name: p.name, sku: p.sku, category: 'Supplements', brand: 'Nikura', unitPrice: p.up, costPrice: p.cp, unit: p.unit, size: p.size, description: p.desc, stock: p.stock });
  }
  for (const p of ELECTRONICS) {
    push({ name: p.name, sku: p.sku, category: 'Electronics', brand: 'Tisserand', unitPrice: p.up, costPrice: p.cp, unit: p.unit, size: p.size, description: p.desc, stock: p.stock });
  }
  for (const p of STATIONERY) {
    push({ name: p.name, sku: p.sku, category: 'Stationery', brand: 'Mystic Moments', unitPrice: p.up, costPrice: p.cp, unit: p.unit, description: p.desc, stock: p.stock });
  }

  return rows;
}

async function seedProducts(cookie: string, brandMap: Record<string, number>) {
  console.log('\n── Creating products ──────────────────────────────────────');
  const r = await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } });
  const existingRaw = await r.json() as unknown;
  const existingArr: Array<{ id: number; sku: string; costPriceCurrency?: string }> =
    Array.isArray(existingRaw) ? existingRaw as Array<{ id: number; sku: string; costPriceCurrency?: string }> :
    ((existingRaw as { products?: Array<{ id: number; sku: string; costPriceCurrency?: string }> }).products ?? []);
  const existingMap = new Map(existingArr.map((p) => [p.sku, p]));

  const products = buildProducts();
  console.log(`  Generated ${products.length} product definitions`);

  const fallbackBrandId = Object.values(brandMap)[0];

  let created = 0, updated = 0, skipped = 0, failed = 0;
  const currencyCounts: Record<string, number> = { GBP: 0, USD: 0, INR: 0, AED: 0 };

  for (const prod of products) {
    const brandId = brandMap[prod.brand] ?? fallbackBrandId;
    if (!brandId) { console.warn(`  ⚠ No brand ID for: ${prod.brand}`); failed++; continue; }

    const payload = {
      name: prod.name,
      sku: prod.sku,
      category: prod.category,
      unitPrice: prod.unitPrice.toFixed(2),
      costPrice: prod.costPrice.toFixed(2),
      costPriceCurrency: prod.costPriceCurrency,
      vatRate: '0.05',
      unit: prod.unit,
      size: prod.size ?? null,
      description: prod.description,
      brandId,
      stockQuantity: prod.stock,
      minStockLevel: Math.max(2, Math.floor(prod.stock * 0.15)),
    };

    const existing = existingMap.get(prod.sku);
    if (existing) {
      if (existing.costPriceCurrency !== prod.costPriceCurrency) {
        const { status } = await apiFetch('PUT', `/api/products/${existing.id}`, payload, cookie);
        if (status === 200) {
          updated++;
          currencyCounts[prod.costPriceCurrency] = (currencyCounts[prod.costPriceCurrency] ?? 0) + 1;
        } else {
          console.error(`  ✗ Update failed: ${prod.sku}`);
          failed++;
        }
      } else {
        skipped++;
        currencyCounts[prod.costPriceCurrency] = (currencyCounts[prod.costPriceCurrency] ?? 0) + 1;
      }
    } else {
      const resp = await fetch(`${BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(payload),
      });
      if (resp.status === 201) {
        created++;
        currencyCounts[prod.costPriceCurrency] = (currencyCounts[prod.costPriceCurrency] ?? 0) + 1;
        process.stdout.write(`  ✓ [${prod.costPriceCurrency}] ${prod.sku}\n`);
      } else {
        failed++;
        const err = await resp.json();
        console.error(`  ✗ ${prod.sku}: ${JSON.stringify(err).substring(0, 100)}`);
      }
    }
  }

  console.log(`\n  Products created: ${created}, updated: ${updated}`);
  console.log(`  Skipped (correct): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Currency breakdown (this run): GBP=${currencyCounts.GBP} USD=${currencyCounts.USD} INR=${currencyCounts.INR} AED=${currencyCounts.AED}`);
}

async function verifySeedResults(cookie: string) {
  console.log('\n── Post-seed verification ─────────────────────────────────');
  const r = await fetch(`${BASE_URL}/api/products`, { headers: { Cookie: cookie } });
  const raw = await r.json() as unknown;
  const all: Array<{ costPriceCurrency?: string }> =
    Array.isArray(raw) ? raw as Array<{ costPriceCurrency?: string }> :
    ((raw as { products?: Array<{ costPriceCurrency?: string }> }).products ?? []);

  const totals: Record<string, number> = { GBP: 0, USD: 0, INR: 0, AED: 0 };
  for (const p of all) { const c = p.costPriceCurrency ?? 'AED'; totals[c] = (totals[c] ?? 0) + 1; }

  const total = all.length;
  const minRequired = 150;
  let pass = true;

  console.log(`  Total products in DB: ${total}`);
  for (const [cur, count] of Object.entries(totals)) {
    const ok = count >= minRequired;
    if (!ok) pass = false;
    console.log(`  ${cur}: ${count} ${ok ? '✓' : `✗ (need >= ${minRequired})`}`);
  }
  if (total < 600) { pass = false; console.log(`  ✗ Total < 600`); }

  if (pass) console.log('  ✓ All verification checks passed');
  else { console.error('  ✗ Verification FAILED — check currency distribution'); process.exit(1); }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log(' FLOW Foundation Seeder — Task #54');
  console.log('═══════════════════════════════════════════════════════════');

  const cookie = await login();

  await seedUsers(cookie);
  const brandMap = await seedBrands(cookie);
  await seedSuppliers(cookie);
  await seedProducts(cookie, brandMap);
  await verifySeedResults(cookie);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' Foundation seeding complete!');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => { console.error('\n✗ Fatal error:', err); process.exit(1); });
