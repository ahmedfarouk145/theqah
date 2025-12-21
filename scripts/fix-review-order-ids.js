
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'migration_output.txt');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line); // Try console too
}

if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
log('Starting Review Order ID Migration...');

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

    // Get Access Token
    const ownerDoc = await db.collection('owners').doc(storeUid).get();
    const token = ownerDoc.data()?.oauth?.access_token;
    if (!token) {
      log('❌ No access token found');
      return;
    }

    // fetching reviews that need Salla ID
    const snapshot = await db.collection('reviews')
        .where('needsSallaId', '==', true)
        .where('storeUid', '==', storeUid)
        .get();

    log(`Found ${snapshot.size} reviews to check.`);

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
       const data = doc.data();
       const currentOrderId = data.orderId; // Likely the Reference ID (9 digits)

       log(`Processing review ${doc.id} (Order: ${currentOrderId})`);

       // Check if it looks like a Reference ID (approx 9 digits) vs Internal (10 digits)
       // Internal IDs: ~2,000,000,000
       // Reference IDs: ~200,000,000
       
       if (currentOrderId && currentOrderId.length === 9) {
           log(` -> ${currentOrderId} looks like a Reference ID. Searching Salla API for Internal ID...`);
           
           // Fetch order from Salla by keyword (reference ID)
           const ordersUrl = `https://api.salla.dev/admin/v2/orders?keyword=${currentOrderId}`;
           const res = await fetch(ordersUrl, {
               headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
           });
           
           if (!res.ok) {
               log(` -> ❌ Salla API Error: ${res.status}`);
               continue;
           }
           
           const json = await res.json();
           const order = json.data?.find(o => String(o.reference_id) === String(currentOrderId));
           
           if (order) {
               const internalId = String(order.id);
               log(` -> ✅ Found Internal ID: ${internalId} for Reference ${currentOrderId}`);
               
               // Update Firestore
               await doc.ref.update({
                   orderId: internalId,
                   orderNumber: String(currentOrderId),
                   idFixed: true,
                   fixedAt: new Date().toISOString()
               });
               log(` -> ✅ Updated Firestore doc.`);
           } else {
               log(` -> ⚠️ Order not found in Salla API.`);
           }
       } else {
           log(` -> ${currentOrderId} does not look like a Reference ID (or already fixed). Skipping.`);
       }
    }

  } catch (error) {
    log(`❌ Error: ${error.message}\n${error.stack}`);
  }
}

run();
