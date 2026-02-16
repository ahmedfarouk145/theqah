// Quick script to update the review document in Firestore
const admin = require('firebase-admin');

// Initialize using the app's service account
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
    // Try loading from .env.local
    const fs = require('fs');
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const lines = envContent.split('\n');
    for (const line of lines) {
        if (line.startsWith('FIREBASE_') || line.startsWith('GOOGLE_')) {
            const [key, ...rest] = line.split('=');
            process.env[key.trim()] = rest.join('=').trim();
        }
    }
}

// Initialize Firebase Admin with project config from env
if (!admin.apps.length) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
    if (projectId) {
        admin.initializeApp({ projectId });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();

async function updateReview() {
    const docId = 'salla_1623177406_order_1332912323_product_296807464';
    const sallaReviewId = '1879040727';

    console.log(`Updating review ${docId} with sallaReviewId: ${sallaReviewId}`);

    await db.collection('reviews').doc(docId).update({
        sallaReviewId: sallaReviewId,
        needsSallaId: false,
        verified: true,
        backfilledAt: new Date().toISOString(),
    });

    console.log('✅ Successfully updated!');

    // Verify
    const doc = await db.collection('reviews').doc(docId).get();
    const data = doc.data();
    console.log('Verified fields:', {
        sallaReviewId: data.sallaReviewId,
        needsSallaId: data.needsSallaId,
        verified: data.verified,
        backfilledAt: data.backfilledAt,
    });
}

updateReview().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
