// scripts/export-reviews.mjs
// Export reviews collection from Firestore to JSON file

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync, readFileSync } from 'fs';

// Load environment variables from .env.local
const envContent = readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    process.env[key] = value;
  }
});

// Initialize Firebase Admin using environment variables
const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'theqah-d3ee0',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = getFirestore(app);

async function exportReviews() {
  console.log('📦 Fetching reviews from Firestore...');
  
  const reviewsSnapshot = await db.collection('reviews').get();
  
  const reviews = [];
  reviewsSnapshot.forEach(doc => {
    reviews.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  console.log(`✅ Found ${reviews.length} reviews`);
  
  // Save to JSON file
  const filename = `reviews-export-${Date.now()}.json`;
  writeFileSync(filename, JSON.stringify(reviews, null, 2));
  
  console.log(`💾 Exported to: ${filename}`);
  
  // Print summary
  console.log('\n📊 Summary:');
  console.log(`- Total reviews: ${reviews.length}`);
  console.log(`- With needsSallaId: ${reviews.filter(r => r.needsSallaId).length}`);
  console.log(`- With sallaReviewId: ${reviews.filter(r => r.sallaReviewId).length}`);
  console.log(`- Verified: ${reviews.filter(r => r.verified).length}`);
  console.log(`- Source salla_native: ${reviews.filter(r => r.source === 'salla_native').length}`);
  
  // Print first 3 reviews as sample
  console.log('\n📝 Sample reviews:');
  reviews.slice(0, 3).forEach((review, idx) => {
    console.log(`\n${idx + 1}. ${review.id}`);
    console.log(`   - storeUid: ${review.storeUid}`);
    console.log(`   - orderId: ${review.orderId}`);
    console.log(`   - productId: ${review.productId}`);
    console.log(`   - sallaReviewId: ${review.sallaReviewId || 'NOT SET'}`);
    console.log(`   - needsSallaId: ${review.needsSallaId || false}`);
    console.log(`   - verified: ${review.verified}`);
    console.log(`   - source: ${review.source}`);
  });
  
  process.exit(0);
}

exportReviews().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
