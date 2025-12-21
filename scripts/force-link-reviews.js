
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'link_reviews_output.txt');

function log(msg) {
  const line = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  fs.appendFileSync(LOG_FILE, line + '\n');
  console.log(line);
}

if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
log('Starting Force Link Reviews...');

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

    // 1. Get Access Token
    const ownerDoc = await db.collection('owners').doc(storeUid).get();
    const token = ownerDoc.data()?.oauth?.access_token;
    if (!token) {
      log('❌ No access token found');
      return;
    }

    // 2. Fetch ALL Salla Reviews
    log('Fetching all reviews from Salla API...');
    const apiUrl = 'https://api.salla.dev/admin/v2/reviews?per_page=100';
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    
    if (!res.ok) {
        log(`❌ Salla API Error: ${await res.text()}`);
        return;
    }
    
    const sallaData = await res.json();
    const sallaReviews = sallaData.data || [];
    log(`Fetched ${sallaReviews.length} reviews from Salla.`);

    // 3. Fetch ALL local reviews (to check for wrong links too)
    const snapshot = await db.collection('reviews')
        .where('storeUid', '==', storeUid)
        .get();

    log(`Found ${snapshot.size} local reviews connected to this store.`);

    if (snapshot.empty) return;

    for (const doc of snapshot.docs) {
       const data = doc.data();
       const orderId = String(data.orderId); 
       
       // Skip if no orderId
       if (!orderId) continue;
       
       // Current link status
       const currentSallaId = data.sallaReviewId;
       const isRating = data.type === 'rating'; // Our local type tracking might be missing, rely on Salla match


       // Match logic: 
       // 1. prefer type='rating' (Product Review)
       // 2. match order_id
       
       let match = sallaReviews.find(r => String(r.order_id) === orderId && r.type === 'rating');
       
       // If we found a RATING match, but the current link is different (or missing), UPDATE IT
       if (match) {
           if (currentSallaId !== String(match.id)) {
               log(` -> 🔄 Fixing Link! Switching from ${currentSallaId || 'None'} to Rating ID ${match.id}`);
               await doc.ref.update({
                   sallaReviewId: String(match.id),
                   needsSallaId: false,
                   linkedAt: new Date().toISOString(),
                   linkMethod: 'force-link-repair'
               });
           } else {
               log(` -> ✅ Already linked correctly to Rating ID ${match.id}`);
           }
           continue; 
       }

       // Fallback: if no rating found, try testimonial
       // Only link if not already linked
       if (!currentSallaId) {
          match = sallaReviews.find(r => String(r.order_id) === orderId);
          if (match) {
             log(` -> ⚠️ No Rating found. Linking to available match (Type: ${match.type}) ID: ${match.id}`);
             await doc.ref.update({
                   sallaReviewId: String(match.id),
                   needsSallaId: false,
                   linkedAt: new Date().toISOString(),
                   linkMethod: 'force-link-fallback'
             });
          } else {
             log(` -> ❌ Still no match for Order ${orderId}`);
          }
       } else {
          log(` -> ℹ️ Currently linked to ${currentSallaId} (No better 'rating' match found)`);
       }
     } // end for


  } catch (error) {
    log(`❌ Error: ${error.message}\n${error.stack}`);
  }
}

run();
