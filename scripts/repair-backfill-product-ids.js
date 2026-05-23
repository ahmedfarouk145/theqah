// scripts/repair-backfill-product-ids.js
//
// One-time repair: backfills the missing productId + productName fields on
// existing `salla_backfill_*` review docs in Firestore. Without these
// fields, the Google aggregator-application feed has to filter the rows
// out (their <product_url> would point at our certificate page, which
// Google's validator rejects).
//
// Root cause (now fixed for FUTURE backfills in salla-backfill.service.ts):
// the original backfill hardcoded productId='' even though Salla's bulk
// reviews API returns r.product.id inline. This script re-fetches that
// data per store and updates the existing docs.
//
// Usage:
//   node scripts/repair-backfill-product-ids.js <env-file> [--dry-run] [--store=<uid>]
//
// Examples:
//   node scripts/repair-backfill-product-ids.js .env.production --dry-run
//   node scripts/repair-backfill-product-ids.js .env.production
//   node scripts/repair-backfill-product-ids.js .env.production --store=salla:294939335
//
// Idempotent: running it twice is safe. Reviews already carrying a
// productId are skipped entirely. If Salla returns no match for a review
// (e.g. the buyer or merchant deleted it from Salla's side), the script
// leaves the doc untouched and records the miss in the summary.

/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SALLA_REVIEWS_API = 'https://api.salla.dev/admin/v2/reviews';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PER_REQUEST_DELAY_MS = 250; // Be gentle with Salla's rate limit.

// ── Args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const envPath = argv[0];
const isDryRun = argv.includes('--dry-run');
const onlyStoreArg = argv.find((a) => a.startsWith('--store='));
const onlyStore = onlyStoreArg ? onlyStoreArg.split('=')[1] : null;

if (!envPath) {
  console.error('Usage: node scripts/repair-backfill-product-ids.js <env-file> [--dry-run] [--store=<uid>]');
  process.exit(1);
}
if (!fs.existsSync(envPath)) {
  console.error(`Env file not found: ${envPath}`);
  process.exit(1);
}

// ── Env loading (same pattern as enqueue-stores.js) ────────────────
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Salla token handling ────────────────────────────────────────────
async function getValidAccessToken(db, storeUid) {
  // Tokens live in `owners/{storeUid}.oauth.{access_token,refresh_token,expires}`
  // — same shape SallaTokenService.getValidAccessToken reads on the server.
  const ownerDoc = await db.collection('owners').doc(storeUid).get();
  if (!ownerDoc.exists) return null;
  const oauth = (ownerDoc.data() || {}).oauth || {};
  const { access_token, refresh_token, expires } = oauth;
  if (!access_token) return null;

  // Expires can be seconds or ms; the prod code accepts both.
  const expiresMs = expires < 1e12 ? expires * 1000 : expires;
  if (Date.now() + REFRESH_BUFFER_MS < expiresMs) {
    return access_token;
  }

  // Token expired. Try refresh.
  if (!refresh_token) return null;
  const clientId = process.env.SALLA_CLIENT_ID;
  const clientSecret = process.env.SALLA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn('  (refresh skipped — missing SALLA_CLIENT_ID/SECRET in env)');
    return null;
  }

  try {
    const resp = await fetch(SALLA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.access_token) return null;
    // Persist the refreshed token so future runs reuse it.
    await db.collection('owners').doc(storeUid).set({
      oauth: {
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires: Date.now() + (data.expires_in * 1000),
      },
    }, { merge: true });
    return data.access_token;
  } catch {
    return null;
  }
}

// ── Salla reviews bulk fetcher ──────────────────────────────────────
//
// Returns Map<sallaReviewId, { productId, productName }> for every review
// type=='rating' the store has on Salla's side. Walks all pages.
async function buildSallaReviewMap(accessToken) {
  const map = new Map();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const url = `${SALLA_REVIEWS_API}?page=${page}&per_page=100`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      throw new Error(`Salla API ${resp.status}: ${await resp.text().catch(() => '')}`);
    }
    const data = await resp.json();
    const reviews = (data && data.data) || [];
    const pagination = (data && data.pagination) || {};
    totalPages = pagination.totalPages || totalPages;

    for (const r of reviews) {
      const type = String(r.type || 'rating').toLowerCase();
      if (type !== 'rating') continue;
      const sallaReviewId = String(r.id || '');
      if (!sallaReviewId) continue;
      const productId = String(r.product?.id || '');
      const productName = String(r.product?.name || '');
      if (productId || productName) {
        map.set(sallaReviewId, { productId, productName });
      }
    }

    if (!pagination.links || !pagination.links.next) break;
    page++;
    await sleep(PER_REQUEST_DELAY_MS);
  }
  return map;
}

