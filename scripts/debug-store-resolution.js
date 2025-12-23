// scripts/debug-store-resolution.js
// Run: node scripts/debug-store-resolution.js

require('@next/env').loadEnvConfig(process.cwd());
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');

const LOG_FILE = 'store_resolution_debug.txt';
let output = '';

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  output += line + '\n';
  console.log(line);
}

async function main() {
  log('=== Store Resolution Debug ===');
  log(`Time: ${new Date().toISOString()}\n`);

  // Initialize Firebase Admin
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }

  const db = getFirestore();

  // 1. Check all stores
  log('=== ALL STORES ===');
  const storesSnap = await db.collection('stores').limit(20).get();
  log(`Found ${storesSnap.size} stores:\n`);
  
  storesSnap.forEach(doc => {
    const data = doc.data();
    log(`Store ID: ${doc.id}`);
    log(`  uid: ${data.uid}`);
    log(`  provider: ${data.provider}`);
    log(`  salla.domain: ${data.salla?.domain}`);
    log(`  salla.storeId: ${data.salla?.storeId}`);
    log(`  salla.connected: ${data.salla?.connected}`);
    log(`  salla.installed: ${data.salla?.installed}`);
    log(`  domain.base: ${data.domain?.base}`);
    log('');
  });

  // 2. Check all domains
  log('\n=== ALL DOMAINS ===');
  const domainsSnap = await db.collection('domains').limit(30).get();
  log(`Found ${domainsSnap.size} domains:\n`);
  
  domainsSnap.forEach(doc => {
    const data = doc.data();
    log(`Domain Key: ${doc.id}`);
    log(`  base: ${data.base}`);
    log(`  storeUid: ${data.storeUid || data.uid}`);
    log(`  provider: ${data.provider}`);
    log('');
  });

  // 3. Check specific demo store pattern
  log('\n=== LOOKING FOR DEMO STORE ===');
  const demoStoreQuery = await db.collection('stores')
    .where('salla.storeId', '==', 982747175)
    .get();
  
  if (demoStoreQuery.empty) {
    log('No store found with storeId 982747175');
    
    // Try as string
    const demoStoreStrQuery = await db.collection('stores')
      .where('salla.storeId', '==', '982747175')
      .get();
    
    if (!demoStoreStrQuery.empty) {
      log('Found store with storeId as STRING:');
      demoStoreStrQuery.forEach(doc => {
        log(JSON.stringify(doc.data(), null, 2));
      });
    }
  } else {
    log('Found demo store:');
    demoStoreQuery.forEach(doc => {
      log(`Document ID: ${doc.id}`);
      log(JSON.stringify(doc.data(), null, 2));
    });
  }

  // Save output
  fs.writeFileSync(LOG_FILE, output);
  log(`\n=== Output saved to ${LOG_FILE} ===`);
}

main().catch(err => {
  log('ERROR: ' + err.message);
  fs.writeFileSync(LOG_FILE, output);
});
