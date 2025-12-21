
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'verify_fix_output.txt');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}

if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
log('Starting Subscription & Verification Fix...');

loadEnvConfig(process.cwd());

function initFirebase() {
  if (getApps().length) return getApps()[0];
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) privateKey = privateKey.slice(1, -1);
  privateKey = privateKey.replace(/\\n/g, "\n");
  
  if (!projectId || !clientEmail || !privateKey) log("⚠️ Missing Firebase credentials");
  
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function run() {
  try {
    const app = initFirebase();
    const db = getFirestore(app);
    const storeUid = 'salla:982747175';

    // 1. Fix Store Subscription
    log(`Checking store ${storeUid}...`);
    const storeRef = db.collection('stores').doc(storeUid);
    const storeDoc = await storeRef.get();
    
    if (!storeDoc.exists) {
        log('❌ Store not found!');
        return;
    }
    
    const storeData = storeDoc.data();
    const sub = storeData.subscription || {};

    // If startedAt is missing, set it to 30 days ago (or current time if preferred, but older is safer for verifying past reviews)
    if (!sub.startedAt) {
        log('⚠️ Subscription missing startedAt. Backfilling...');
        
        // Use a date 3 months ago to be safe
        const backfillDate = Date.now() - (90 * 24 * 60 * 60 * 1000); 
        
        await storeRef.update({
            'subscription.startedAt': backfillDate,
            'subscription.planId': 'pro', // Defaulting to pro if missing
            'subscription.status': 'active',
            'updatedAt': Date.now()
        });
        
        log(`✅ Store subscription updated. StartedAt set to ${new Date(backfillDate).toISOString()}`);
    } else {
        log('✅ Store subscription already valid.');
    }

    // 2. Fix Reviews Verification
    log('Checking reviews verification status...');
    const snapshot = await db.collection('reviews')
        .where('storeUid', '==', storeUid)
        .where('verified', '==', false) // Only target unverified ones
        .get();

    log(`Found ${snapshot.size} unverified reviews.`);

    if (snapshot.empty) {
        log('All reviews are already verified.');
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { 
            verified: true,
            verifiedAt: new Date().toISOString(),
            verificationMethod: 'manual-fix-script'
        });
    });

    await batch.commit();
    log(`✅ Successfully verified ${snapshot.size} reviews.`);

  } catch (error) {
    log(`❌ Error: ${error.message}\n${error.stack}`);
  }
}

run();
