/**
 * populate-customers-api.ts
 * API-driven customer population script.
 * Uses authenticated POST /api/customers — no direct SQL.
 * Contains 100 customer definitions; a single run on an empty DB creates all
 * 100 via the REST API. Re-runs on a populated DB skip existing names.
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
  // ── UAE Hotels (Dubai) ───────────────────────────────────────────────────
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
  { name: 'Four Seasons Resort Dubai at Jumeirah Beach', email: 'spa@fourseasons-dubai.com', phone: '+971 4 270 7777', billing_address: 'Jumeirah Road, Dubai, UAE', shipping_address: 'Jumeirah Road, Dubai, UAE' },
  { name: 'Ritz-Carlton DIFC Dubai', email: 'wellness@ritzcarlton-difc.com', phone: '+971 4 372 2222', billing_address: 'DIFC, Dubai, UAE', shipping_address: 'DIFC, Dubai, UAE' },
  { name: 'St Regis Dubai The Palm', email: 'spa@stregis-palm.com', phone: '+971 4 543 7777', billing_address: 'Palm Jumeirah, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },
  { name: 'Park Hyatt Dubai', email: 'purchasing@parkhyattdubai.com', phone: '+971 4 602 1234', billing_address: 'Dubai Creek, Dubai, UAE', shipping_address: 'Dubai Creek, Dubai, UAE' },
  { name: 'Mandarin Oriental Jumeira', email: 'spa@mojumeira.com', phone: '+971 4 777 2222', billing_address: 'Jumeira, Dubai, UAE', shipping_address: 'Jumeira, Dubai, UAE' },

  // ── UAE Hotels (Abu Dhabi) ───────────────────────────────────────────────
  { name: 'Emirates Palace Mandarin Oriental', email: 'spa@emiratespalace.ae', phone: '+971 2 690 9000', billing_address: 'Corniche Road, Abu Dhabi, UAE', shipping_address: 'Corniche Road, Abu Dhabi, UAE' },
  { name: 'Louvre Abu Dhabi Hotel', email: 'procurement@louvreabudhabi-hotel.ae', phone: '+971 2 641 5555', billing_address: 'Saadiyat Island, Abu Dhabi, UAE', shipping_address: 'Saadiyat Island, Abu Dhabi, UAE' },
  { name: 'Yas Island Rotana', email: 'spa@yasislandrotana.com', phone: '+971 2 656 4000', billing_address: 'Yas Island, Abu Dhabi, UAE', shipping_address: 'Yas Island, Abu Dhabi, UAE' },
  { name: 'Rosewood Abu Dhabi', email: 'purchases@rosewoodabudhabi.com', phone: '+971 2 813 5550', billing_address: 'Al Maryah Island, Abu Dhabi, UAE', shipping_address: 'Al Maryah Island, Abu Dhabi, UAE' },
  { name: 'Four Seasons Hotel Abu Dhabi', email: 'spa@fourseasons-abudhabi.com', phone: '+971 2 333 2222', billing_address: 'Al Maryah Island, Abu Dhabi, UAE', shipping_address: 'Al Maryah Island, Abu Dhabi, UAE' },
  { name: 'Jumeirah at Etihad Towers', email: 'wellness@jumeirah-abudhabi.com', phone: '+971 2 811 5555', billing_address: 'Corniche Road, Abu Dhabi, UAE', shipping_address: 'Corniche Road, Abu Dhabi, UAE' },
  { name: 'St Regis Abu Dhabi', email: 'spa@stregis-abudhabi.com', phone: '+971 2 694 4444', billing_address: 'Nation Towers, Abu Dhabi, UAE', shipping_address: 'Nation Towers, Abu Dhabi, UAE' },
  { name: 'Shangri-La Qaryat Al Beri', email: 'purchasing@shangri-la-abudhabi.com', phone: '+971 2 509 8888', billing_address: 'Qaryat Al Beri, Abu Dhabi, UAE', shipping_address: 'Qaryat Al Beri, Abu Dhabi, UAE' },

  // ── UAE Hotels (Other Emirates) ──────────────────────────────────────────
  { name: 'Ajman Saray Luxury Collection', email: 'spa@ajmansaray.com', phone: '+971 6 714 2222', billing_address: 'Ajman Corniche, Ajman, UAE', shipping_address: 'Ajman Corniche, Ajman, UAE' },
  { name: 'Hilton Ras Al Khaimah Beach', email: 'wellness@hilton-rak.com', phone: '+971 7 228 8888', billing_address: 'Al Marjan Island, RAK, UAE', shipping_address: 'Al Marjan Island, RAK, UAE' },
  { name: 'Anantara Sir Bani Yas', email: 'spa@sirbaniyas.anantara.com', phone: '+971 2 801 5400', billing_address: 'Sir Bani Yas Island, Abu Dhabi, UAE', shipping_address: 'Sir Bani Yas Island, Abu Dhabi, UAE' },
  { name: 'Banyan Tree Al Wadi', email: 'spa@banyantree-alwadi.com', phone: '+971 7 206 7777', billing_address: 'Al Wadi, RAK, UAE', shipping_address: 'Al Wadi, RAK, UAE' },
  { name: 'Fujairah Rotana Resort', email: 'spa@fujairahrotana.com', phone: '+971 9 244 9888', billing_address: 'Al Aqah Beach, Fujairah, UAE', shipping_address: 'Al Aqah Beach, Fujairah, UAE' },
  { name: 'Mövenpick Resort Fujairah', email: 'wellness@movenpick-fujairah.com', phone: '+971 9 209 9000', billing_address: 'Al Aqah Beach, Fujairah, UAE', shipping_address: 'Al Aqah Beach, Fujairah, UAE' },

  // ── UAE Spas ─────────────────────────────────────────────────────────────
  { name: 'Talise Spa Madinat Jumeirah', email: 'talise@jumeirah.com', phone: '+971 4 366 6818', billing_address: 'Madinat Jumeirah, Dubai, UAE', shipping_address: 'Madinat Jumeirah, Dubai, UAE' },
  { name: 'ShuiQi Spa Atlantis', email: 'shuiqi@atlantis.ae', phone: '+971 4 426 1000', billing_address: 'Palm Jumeirah, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },
  { name: 'Willow Stream Spa Fairmont', email: 'willowstream@fairmont-dubai.com', phone: '+971 4 332 5555', billing_address: 'Sheikh Zayed Road, Dubai, UAE', shipping_address: 'Sheikh Zayed Road, Dubai, UAE' },
  { name: 'Anantara Spa Dubai', email: 'spadubai@anantara.com', phone: '+971 4 428 7888', billing_address: 'Dubai Creek, Dubai, UAE', shipping_address: 'Dubai Creek, Dubai, UAE' },
  { name: 'Cleopatra Spa & Wellness', email: 'bookings@cleopatraspa.ae', phone: '+971 4 324 7700', billing_address: 'Wafi City, Dubai, UAE', shipping_address: 'Wafi City, Dubai, UAE' },
  { name: 'N Spa JW Marriott Marquis', email: 'nspa@jwmarriott-dubai.com', phone: '+971 4 414 0000', billing_address: 'Business Bay, Dubai, UAE', shipping_address: 'Business Bay, Dubai, UAE' },
  { name: 'Sens Spa Le Royal Meridien', email: 'sensspa@lemeridien-dubai.com', phone: '+971 4 399 5555', billing_address: 'Al Sufouh, Dubai, UAE', shipping_address: 'Al Sufouh, Dubai, UAE' },
  { name: 'Heavenly Spa Westin Dubai', email: 'heavenlyspa@westin-dubai.com', phone: '+971 4 511 0000', billing_address: 'Dubai Marina, Dubai, UAE', shipping_address: 'Dubai Marina, Dubai, UAE' },
  { name: 'Zen Spa JA Ocean View Hotel', email: 'spa@jaresorts-dubai.com', phone: '+971 4 814 5555', billing_address: 'JBR, Dubai, UAE', shipping_address: 'JBR, Dubai, UAE' },
  { name: 'Amara Spa Park Hyatt Dubai', email: 'amaraspa@parkhyatt-dubai.com', phone: '+971 4 602 1234', billing_address: 'Dubai Creek, Dubai, UAE', shipping_address: 'Dubai Creek, Dubai, UAE' },
  { name: 'Rayya Wellness Rixos', email: 'rayya@rixos-uae.com', phone: '+971 4 399 9999', billing_address: 'JBR, Dubai, UAE', shipping_address: 'JBR, Dubai, UAE' },
  { name: 'Balance Health & Wellbeing Centre', email: 'orders@balancedubai.com', phone: '+971 4 344 8844', billing_address: 'Jumeirah 1, Dubai, UAE', shipping_address: 'Jumeirah 1, Dubai, UAE' },
  { name: 'Casa de Karma Wellness', email: 'orders@casadekarma.ae', phone: '+971 4 323 1333', billing_address: 'Al Quoz, Dubai, UAE', shipping_address: 'Al Quoz, Dubai, UAE' },

  // ── UAE Retail & Pharmacy ────────────────────────────────────────────────
  { name: 'Organic Foods & Café Dubai', email: 'purchasing@organicfoods.ae', phone: '+971 4 282 9000', billing_address: 'Greens, Dubai, UAE', shipping_address: 'Distribution Centre, Dubai, UAE' },
  { name: 'Holland & Barrett UAE', email: 'uae@hollandandbarrett.com', phone: '+971 4 447 6600', billing_address: 'Mall of the Emirates, Dubai, UAE', shipping_address: 'Jebel Ali Warehouse, Dubai, UAE' },
  { name: 'Life Pharmacy UAE', email: 'wholesale@lifepharmacy.ae', phone: '+971 4 339 9999', billing_address: 'Dubai Healthcare City, UAE', shipping_address: 'Dubai Healthcare City, UAE' },
  { name: 'Aster Pharmacy UAE', email: 'procurement@asterdm.com', phone: '+971 4 220 0820', billing_address: 'Aster Corporate, Dubai, UAE', shipping_address: 'Aster Warehouse, Dubai, UAE' },
  { name: 'Carrefour UAE Wellness', email: 'wellness.buyer@carrefour.ae', phone: '+971 4 294 1000', billing_address: 'Festival City, Dubai, UAE', shipping_address: 'Carrefour DC, Dubai, UAE' },
  { name: 'Lulu Hypermarket Health', email: 'health@lulugroup.com', phone: '+971 2 633 8899', billing_address: 'Hamdan Street, Abu Dhabi, UAE', shipping_address: 'Lulu DC, Abu Dhabi, UAE' },
  { name: 'Kibsons International', email: 'orders@kibsons.com', phone: '+971 4 375 7575', billing_address: 'Al Quoz, Dubai, UAE', shipping_address: 'Al Quoz, Dubai, UAE' },
  { name: 'Grandiose Supermarket Dubai', email: 'buying@grandiose.ae', phone: '+971 4 452 7800', billing_address: 'Barsha Heights, Dubai, UAE', shipping_address: 'Al Quoz Industrial, Dubai, UAE' },
  { name: 'Spinneys UAE Wellness', email: 'wellness@spinneys.ae', phone: '+971 4 394 1122', billing_address: 'Umm Suqeim, Dubai, UAE', shipping_address: 'Spinneys DC, Dubai, UAE' },
  { name: 'Waitrose UAE Health', email: 'health@waitrose.ae', phone: '+971 4 700 0400', billing_address: 'Dubai Marina Mall, Dubai, UAE', shipping_address: 'Jebel Ali, Dubai, UAE' },
  { name: 'Ounass UAE Beauty', email: 'beauty@ounass.com', phone: '+971 4 240 7000', billing_address: 'Sheikh Zayed Road, Dubai, UAE', shipping_address: 'Dubai South, UAE' },
  { name: 'Boutiqaat UAE', email: 'purchasing@boutiqaat.com', phone: '+971 4 444 4040', billing_address: 'JLT, Dubai, UAE', shipping_address: 'Jebel Ali, UAE' },

  // ── UAE Corporate & Wellness Centres ────────────────────────────────────
  { name: 'Emirates Group Wellness', email: 'wellness@emirates.com', phone: '+971 4 708 1111', billing_address: 'Emirates Group HQ, Dubai, UAE', shipping_address: 'Emirates Wellness Centre, Dubai, UAE' },
  { name: 'Etihad Airways Wellness', email: 'wellness@etihad.ae', phone: '+971 2 511 0000', billing_address: 'Etihad HQ, Abu Dhabi, UAE', shipping_address: 'Etihad Wellness, Abu Dhabi, UAE' },
  { name: 'Dubai Holding Corporate', email: 'procurement@dubaiholding.ae', phone: '+971 4 390 0000', billing_address: 'Jumeirah Emirates Towers, Dubai, UAE', shipping_address: 'Dubai Holding, Dubai, UAE' },
  { name: 'ADNOC Employee Wellness', email: 'wellness@adnoc.ae', phone: '+971 2 701 0000', billing_address: 'ADNOC HQ, Abu Dhabi, UAE', shipping_address: 'ADNOC Employee Centre, UAE' },
  { name: 'Majid Al Futtaim Corporate', email: 'procurement@majidalfuttaim.com', phone: '+971 4 294 2400', billing_address: 'Al Matar, Abu Dhabi, UAE', shipping_address: 'MAF DC, Dubai, UAE' },
  { name: 'Dubai World Trade Centre LLC', email: 'procurement@dwtc.com', phone: '+971 4 308 6000', billing_address: 'Trade Centre District, Dubai, UAE', shipping_address: 'DWTC, Dubai, UAE' },
  { name: 'DP World Employee Wellness', email: 'wellness@dpworld.com', phone: '+971 4 881 5000', billing_address: 'Port Rashid, Dubai, UAE', shipping_address: 'Jebel Ali, Dubai, UAE' },
  { name: 'Chalhoub Group Beauty Division', email: 'beauty@chalhoubgroup.com', phone: '+971 4 376 0000', billing_address: 'Festival City, Dubai, UAE', shipping_address: 'Jebel Ali, Dubai, UAE' },
  { name: 'Al Tayer Group Retail', email: 'retail@altayer.com', phone: '+971 4 294 7747', billing_address: 'Al Tayer Motors Building, Dubai, UAE', shipping_address: 'Jebel Ali FZ, Dubai, UAE' },
  { name: 'Nakheel Property Wellness', email: 'wellness@nakheel.com', phone: '+971 4 390 3333', billing_address: 'Palm Jumeirah HQ, Dubai, UAE', shipping_address: 'Palm Jumeirah, Dubai, UAE' },

  // ── Oman ─────────────────────────────────────────────────────────────────
  { name: 'Al Bustan Palace Ritz-Carlton Oman', email: 'spa@albustan-ritzcarlton.com', phone: '+968 2479 9666', billing_address: 'Qantab, Muscat, Oman', shipping_address: 'Qantab, Muscat, Oman' },
  { name: 'Chedi Muscat', email: 'spa@thechedimuscat.com', phone: '+968 2452 4400', billing_address: 'Al Ghubrah North, Muscat, Oman', shipping_address: 'Al Ghubrah North, Muscat, Oman' },
  { name: 'Anantara Al Jabal Al Akhdar Resort', email: 'spa@jabalakhdar.anantara.com', phone: '+968 2521 8000', billing_address: 'Al Jabal Al Akhdar, Oman', shipping_address: 'Al Jabal Al Akhdar, Oman' },
  { name: 'Zighy Bay Six Senses', email: 'purchases@sixsenses-zighy.com', phone: '+968 2673 5555', billing_address: 'Zighy Bay, Musandam, Oman', shipping_address: 'Zighy Bay, Musandam, Oman' },
  { name: 'Alila Hinu Bay Oman', email: 'spa@alila-hinubay.com', phone: '+968 2537 8800', billing_address: 'Mirbat, Salalah, Oman', shipping_address: 'Mirbat, Salalah, Oman' },
  { name: 'Oberoi Oman', email: 'purchases@oberoi-oman.com', phone: '+968 2499 0000', billing_address: 'Medinat Sultan Qaboos, Muscat, Oman', shipping_address: 'Medinat Sultan Qaboos, Muscat, Oman' },
  { name: 'Oman Air Corporate Wellness', email: 'wellness@omanair.com', phone: '+968 2452 1111', billing_address: 'Muscat International Airport, Oman', shipping_address: 'Muscat, Oman' },

  // ── Kuwait ────────────────────────────────────────────────────────────────
  { name: 'Burj Beauty Kuwait', email: 'orders@burjbeauty.com.kw', phone: '+965 2224 4400', billing_address: 'Salmiya, Kuwait City, Kuwait', shipping_address: 'Salmiya, Kuwait City, Kuwait' },
  { name: 'Kout Food Group Kuwait', email: 'wellness@koutfoodgroup.com', phone: '+965 2243 0000', billing_address: 'Al Shaab, Kuwait City, Kuwait', shipping_address: 'Mina Abdulla, Kuwait' },
  { name: 'Bayan Palace Spa Kuwait', email: 'spa@bayanpalace.gov.kw', phone: '+965 2227 5000', billing_address: 'Bayan, Kuwait City, Kuwait', shipping_address: 'Bayan, Kuwait City, Kuwait' },
  { name: 'Marina Mall Kuwait Wellness', email: 'wellness@marinamall.com.kw', phone: '+965 2224 5000', billing_address: 'Salmiya, Kuwait City, Kuwait', shipping_address: 'Salmiya, Kuwait City, Kuwait' },

  // ── Saudi Arabia ──────────────────────────────────────────────────────────
  { name: 'Wellness Arabia Riyadh', email: 'orders@wellnessarabia.com.sa', phone: '+966 11 491 0000', billing_address: 'Olaya, Riyadh, KSA', shipping_address: 'Olaya, Riyadh, KSA' },
  { name: 'Mandarin Oriental Riyadh Spa', email: 'spa@mo-riyadh.com', phone: '+966 11 273 5888', billing_address: 'King Fahd Road, Riyadh, KSA', shipping_address: 'King Fahd Road, Riyadh, KSA' },
  { name: 'Four Seasons Riyadh', email: 'spa@fourseasons-riyadh.com', phone: '+966 11 211 5000', billing_address: 'Kingdom Tower, Riyadh, KSA', shipping_address: 'Kingdom Tower, Riyadh, KSA' },
  { name: 'Pure Health KSA', email: 'orders@purehealth.sa', phone: '+966 12 606 0000', billing_address: 'Jeddah, KSA', shipping_address: 'Jeddah, KSA' },
  { name: 'Nahdi Medical Co', email: 'procurement@nahdi.sa', phone: '+966 12 659 0000', billing_address: 'Jeddah, KSA', shipping_address: 'King Fahd Industrial City, KSA' },

  // ── Qatar ─────────────────────────────────────────────────────────────────
  { name: 'Natural Elements Qatar', email: 'orders@naturalelements.com.qa', phone: '+974 4444 5000', billing_address: 'West Bay, Doha, Qatar', shipping_address: 'West Bay, Doha, Qatar' },
  { name: 'Four Seasons Doha Spa', email: 'spa@fourseasons-doha.com', phone: '+974 4494 8888', billing_address: 'The Pearl-Qatar, Doha, Qatar', shipping_address: 'The Pearl-Qatar, Doha, Qatar' },
  { name: 'Mandarin Oriental Doha', email: 'spa@mo-doha.com', phone: '+974 4008 8888', billing_address: 'Msheireb, Doha, Qatar', shipping_address: 'Msheireb, Doha, Qatar' },
  { name: 'Katara Hospitality Qatar', email: 'wellness@katara.net', phone: '+974 4408 0000', billing_address: 'Katara Cultural Village, Doha, Qatar', shipping_address: 'Katara, Doha, Qatar' },

  // ── Bahrain ────────────────────────────────────────────────────────────────
  { name: 'Bahrain Spa Supplies', email: 'orders@bahrainspa.com.bh', phone: '+973 1733 0000', billing_address: 'Manama, Bahrain', shipping_address: 'Manama, Bahrain' },
  { name: 'Four Seasons Bahrain Bay', email: 'spa@fourseasons-bahrain.com', phone: '+973 1711 5500', billing_address: 'Bahrain Bay, Manama, Bahrain', shipping_address: 'Bahrain Bay, Manama, Bahrain' },
  { name: 'Novotel Bahrain Al Dana', email: 'wellness@novotel-bahrain.com', phone: '+973 1729 0000', billing_address: 'Manama, Bahrain', shipping_address: 'Manama, Bahrain' },

  // ── Jordan ─────────────────────────────────────────────────────────────────
  { name: 'Al Rawabi Wellness Jordan', email: 'orders@alrawabi-wellness.jo', phone: '+962 6 500 4400', billing_address: 'Abdali, Amman, Jordan', shipping_address: 'Abdali, Amman, Jordan' },
  { name: 'Kempinski Aqaba Jordan', email: 'spa@kempinski-aqaba.com', phone: '+962 3 209 0888', billing_address: 'Aqaba, Jordan', shipping_address: 'Aqaba, Jordan' },
  { name: 'Dead Sea Spa Hotel Jordan', email: 'procurement@deadseahotel.jo', phone: '+962 5 349 1234', billing_address: 'Dead Sea Road, Jordan', shipping_address: 'Dead Sea Road, Jordan' },

  // ── Egypt ──────────────────────────────────────────────────────────────────
  { name: 'Egyptian Spa Imports', email: 'orders@egyptianspa.com.eg', phone: '+20 2 2736 0000', billing_address: 'Zamalek, Cairo, Egypt', shipping_address: 'Zamalek, Cairo, Egypt' },
  { name: 'Four Seasons Cairo Nile Plaza', email: 'spa@fourseasons-cairo.com', phone: '+20 2 2791 7000', billing_address: 'Corniche El Nil, Cairo, Egypt', shipping_address: 'Corniche El Nil, Cairo, Egypt' },
  { name: 'Sharm El Sheikh Wellness', email: 'wellness@sharmwellness.com.eg', phone: '+20 69 3661 111', billing_address: 'Naama Bay, Sharm El Sheikh, Egypt', shipping_address: 'Naama Bay, Sharm El Sheikh, Egypt' },

  // ── International Export ────────────────────────────────────────────────
  { name: 'Natural Apothecary London', email: 'orders@naturalapothecary.co.uk', phone: '+44 20 7946 0000', billing_address: 'Notting Hill, London, UK', shipping_address: 'Notting Hill, London, UK' },
  { name: 'Organic Beauty Paris', email: 'commandes@organicbeauty.fr', phone: '+33 1 4321 0000', billing_address: 'Le Marais, Paris, France', shipping_address: 'Le Marais, Paris, France' },
  { name: 'Wellness Depot Germany', email: 'bestellungen@wellnessdepot.de', phone: '+49 89 1234 5678', billing_address: 'Schwabing, Munich, Germany', shipping_address: 'Munich Distribution, Germany' },
  { name: 'Pure Natura Singapore', email: 'orders@purenatura.sg', phone: '+65 6226 0000', billing_address: 'Orchard Road, Singapore', shipping_address: 'Changi, Singapore' },
  { name: 'Holistic Health India', email: 'procurement@holistichealth.in', phone: '+91 22 6638 0000', billing_address: 'Bandra West, Mumbai, India', shipping_address: 'JNPT, Navi Mumbai, India' },
  { name: 'Aromatherapy Associates US', email: 'wholesale@aromatherapyassociates.com', phone: '+1 310 555 0190', billing_address: 'Beverly Hills, CA, USA', shipping_address: 'Los Angeles, CA, USA' },
  { name: 'Green Market Australia', email: 'orders@greenmarket.com.au', phone: '+61 2 9876 5432', billing_address: 'Surry Hills, Sydney, NSW, Australia', shipping_address: 'Port Botany, Sydney, Australia' },
  { name: 'Zen Wellness Canada', email: 'orders@zenwellness.ca', phone: '+1 604 555 0212', billing_address: 'Gastown, Vancouver, BC, Canada', shipping_address: 'Vancouver Port, BC, Canada' },
  { name: 'Herb & Soul Sweden', email: 'info@herbandsoul.se', phone: '+46 8 555 0100', billing_address: 'Södermalm, Stockholm, Sweden', shipping_address: 'Arlanda Freight, Stockholm, Sweden' },
  { name: 'Bloom Naturals New Zealand', email: 'wholesale@bloomnaturals.co.nz', phone: '+64 9 555 0145', billing_address: 'Ponsonby, Auckland, New Zealand', shipping_address: 'Auckland Port, New Zealand' },
  { name: 'Terra Organica Brazil', email: 'compras@terraorganica.com.br', phone: '+55 11 5555 0180', billing_address: 'Jardins, São Paulo, Brazil', shipping_address: 'Guarulhos, São Paulo, Brazil' },
  { name: 'Pure Elements South Africa', email: 'orders@pureelements.co.za', phone: '+27 21 555 0167', billing_address: 'Sea Point, Cape Town, South Africa', shipping_address: 'Cape Town Port, South Africa' },
];

async function main() {
  const cookie = await login();
  const existing = await getExistingNames(cookie);
  console.log(`Found ${existing.size} existing customers; script defines ${CUSTOMERS.length} customers`);

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

  console.log(`\nDone. Defined: ${CUSTOMERS.length}, Created: ${created}, Skipped (existing): ${skipped}`);
}

main().catch(err => { console.error(err); process.exit(1); });