// ── Main ───────────────────────────────────────────────────────────
(async () => {
  const db = getFirestore(initFirebase());

  console.log(`\n${'═'.repeat(78)}`);
  console.log(`Repair backfilled review productIds  ${isDryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'═'.repeat(78)}\n`);

  // Step 1: Find broken reviews — backfill source + empty productId.
  // We don't use a single composite query because productId='' isn't an
  // efficient Firestore predicate; scanning by source then in-memory
  // filtering is cheaper given the index landscape.
  console.log('Step 1: scanning Firestore for backfilled reviews with empty productId...');
  let snap;
  if (onlyStore) {
    console.log(`  (restricted to store: ${onlyStore})`);
    snap = await db.collection('reviews')
      .where('storeUid', '==', onlyStore)
      .where('source', '==', 'salla_backfill')
      .get();
  } else {
    snap = await db.collection('reviews')
      .where('source', '==', 'salla_backfill')
      .get();
  }

  const brokenByStore = new Map(); // storeUid -> [{ docId, sallaReviewId }]
  let totalBackfilled = 0;
  let alreadyOk = 0;
  for (const doc of snap.docs) {
    totalBackfilled++;
    const d = doc.data();
    const productId = String(d.productId || '');
    if (productId) { alreadyOk++; continue; }
    const sallaReviewId = String(d.sallaReviewId || '');
    if (!sallaReviewId) continue; // Can't recover without the Salla ID.
    const storeUid = String(d.storeUid || '');
    if (!storeUid) continue;
    if (!brokenByStore.has(storeUid)) brokenByStore.set(storeUid, []);
    brokenByStore.get(storeUid).push({ docId: doc.id, sallaReviewId });
  }

  console.log(`  Total backfilled reviews:      ${totalBackfilled}`);
  console.log(`  Already have productId:        ${alreadyOk}`);
  console.log(`  Need repair:                   ${snap.size - alreadyOk}`);
  console.log(`  Across stores:                 ${brokenByStore.size}\n`);

  // Step 2: per store, fetch the Salla review map and update Firestore.
  let totalFixed = 0;
  let totalSkippedNoMatch = 0;
  let totalSkippedNoToken = 0;
  let totalApiErrors = 0;

  for (const [storeUid, broken] of brokenByStore) {
    console.log(`─── ${storeUid}  (${broken.length} reviews to repair) ───`);

    const token = await getValidAccessToken(db, storeUid);
    if (!token) {
      console.log(`  ✗ no valid access token, skipping`);
      totalSkippedNoToken += broken.length;
      continue;
    }

    let sallaMap;
    try {
      sallaMap = await buildSallaReviewMap(token);
      console.log(`  Salla map: ${sallaMap.size} reviews with product info`);
    } catch (err) {
      console.log(`  ✗ Salla API error: ${err.message}`);
      totalApiErrors += broken.length;
      continue;
    }

    // Update each broken review in batches of 500 (Firestore write batch cap).
    const batch = db.batch();
    let batchCount = 0;
    let storeFixed = 0;
    let storeNoMatch = 0;
    for (const { docId, sallaReviewId } of broken) {
      const match = sallaMap.get(sallaReviewId);
      if (!match || (!match.productId && !match.productName)) {
        storeNoMatch++;
        continue;
      }
      const update = { updatedAt: Date.now() };
      if (match.productId) update.productId = match.productId;
      if (match.productName) update.productName = match.productName;

      if (!isDryRun) {
        batch.update(db.collection('reviews').doc(docId), update);
        batchCount++;
        if (batchCount >= 500) {
          await batch.commit();
          batchCount = 0;
        }
      }
      storeFixed++;
    }
    if (batchCount > 0 && !isDryRun) await batch.commit();

    console.log(`  ✓ fixed: ${storeFixed}    ✗ no Salla match: ${storeNoMatch}`);
    totalFixed += storeFixed;
    totalSkippedNoMatch += storeNoMatch;

    // Gentle pause between stores.
    await sleep(500);
  }

  console.log(`\n${'═'.repeat(78)}`);
  console.log('Summary');
  console.log(`${'═'.repeat(78)}`);
  console.log(`  Reviews fixed:             ${totalFixed}  ${isDryRun ? '(would have been — dry run)' : ''}`);
  console.log(`  No match in Salla:         ${totalSkippedNoMatch}  (review deleted on Salla side)`);
  console.log(`  No token (skipped store):  ${totalSkippedNoToken}`);
  console.log(`  Salla API errors:          ${totalApiErrors}`);
  console.log(`${'═'.repeat(78)}\n`);

  if (isDryRun) {
    console.log('Dry run — no Firestore writes were made.');
    console.log('Re-run without --dry-run to apply the changes.\n');
  } else {
    console.log('Done. Re-run /feeds/google-aggregator-sample.xml — newly-repaired');
    console.log('reviews will now appear in the feed (instead of being filtered out).\n');
  }
  process.exit(0);
})().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
