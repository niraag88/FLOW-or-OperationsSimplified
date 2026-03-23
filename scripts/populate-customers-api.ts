/**
 * populate-customers-api.ts
 * API-driven customer population script.
 * Uses authenticated POST /api/customers — no direct SQL.
 *
 * Usage:  npx tsx scripts/populate-customers-api.ts
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
  if (!cookie) throw new Error('No session cookie received');
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
  const r = await fetch(`${BASE_URL}/api/customers`, { headers: { Cookie: cookie } });
  const data = await r.json();
  const list = data.customers ?? data;
  return new Set(list.map((c: any) => c.name));
}

const CUSTOMERS: Array<{
  name: string; email: string; phone: string;
  billing_address: string; shipping_address: string;
}> = [
  // UAE Hotels
  { name: 'Jumeirah Al Qasr Hotel', email: 'spa@jumeirah-alqasr.ae', phone: '+971 4 366 8888', billing_address: 'Madinat Jumeirah, Dubai, UAE', shipping_address: 'Madinat Jumeirah, Dubai, UAE' },
  { name: 'Atlantis The Palm Dubai', email: 'procurement@atlantis.ae', phone: '+971 4 426 2000', billing_address: 'Palm Jumeirah, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },
  { name: 'One&Only The Palm', email: 'spa@oneandonlypalmjumeirah.com', phone: '+971 4 440 1010', billing_address: 'Palm Jumeirah, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },
  { name: 'Bulgari Hotel Dubai', email: 'purchases@bulgarihoteldubai.com', phone: '+971 4 777 5555', billing_address: 'Jumeirah Bay Island, Dubai, UAE', shipping_address: 'Jumeirah Bay Island, Dubai, UAE' },
  { name: 'Burj Al Arab Jumeirah', email: 'wellness@burjalarab.com', phone: '+971 4 301 7777', billing_address: 'Jumeirah Beach Road, Dubai, UAE', shipping_address: 'Jumeirah Beach Road, Dubai, UAE' },
  { name: 'Palazzo Versace Dubai', email: 'spa@palazzoversacedubai.com', phone: '+971 4 556 8888', billing_address: 'Culture Village, Dubai, UAE', shipping_address: 'Culture Village, Dubai, UAE' },
  { name: 'Sofitel Dubai Downtown', email: 'procurement@sofiteldubai.com', phone: '+971 4 503 6666', billing_address: 'Sheikh Zayed Road, Dubai, UAE', shipping_address: 'Sheikh Zayed Road, Dubai, UAE' },
  { name: 'Waldorf Astoria Dubai DIFC', email: 'spa@waldorfdifc.com', phone: '+971 4 818 2222', billing_address: 'DIFC, Dubai, UAE', shipping_address: 'DIFC, Dubai, UAE' },
  { name: 'Conrad Dubai', email: 'wellness@conraddubai.com', phone: '+971 4 444 7444', billing_address: 'Sheikh Zayed Road, Dubai, UAE', shipping_address: 'Sheikh Zayed Road, Dubai, UAE' },
  { name: 'InterContinental Dubai Festival City', email: 'purchasing@icdfc.com', phone: '+971 4 701 1111', billing_address: 'Festival City, Dubai, UAE', shipping_address: 'Festival City, Dubai, UAE' },
  // Abu Dhabi Hotels
  { name: 'Emirates Palace Mandarin Oriental', email: 'spa@emiratespalace.ae', phone: '+971 2 690 9000', billing_address: 'Corniche Road, Abu Dhabi, UAE', shipping_address: 'Corniche Road, Abu Dhabi, UAE' },
  { name: 'Louvre Abu Dhabi Hotel', email: 'procurement@louvreabudhabi-hotel.ae', phone: '+971 2 641 5555', billing_address: 'Saadiyat Island, Abu Dhabi, UAE', shipping_address: 'Saadiyat Island, Abu Dhabi, UAE' },
  { name: 'Yas Island Rotana', email: 'spa@yasislandrotana.com', phone: '+971 2 656 4000', billing_address: 'Yas Island, Abu Dhabi, UAE', shipping_address: 'Yas Island, Abu Dhabi, UAE' },
  { name: 'Rosewood Abu Dhabi', email: 'purchases@rosewoodabudhabi.com', phone: '+971 2 813 5550', billing_address: 'Al Maryah Island, Abu Dhabi, UAE', shipping_address: 'Al Maryah Island, Abu Dhabi, UAE' },
  { name: 'Four Seasons Hotel Abu Dhabi', email: 'spa@fourseasons-abudhabi.com', phone: '+971 2 333 2222', billing_address: 'Al Maryah Island, Abu Dhabi, UAE', shipping_address: 'Al Maryah Island, Abu Dhabi, UAE' },
  // Spas
  { name: 'Talise Spa Madinat Jumeirah', email: 'talise@jumeirah.com', phone: '+971 4 366 6818', billing_address: 'Madinat Jumeirah, Dubai, UAE', shipping_address: 'Madinat Jumeirah, Dubai, UAE' },
  { name: 'ShuiQi Spa Atlantis', email: 'shuiqi@atlantis.ae', phone: '+971 4 426 1000', billing_address: 'Palm Jumeirah, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },
  { name: 'Willow Stream Spa Fairmont', email: 'willowstream@fairmont-dubai.com', phone: '+971 4 332 5555', billing_address: 'Sheikh Zayed Road, Dubai, UAE', shipping_address: 'Sheikh Zayed Road, Dubai, UAE' },
  { name: 'Anantara Spa Dubai', email: 'spadubai@anantara.com', phone: '+971 4 428 7888', billing_address: 'Dubai Creek, Dubai, UAE', shipping_address: 'Dubai Creek, Dubai, UAE' },
  { name: 'Cleopatra Spa & Wellness', email: 'bookings@cleopatraspa.ae', phone: '+971 4 324 7700', billing_address: 'Wafi City, Dubai, UAE', shipping_address: 'Wafi City, Dubai, UAE' },
  { name: 'N Spa JW Marriott Marquis', email: 'nspa@jwmarriott-dubai.com', phone: '+971 4 414 0000', billing_address: 'Business Bay, Dubai, UAE', shipping_address: 'Business Bay, Dubai, UAE' },
  { name: 'Sens Spa Le Royal Meridien', email: 'sensspa@lemeridien-dubai.com', phone: '+971 4 399 5555', billing_address: 'Al Sufouh, Dubai, UAE', shipping_address: 'Al Sufouh, Dubai, UAE' },
  // Retail
  { name: 'Organic Foods & Café Dubai', email: 'purchasing@organicfoods.ae', phone: '+971 4 282 9000', billing_address: 'Greens, Dubai, UAE', shipping_address: 'Distribution Centre, Dubai, UAE' },
  { name: 'Holland & Barrett UAE', email: 'uae@hollandandbarrett.com', phone: '+971 4 447 6600', billing_address: 'Mall of the Emirates, Dubai, UAE', shipping_address: 'Jebel Ali Warehouse, Dubai, UAE' },
  { name: 'Life Pharmacy UAE', email: 'wholesale@lifepharmacy.ae', phone: '+971 4 339 9999', billing_address: 'Dubai Healthcare City, UAE', shipping_address: 'Dubai Healthcare City, UAE' },
  { name: 'Aster Pharmacy UAE', email: 'procurement@asterdm.com', phone: '+971 4 220 0820', billing_address: 'Aster Corporate, Dubai, UAE', shipping_address: 'Aster Warehouse, Dubai, UAE' },
  { name: 'Carrefour UAE Wellness', email: 'wellness.buyer@carrefour.ae', phone: '+971 4 294 1000', billing_address: 'Festival City, Dubai, UAE', shipping_address: 'Carrefour DC, Dubai, UAE' },
  { name: 'Lulu Hypermarket Health', email: 'health@lulugroup.com', phone: '+971 2 633 8899', billing_address: 'Hamdan Street, Abu Dhabi, UAE', shipping_address: 'Lulu DC, Abu Dhabi, UAE' },
  { name: 'Kibsons International', email: 'orders@kibsons.com', phone: '+971 4 375 7575', billing_address: 'Al Quoz, Dubai, UAE', shipping_address: 'Al Quoz, Dubai, UAE' },
  // Corporate
  { name: 'Emirates Group Wellness', email: 'wellness@emirates.com', phone: '+971 4 708 1111', billing_address: 'Emirates Group HQ, Dubai, UAE', shipping_address: 'Emirates Wellness Centre, Dubai, UAE' },
  { name: 'Etihad Airways Wellness', email: 'wellness@etihad.ae', phone: '+971 2 511 0000', billing_address: 'Etihad HQ, Abu Dhabi, UAE', shipping_address: 'Etihad Wellness, Abu Dhabi, UAE' },
  { name: 'Dubai Holding Corporate', email: 'procurement@dubaiholding.ae', phone: '+971 4 390 0000', billing_address: 'Jumeirah Emirates Towers, Dubai, UAE', shipping_address: 'Dubai Holding, Dubai, UAE' },
  { name: 'ADNOC Employee Wellness', email: 'wellness@adnoc.ae', phone: '+971 2 701 0000', billing_address: 'ADNOC HQ, Abu Dhabi, UAE', shipping_address: 'ADNOC Employee Centre, UAE' },
  { name: 'Majid Al Futtaim Corporate', email: 'procurement@majidalfuttaim.com', phone: '+971 4 294 2400', billing_address: 'Al Matar, Abu Dhabi, UAE', shipping_address: 'MAF DC, Dubai, UAE' },
  // Oman
  { name: 'Al Bustan Palace Ritz-Carlton Oman', email: 'spa@albustan-ritzcarlton.com', phone: '+968 2479 9666', billing_address: 'Qantab, Muscat, Oman', shipping_address: 'Qantab, Muscat, Oman' },
  { name: 'Chedi Muscat', email: 'spa@thechedimuscat.com', phone: '+968 2452 4400', billing_address: 'Al Ghubrah North, Muscat, Oman', shipping_address: 'Al Ghubrah North, Muscat, Oman' },
  { name: 'Anantara Al Jabal Al Akhdar Resort', email: 'spa@jabalakhdar.anantara.com', phone: '+968 2521 8000', billing_address: 'Al Jabal Al Akhdar, Oman', shipping_address: 'Al Jabal Al Akhdar, Oman' },
  { name: 'Zighy Bay Six Senses', email: 'purchases@sixsenses-zighy.com', phone: '+968 2673 5555', billing_address: 'Zighy Bay, Musandam, Oman', shipping_address: 'Zighy Bay, Musandam, Oman' },
  // Export / International
  { name: 'Burj Beauty Kuwait', email: 'orders@burjbeauty.com.kw', phone: '+965 2224 4400', billing_address: 'Salmiya, Kuwait City, Kuwait', shipping_address: 'Salmiya, Kuwait City, Kuwait' },
  { name: 'Wellness Arabia Riyadh', email: 'orders@wellnessarabia.com.sa', phone: '+966 11 491 0000', billing_address: 'Olaya, Riyadh, KSA', shipping_address: 'Olaya, Riyadh, KSA' },
  { name: 'Bahrain Spa Supplies', email: 'orders@bahrainspa.com.bh', phone: '+973 1733 0000', billing_address: 'Manama, Bahrain', shipping_address: 'Manama, Bahrain' },
  { name: 'Natural Elements Qatar', email: 'orders@naturalelements.com.qa', phone: '+974 4444 5000', billing_address: 'West Bay, Doha, Qatar', shipping_address: 'West Bay, Doha, Qatar' },
  { name: 'Al Rawabi Wellness Jordan', email: 'orders@alrawabi-wellness.jo', phone: '+962 6 500 4400', billing_address: 'Abdali, Amman, Jordan', shipping_address: 'Abdali, Amman, Jordan' },
  { name: 'Egyptian Spa Imports', email: 'orders@egyptianspa.com.eg', phone: '+20 2 2736 0000', billing_address: 'Zamalek, Cairo, Egypt', shipping_address: 'Zamalek, Cairo, Egypt' },
];

async function main() {
  const cookie = await login();
  const existing = await getExistingNames(cookie);
  console.log(`Found ${existing.size} existing customers`);

  let created = 0;
  let skipped = 0;

  for (const customer of CUSTOMERS) {
    if (existing.has(customer.name)) {
      skipped++;
      continue;
    }
    const { status, data } = await post('/api/customers', customer, cookie);
    if (status === 201) {
      created++;
      console.log(`  ✓ Created: ${customer.name} (ID ${data.id})`);
    } else {
      console.error(`  ✗ Failed (${status}): ${customer.name} — ${JSON.stringify(data)}`);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (existing): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
