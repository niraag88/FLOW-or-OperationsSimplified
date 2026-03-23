/**
 * populate-suppliers-api.ts
 * API-driven supplier population script.
 * Uses authenticated POST /api/suppliers — no direct SQL.
 *
 * Usage:  npx tsx scripts/populate-suppliers-api.ts
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
  if (!r.ok) throw new Error(`Login failed: ${r.status}`);
  const cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
  console.log(`✓ Logged in as ${USERNAME}`);
  return cookie;
}

async function post(path: string, body: object, cookie: string) {
  const r = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}

async function getExistingNames(cookie: string): Promise<Set<string>> {
  const r = await fetch(`${BASE_URL}/api/suppliers`, { headers: { Cookie: cookie } });
  const data = await r.json();
  const list: any[] = Array.isArray(data) ? data : (Array.isArray(data.suppliers) ? data.suppliers : []);
  return new Set(list.map((s: any) => s.name));
}

const SUPPLIERS: Array<{
  name: string; email: string; phone: string;
  address: string; country: string; payment_terms?: string; notes?: string;
}> = [
  // UK
  { name: 'Amphora Aromatics Ltd', email: 'trade@amphora-retail.co.uk', phone: '+44 117 904 7212', address: 'Unit 1, Aldermoor Way, Longwell Green, Bristol BS30 7DA', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Essential oils, carrier oils, aromatherapy supplies' },
  { name: 'Naissance Natural Health Ltd', email: 'wholesale@naissance.com', phone: '+44 1639 825 107', address: 'Unit 4, Baglan Energy Park, Port Talbot, Wales SA12 7AX', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Carrier oils, butters, essential oils — certified organic range' },
  { name: 'RHS Supplies UK', email: 'trade@rhssupplies.co.uk', phone: '+44 1582 611 166', address: '14 Church Road, Harpenden, Hertfordshire AL5 1DH', country: 'United Kingdom', payment_terms: 'Net 45' },
  { name: 'Aromantic Ltd', email: 'orders@aromantic.co.uk', phone: '+44 1309 696 900', address: 'Unit 1 Macrae Road, Pike Road Industrial Estate, Forres IV36 2GH', country: 'United Kingdom', payment_terms: 'Net 30', notes: 'Skincare ingredients, botanicals, emulsifiers' },
  { name: 'Freshskin Beauty Ltd', email: 'wholesale@freshskinbeauty.co.uk', phone: '+44 1327 351 104', address: '1 Chalcot Court, Daventry, Northamptonshire NN11 8YH', country: 'United Kingdom', payment_terms: 'Net 30' },
  // India
  { name: 'Indian Aroma Products Pvt Ltd', email: 'export@indianaroma.in', phone: '+91 99 1234 5678', address: '52 Sector 18, Noida, Uttar Pradesh 201 301', country: 'India', payment_terms: 'Net 60', notes: 'Therapeutic grade essential oils, bulk carrier oils' },
  { name: 'Kanta Enterprises Kannauj', email: 'sales@kantaenterpriseskannauj.com', phone: '+91 51 6222 2345', address: 'Kannauj, Uttar Pradesh 209 726', country: 'India', payment_terms: 'Net 60', notes: 'Rose otto, jasmine absolute, sandalwood — Kannauj attar tradition' },
  { name: 'Prakruti Products', email: 'exports@prakrutiproducts.com', phone: '+91 79 2630 0011', address: '501 Sakar III, Ashram Road, Ahmedabad 380 009', country: 'India', payment_terms: 'Net 45', notes: 'COSMOS certified organics, fair trade range' },
  { name: 'Green Fields International India', email: 'info@greenfieldsintl.in', phone: '+91 22 2836 0077', address: '221 Nariman Point, Mumbai, Maharashtra 400 021', country: 'India', payment_terms: 'Net 60' },
  // France
  { name: 'Biolandes Aromates SARL', email: 'export@biolandes.com', phone: '+33 5 58 78 16 16', address: '40 Route de Roquefort, 40120 Retjons, France', country: 'France', payment_terms: 'Net 60', notes: 'French lavender, lavandin, mint, noble chamomile' },
  { name: 'Robertet SA', email: 'naturalmaterials@robertet.com', phone: '+33 4 94 60 90 00', address: '1 Place Général de Gaulle, 83170 Brignoles, France', country: 'France', payment_terms: 'Net 90', notes: 'Premium fragrance and flavour naturals — rose de mai, jasmine' },
  { name: 'Huiles & Sens France', email: 'b2b@huiles-et-sens.com', phone: '+33 4 90 09 34 80', address: 'ZI Les Gaffins, 84220 Roussillon, France', country: 'France', payment_terms: 'Net 45' },
  // Germany
  { name: 'Primavera Life GmbH', email: 'export@primaveralife.com', phone: '+49 8379 9287 0', address: 'Aumühleweg 1, 87477 Sulzberg-Moosbach, Germany', country: 'Germany', payment_terms: 'Net 45', notes: 'Certified organic essential oils, certified natural cosmetics' },
  { name: 'Wala Heilmittel GmbH', email: 'international@wala.de', phone: '+49 7164 930 0', address: 'Dorfstraße 1, 73087 Bad Boll, Germany', country: 'Germany', payment_terms: 'Net 60', notes: 'Biodynamic plant extracts, Dr. Hauschka base oils' },
  // USA
  { name: 'Rocky Mountain Oils LLC', email: 'wholesale@rockymountainoils.com', phone: '+1 888 330 0051', address: '2076 South State Street, Orem, Utah 84058, USA', country: 'United States', payment_terms: 'Net 30', notes: 'GC/MS tested essential oils, seed to seal quality' },
  { name: 'Bulk Apothecary Inc', email: 'wholesale@bulkapothecary.com', phone: '+1 888 728 7612', address: '45 Fir Hill, Akron, Ohio 44304, USA', country: 'United States', payment_terms: 'Net 30', notes: 'Carrier oils, butters, waxes, candle supplies' },
  { name: 'Botanical Beauty Inc', email: 'b2b@botanicalbeauty.com', phone: '+1 310 745 3331', address: '2355 Westwood Blvd, Los Angeles, CA 90064, USA', country: 'United States', payment_terms: 'Net 45' },
  // Australia
  { name: 'Australian Wholesale Oils', email: 'trade@australianwholesaleoils.com.au', phone: '+61 3 9558 4411', address: '12 Moncrief Road, Nunawading VIC 3131, Australia', country: 'Australia', payment_terms: 'Net 45', notes: 'Tea tree, eucalyptus, kanuka, manuka — Australian natives' },
  { name: 'Jurlique Farm Supplies', email: 'procurement@jurlique.com.au', phone: '+61 8 8388 1255', address: 'Mount Barker Road, Stirling SA 5152, Australia', country: 'Australia', payment_terms: 'Net 60', notes: 'Certified biodynamic — rose hip, calendula, chamomile' },
  // Italy
  { name: 'Aboca SpA Società Agricola', email: 'export@aboca.com', phone: '+39 0575 746 1', address: 'Loc. Aboca 20, 52037 Sansepolcro (AR), Italy', country: 'Italy', payment_terms: 'Net 60', notes: 'Certified organic medicinal herbs and botanical extracts' },
  { name: 'Farchioni Olii SpA', email: 'export@farchioni.com', phone: '+39 0744 930 811', address: 'Localita San Martino, 05020 Gualdo Cattaneo (PG), Italy', country: 'Italy', payment_terms: 'Net 45', notes: 'Extra virgin olive oil, cold-pressed sunflower, avocado carriers' },
  // UAE / Regional
  { name: 'Ajmal Perfumes Wholesale', email: 'wholesale@ajmalperfumes.com', phone: '+971 4 224 2000', address: 'Deira, Dubai, UAE', country: 'UAE', payment_terms: 'Net 30', notes: 'Oud, rose, musk — traditional Arabian aromatics' },
  { name: 'Emirates Bio Farm', email: 'trade@emiratesbiofarm.ae', phone: '+971 2 575 0555', address: 'Al Ain Agricultural Area, Al Ain, UAE', country: 'UAE', payment_terms: 'Net 30', notes: 'UAE-grown herbs, camel milk derivatives, ghaf extracts' },
  { name: 'Global Natural Ingredients FZE', email: 'sales@gnifze.com', phone: '+971 4 883 8700', address: 'Jebel Ali Free Zone, Dubai, UAE', country: 'UAE', payment_terms: 'Net 45', notes: 'Import-export hub for natural ingredients — Indian Ocean sourcing' },
  { name: 'Al Haramain Perfumes Co LLC', email: 'b2b@alharamain.com', phone: '+971 6 569 9002', address: 'Ajman Industrial Area, Ajman, UAE', country: 'UAE', payment_terms: 'Net 30', notes: 'Oudh, bukhoor, Arabic perfume bases' },
  { name: 'Dibaj Aromatics Trading', email: 'orders@dibajaro.ae', phone: '+971 4 339 1122', address: 'Al Quoz Industrial 4, Dubai, UAE', country: 'UAE', payment_terms: 'Net 30' },
  // Morocco
  { name: 'Atlas Botanicals Maroc', email: 'export@atlasbotanicals.ma', phone: '+212 5 24 43 22 00', address: '12 Rue Ibn Sina, Marrakech 40000, Morocco', country: 'Morocco', payment_terms: 'Net 60', notes: 'Rose de Damas, argan oil, thyme, rosemary — Atlas mountain sourcing' },
  // Sri Lanka
  { name: 'Cinnamon Dreams Lanka', email: 'export@cinnamondreams.lk', phone: '+94 11 234 5678', address: 'No. 55 Galle Road, Colombo 3, Sri Lanka', country: 'Sri Lanka', payment_terms: 'Net 60', notes: 'Ceylon cinnamon, clove, cardamom, vetiver — organic certified' },
  // Madagascar
  { name: 'Madagascar Oils SARL', email: 'export@madagascaroils.mg', phone: '+261 20 22 34 567', address: 'Zone Industrielle, Antananarivo 101, Madagascar', country: 'Madagascar', payment_terms: 'Net 60', notes: 'Ylang ylang, ravintsara, niaouli, clove — wild-harvested' },
  // Nepal
  { name: 'Himalayan Herb Works', email: 'export@himalayanherbworks.com.np', phone: '+977 1 553 0088', address: 'New Baneshwor, Kathmandu, Nepal', payment_terms: 'Net 45', country: 'Nepal', notes: 'Juniper, rhododendron, neem — Himalayan foothills wildcrafted' },
  // Spain
  { name: 'Treatt España SL', email: 'ventas@treatt-espana.com', phone: '+34 93 741 2200', address: 'Polígono Industrial Can Torrella, 08233 Vacarisses, Barcelona, Spain', country: 'Spain', payment_terms: 'Net 45', notes: 'Citrus oils — cold-pressed lemon, orange, lime, grapefruit' },
  // Brazil
  { name: 'Citróleo Group', email: 'export@citroleo.com.br', phone: '+55 19 3872 2000', address: 'Rua Comendador Monteiro, Limeira, SP 13480-000, Brazil', country: 'Brazil', payment_terms: 'Net 60', notes: 'Copaiba, buriti, andiroba, Amazonian carrier oils' },
  // Japan
  { name: 'Nippon Essential Oil Co', email: 'export@nipponessentialoil.co.jp', phone: '+81 3 3665 1234', address: '2-15-1 Nihonbashi, Chuo-ku, Tokyo 103-0027, Japan', country: 'Japan', payment_terms: 'Net 60', notes: 'Hinoki cypress, yuzu, shiso — premium Japanese aromatics' },
];

async function main() {
  const cookie = await login();
  const existing = await getExistingNames(cookie);
  console.log(`Found ${existing.size} existing suppliers`);

  let created = 0;
  let skipped = 0;

  for (const supplier of SUPPLIERS) {
    if (existing.has(supplier.name)) {
      skipped++;
      continue;
    }
    const { status, data } = await post('/api/suppliers', supplier, cookie);
    if (status === 201) {
      created++;
      console.log(`  ✓ Created: ${supplier.name} (ID ${data.id})`);
    } else {
      console.error(`  ✗ Failed (${status}): ${supplier.name} — ${JSON.stringify(data)}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (existing): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
