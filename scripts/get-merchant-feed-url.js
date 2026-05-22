// scripts/get-merchant-feed-url.js
//
// Admin CLI: given a storeUid, print everything you need to onboard one
// merchant to Google Merchant Center via WhatsApp. Output is:
//
//   1. The merchant's profile (name, domain, phone if known, verified
//      review count) — so you can confirm you're sending to the right
//      person before pasting.
//   2. The merchant-specific feed URL.
//   3. A ready-to-copy Arabic WhatsApp message with the feed URL
//      inlined + the 5-step GMC setup instructions.
//
// Usage:
//   node scripts/get-merchant-feed-url.js <env-file> <storeUid>
//
// Example:
//   node scripts/get-merchant-feed-url.js \
//     ~/vercel-backups/2026-05-22/.env.production \
//     salla:294939335

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SITE_URL = 'https://www.theqah.com.sa';

const [envPath, storeUidArg] = process.argv.slice(2);
if (!envPath || !storeUidArg) {
  console.error('Usage: node scripts/get-merchant-feed-url.js <env-file> <storeUid>');
  console.error('Example: node scripts/get-merchant-feed-url.js .env.production salla:294939335');
  process.exit(1);
}
if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

// Same env-loading + Firebase init pattern as scripts/enqueue-stores.js
// so we don't need a separate config and stay consistent across admin
// scripts. If you ever rotate the service-account key, you update one
// .env file and every script picks it up.
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

function initFirebase() {
  if (getApps().length) return getApps()[0];
  let pk = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (pk.startsWith('"') && pk.endsWith('"')) pk = pk.slice(1, -1);
  pk = pk.replace(/\\n/g, '\n');
  return initializeApp({
    credential: cert({
      projectId: (process.env.FIREBASE_PROJECT_ID || '').trim(),
      clientEmail: (process.env.FIREBASE_CLIENT_EMAIL || '').trim(),
      privateKey: pk,
    }),
  });
}

// djb2-base36 — same as everywhere else in the codebase.
function certCode(storeUid) {
  if (!storeUid) return '';
  let hash = 5381;
  for (let i = 0; i < storeUid.length; i++) {
    hash = ((hash * 33) ^ storeUid.charCodeAt(i)) >>> 0;
  }
  return 'TQ-' + (hash.toString(36).toUpperCase() + '000000').slice(0, 6);
}

// Extract whatever the store doc has for owner contact. Salla and Zid
// shapes differ; we try a few known paths and surface "(unknown)" when
// nothing matches so you can spot a missing-data store.
function pickContact(data) {
  if (!data || typeof data !== 'object') return { name: null, phone: null, email: null };
  const salla = data.salla || {};
  const zid = data.zid || {};
  const meta = data.meta || {};
  const userinfo = meta.userinfo || {};
  return {
    name:
      data.name ||
      salla.storeName ||
      zid.storeName ||
      userinfo.name ||
      null,
    phone:
      userinfo.mobile ||
      userinfo.phone ||
      salla.mobile ||
      zid.mobile ||
      null,
    email:
      userinfo.email ||
      salla.email ||
      zid.email ||
      null,
  };
}

(async () => {
  const storeUid = storeUidArg.trim();
  const db = getFirestore(initFirebase());

  // Read both store collections in parallel — same precedence rule as
  // sitemap.xml (zid_stores wins on conflict).
  const [legacy, zid] = await Promise.all([
    db.collection('stores').doc(storeUid).get(),
    db.collection('zid_stores').doc(storeUid).get(),
  ]);

  const merged = {};
  if (legacy.exists) Object.assign(merged, legacy.data());
  if (zid.exists) Object.assign(merged, zid.data());

  if (!legacy.exists && !zid.exists) {
    console.error(`✗ Store not found in either 'stores' or 'zid_stores': ${storeUid}`);
    process.exit(2);
  }

  const contact = pickContact(merged);
  const platform = storeUid.startsWith('zid:') ? 'zid' : 'salla';
  const platformLabel = platform === 'zid' ? 'زد' : 'سلة';

  // Count verified reviews. COUNT aggregation is free and avoids
  // pulling 1000 docs just to display a number.
  let verifiedCount = 0;
  try {
    const agg = await db.collection('reviews')
      .where('storeUid', '==', storeUid)
      .where('verified', '==', true)
      .where('status', '==', 'approved')
      .count()
      .get();
    verifiedCount = agg.data().count;
  } catch (err) {
    console.warn('(verified count unavailable):', err.message);
  }

  const feedUrl = `${SITE_URL}/api/feeds/google-product-reviews/${encodeURIComponent(storeUid)}.xml`;
  const cert = certCode(storeUid);

  // ── Display ────────────────────────────────────────────────────────
  const line = '═'.repeat(70);
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;

  console.log('');
  console.log(line);
  console.log(bold(`Merchant feed URL — ${storeUid}`));
  console.log(line);
  console.log('');
  console.log(`  ${dim('Name:        ')}${contact.name || '(unknown)'}`);
  console.log(`  ${dim('Platform:    ')}${platform}`);
  console.log(`  ${dim('Domain:      ')}${(merged.domain && merged.domain.base) || (merged.salla && merged.salla.domain) || (merged.zid && merged.zid.domain) || '(unknown)'}`);
  console.log(`  ${dim('Phone:       ')}${contact.phone || '(unknown)'}`);
  console.log(`  ${dim('Email:       ')}${contact.email || '(unknown)'}`);
  console.log(`  ${dim('Cert code:   ')}${cert}`);
  console.log(`  ${dim('Verified:    ')}${verifiedCount} ${dim('reviews')}`);
  console.log('');
  console.log(`  ${bold('Feed URL (paste this into GMC):')}`);
  console.log(`  ${cyan(feedUrl)}`);
  console.log('');
  console.log(line);
  console.log(bold('WhatsApp message — copy everything between the dashed lines:'));
  console.log(line);
  console.log('');
  console.log(green('────────────────────────────────────────────────────────────────'));
  console.log('');
  // The actual message. Plain text, no terminal colors — exactly what
  // gets pasted into WhatsApp. RTL chars render right-to-left in any
  // modern terminal that supports UTF-8 + bidi (Windows Terminal, iTerm).
  console.log('السلام عليكم،');
  console.log('');
  console.log('فعّلنا ميزة جديدة تخلّي نجوم تقييماتك الموثقة تظهر في إعلانات Google');
  console.log('التسوقية الخاصة بمتجرك مباشرة.');
  console.log('');
  console.log('هذا الرابط مخصص لمتجرك:');
  console.log(feedUrl);
  console.log('');
  console.log('طريقة الإضافة (٣ دقائق فقط):');
  console.log('١. ادخل على merchants.google.com');
  console.log('٢. من القائمة الجانبية: Marketing ← Product reviews');
  console.log('٣. اضغط Add new feed');
  console.log('٤. الصق الرابط');
  console.log('٥. اختر Fetch frequency: Daily');
  console.log('');
  console.log(`عندك ${verifiedCount} تقييم موثق جاهز يطلع في إعلاناتك على Google.`);
  console.log('');
  console.log('تحتاج مساعدة؟ كلّمني وأشرح لك مباشرة 💙');
  console.log('فريق مشتري موثق');
  console.log('');
  console.log(green('────────────────────────────────────────────────────────────────'));
  console.log('');
  console.log(line);

  // Exit code reflects merchant readiness so you can chain this in
  // shell pipelines later if you want to filter "merchants with
  // 0 verified reviews aren't ready yet" cases.
  process.exit(verifiedCount > 0 ? 0 : 3);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
