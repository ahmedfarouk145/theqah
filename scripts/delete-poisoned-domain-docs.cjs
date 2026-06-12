// One-time cleanup: delete `domains` docs that map BARE platform hosts
// (salla.sa / zid.sa) to a single store — these poison resolution for
// every path-based store on the shared host (audit finding F5).
// DRY RUN by default; pass --delete to actually remove.
//   node scripts/delete-poisoned-domain-docs.cjs           # list only
//   node scripts/delete-poisoned-domain-docs.cjs --delete  # delete
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

// A domains doc is poisoned when its base/key is exactly a shared
// platform origin with no store segment.
const PLATFORM_BASES = new Set([
  'salla.sa', 'www.salla.sa', 'zid.sa', 'www.zid.sa',
  'https://salla.sa', 'https://www.salla.sa',
  'https://zid.sa', 'https://www.zid.sa',
  'salla_sa', 'www_salla_sa', 'zid_sa', 'www_zid_sa',
]);

async function main() {
  const doDelete = process.argv.includes('--delete');
  const snap = await db.collection('domains').get();
  const poisoned = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    const base = String(d.base || '').replace(/\/+$/, '').toLowerCase();
    const id = doc.id.toLowerCase();
    if (PLATFORM_BASES.has(base) || PLATFORM_BASES.has(id) ||
        PLATFORM_BASES.has(base.replace(/^https?:\/\//, ''))) {
      poisoned.push({ id: doc.id, base: d.base, storeUid: d.storeUid || d.uid });
    }
  }

  console.log(`Scanned ${snap.size} domains docs; poisoned: ${poisoned.length}`);
  for (const p of poisoned) console.log(`  ${p.id} (base=${p.base}) -> ${p.storeUid}`);

  if (!poisoned.length) return;
  if (!doDelete) { console.log('\nDry run. Re-run with --delete to remove.'); return; }

  const batch = db.batch();
  for (const p of poisoned) batch.delete(db.collection('domains').doc(p.id));
  await batch.commit();
  console.log(`Deleted ${poisoned.length} poisoned docs.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
