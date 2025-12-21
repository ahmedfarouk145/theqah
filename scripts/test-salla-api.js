
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'diagnostic_output.txt');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  fs.appendFileSync(LOG_FILE, line + '\n');
  // Also try console
  // console.log(line); 
}

// Clear log file
if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);

log('Starting Salla API Test (File Mode)...');

// Load environment variables
loadEnvConfig(process.cwd());

function initFirebase() {
  if (getApps().length) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY || "";

  // cleanup for env-inlined private key
  privateKey = privateKey.trim();
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    log("⚠️ Missing or invalid Firebase credentials in env");
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey })
  });
}

async function run() {
  const storeUid = 'salla:982747175';
  log(`Fetching token for store: ${storeUid}`);
  
  try {
    const app = initFirebase();
    const db = getFirestore(app);
    
    const ownerDoc = await db.collection('owners').doc(storeUid).get();
    
    if (!ownerDoc.exists) {
      log('❌ Owner document not found in Firestore');
      return;
    }
    
    const token = ownerDoc.data()?.oauth?.access_token;
    if (!token) {
      log('❌ No access token found in owner document');
      return;
    }
    
    log('✅ Access token retrieved. Querying Salla API...');
    
    const apiUrl = 'https://api.salla.dev/admin/v2/reviews?per_page=100';
    const res = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    });
    
    log(`API Response Status: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
        log(`❌ API Error: ${await res.text()}`);
        return;
    }

    const data = await res.json();
    log(`Total reviews returned: ${data.data?.length}`);
    
    if (data.data && data.data.length > 0) {
        log('\n--- SAMPLE REVIEW STRUCTURE ---');
        log(JSON.stringify(data.data[0], null, 2));
        
        log('\n--- ALL ORDER IDs ---');
        const summary = data.data.map((r) => ({ 
            id: r.id, 
            order_id: r.order_id, 
            type: r.type,
            product_id: r.product_id || r.product?.id
        }));
        log(JSON.stringify(summary, null, 2));
    } else {
        log('⚠️ No reviews found.');
        log('Full response payload:');
        log(JSON.stringify(data, null, 2));
    }

  } catch (error) {
    log(`❌ Script failed: ${error.message} \nStack: ${error.stack}`);
  }
}

run();
