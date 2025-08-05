// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';

export function initAdmin() {
  if (!admin.apps.length) {
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY!;
    const formattedPrivateKey = rawPrivateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedPrivateKey,
      }),
    });
  }
}

export { admin };
