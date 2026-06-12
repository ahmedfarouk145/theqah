// One-time backfill: build verified_index docs for all stores.
// Read-only on reviews/stores; writes one verified_index doc per store.
// Run AFTER deploying the verified-index code:  node scripts/backfill-verified-index.cjs
// Cost: ~1 read per review (~3.8k) + 1 write per store (~102).
const fs = require('fs');
const path = require('path');

for (const f of ['.env', '.env.local']) {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
});
const db = getFirestore(app);

const RICH_COUNT = 20;
const MAX_ENTRIES = 5000;

const asString = (v) => (typeof v === 'string' && v ? v : v != null && v !== '' ? String(v) : null);
const ts = (d) => {
  for (const k of ['publishedAt', 'createdAt', 'at']) {
    const v = d[k];
    if (typeof v === 'number') return v;
    if (v && typeof v.toMillis === 'function') return v.toMillis();
  }
  return 0;
};

async function main() {
  // Group all verified reviews by store in one scan.
  const snap = await db.collection('reviews')
    .where('verified', '==', true)
    .where('status', '==', 'approved')
    .get();

  const byStore = new Map();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!d.storeUid) continue;
    if (!byStore.has(d.storeUid)) byStore.set(d.storeUid, []);
    byStore.get(d.storeUid).push({ id: doc.id, d, ts: ts(d) });
  }

  console.log(`Verified reviews: ${snap.size} across ${byStore.size} stores`);

  for (const [storeUid, reviews] of byStore) {
    reviews.sort((a, b) => b.ts - a.ts);
    const kept = reviews.slice(0, MAX_ENTRIES);
    const entries = kept.map((r) => ({
      id: r.id,
      sallaReviewId: asString(r.d.sallaReviewId),
      zidDomHash: asString(r.d.zidDomHash),
      productId: asString(r.d.productId),
    }));
    const rich = kept.slice(0, RICH_COUNT).map((r, i) => ({
      ...entries[i],
      stars: typeof r.d.stars === 'number' ? r.d.stars : Number(r.d.stars) || 0,
      authorName: asString(r.d.author?.displayName) || asString(r.d.authorName),
      text: asString(r.d.text),
      productName: asString(r.d.productName),
      publishedAt: r.ts || null,
    }));

    await db.collection('verified_index').doc(storeUid).set({
      storeUid,
      count: reviews.length,
      updatedAt: Date.now(),
      entries,
      rich,
    });
    console.log(`OK ${storeUid}: ${reviews.length} reviews indexed`);
  }
  console.log('Backfill complete.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
