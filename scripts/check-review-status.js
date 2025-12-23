
const { loadEnvConfig } = require('@next/env');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

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
  
  // The specific review ID we've been working on
  const reviewId = 'salla_982747175_order_225136883_product_1927638714';
  
  console.log(`Checking status for review: ${reviewId}...`);
  
  const doc = await db.collection('reviews').doc(reviewId).get();
  
  if (!doc.exists) {
      console.log('❌ Review Document NOT FOUND.');
      return;
  }
  
  const data = doc.data();
  console.log('\n--- Review Data ---');
  console.log(`Order ID (Internal):  ${data.orderId}`);
  console.log(`Order Number (Ref):   ${data.orderNumber}`);
  console.log(`Salla Review ID:      ${data.sallaReviewId}`);
  console.log(`Verified Status:      ${data.verified}`);
  console.log(`Type (Local):         ${data.type}`);
  
  console.log('\n--- Analysis ---');
  
  // Check Link
  // We want the Product Review ID (approx 1345067509 based on logs) NOT the Testimonial (1829593071)
  // But without knowing the exact ID for sure, we just check if it changed.
  if (data.sallaReviewId === '1829593071') {
      console.log('⚠️ Warning: Still linked to Testimonial ID (1829593071). Widget might not show.');
  } else {
      console.log('✅ Linked to a different ID (likely the Product Review).');
  }
  
  // Check Verified
  if (data.verified === true) {
      console.log('✅ Verified: TRUE (Widget should show badge)');
  } else {
      console.log('❌ Verified: FALSE (Widget will hide badge)');
  }
}

run();
