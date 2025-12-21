
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(process.cwd(), 'subscription_debug.txt');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}
if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

loadEnvConfig(process.cwd());

function initFirebase() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
  privateKey = privateKey.replace(/\\n/g, "\n");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function run() {
  const app = initFirebase();
  const db = getFirestore(app);
  const storeUid = 'salla:982747175';

  log(`Checking subscription for ${storeUid}...`);
  
  const doc = await db.collection('stores').doc(storeUid).get();
  if (!doc.exists) {
    log('Store not found!');
    return;
  }
  
  const data = doc.data();
  const sub = data.subscription || {};
  
  log('Subscription Data: ' + JSON.stringify(sub, null, 2));
  log('startedAt: ' + sub.startedAt);
  
  if (!sub.startedAt) {
      log('❌ Result: verified is FALSE because subscription.startedAt is missing or 0.');
  } else {
      log(`✅ Subscription started at: ${new Date(sub.startedAt).toISOString()}`);
  }
}

run();
