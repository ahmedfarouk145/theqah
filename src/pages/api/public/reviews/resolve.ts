// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import * as admin from 'firebase-admin';

type StoreDoc = {
  uid?: string;
  storeUid?: string;
  storeId?: string | number;
  domains?: string[];
  primaryDomain?: string;
};

// ---- Utilities ----
function isErr(e: unknown): e is { message?: string } {
  return typeof e === 'object' && e !== null && 'message' in e;
}
function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (isErr(e) && typeof e.message === 'string') return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
function logError(prefix: string, e: unknown) {
  console.error(prefix, e);
}

// Initialize Firebase Admin with proper error handling
function initializeFirebase() {
  if (admin.apps.length > 0) {
    return admin.app(); // Return existing app
  }

  try {
    // Option 1: Use service account key (recommended for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    // Option 2: Use individual environment variables
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
      return admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    // Option 3: Application default credentials (fallback)
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } catch (error) {
    logError('Failed to initialize Firebase:', error);
    throw new Error('Firebase initialization failed');
  }
}

function getDb() {
  try {
    const app = initializeFirebase();
    // Using the app's Firestore instance (compatible with admin v9+)
    return app.firestore();
  } catch (error) {
    logError('Failed to get Firestore instance:', error);
    throw error;
  }
}

function cleanHost(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const host = cleanHost((req.query.host ?? req.query.domain) as string | undefined);
    const storeId = String(req.query.storeId ?? req.query.store ?? '').trim();
    const storeUid = String(req.query.storeUid ?? '').trim();

    console.log('Resolve request:', { host, storeId, storeUid });

    // 1) If storeUid or storeId provided in request
    if (storeUid) {
      console.log('Returning provided storeUid:', storeUid);
      return res.status(200).json({ storeUid });
    }

    if (storeId) {
      const resolvedUid = `salla:${storeId}`;
      console.log('Returning resolved storeUid from storeId:', resolvedUid);
      return res.status(200).json({ storeUid: resolvedUid });
    }

    // 2) Lookup by host (domain)
    if (!host) {
      console.error('Missing host parameter');
      return res.status(400).json({ error: 'MISSING_HOST' });
    }

    console.log('Looking up store by host:', host);

    // Initialize Firestore
    let db;
    try {
      db = getDb();
    } catch (error) {
      const details = errMsg(error);
      logError('Failed to initialize Firestore:', error);
      return res.status(500).json({
        error: 'DATABASE_INIT_FAILED',
        details: process.env.NODE_ENV === 'development' ? details : undefined,
      });
    }

    // Search by domains array first
    let snap;
    let doc;

    try {
      console.log('Querying stores collection by domains array...');
      snap = await db.collection('stores').where('domains', 'array-contains', host).limit(1).get();
      doc = snap.docs[0];

      if (doc) {
        console.log('Found store by domains array:', doc.id);
      }
    } catch (error) {
      logError('Error querying by domains array:', error);
      // Continue to next query method
    }

    // If not found, search by primaryDomain
    if (!doc) {
      try {
        console.log('Querying stores collection by primaryDomain...');
        snap = await db.collection('stores').where('primaryDomain', '==', host).limit(1).get();
        doc = snap.docs[0];

        if (doc) {
          console.log('Found store by primaryDomain:', doc.id);
        }
      } catch (error) {
        logError('Error querying by primaryDomain:', error);
      }
    }

    if (!doc) {
      console.log('Store not found for host:', host);
      return res.status(404).json({ error: 'STORE_NOT_FOUND' });
    }

    const data = doc.data() as Partial<StoreDoc>;
    console.log('Store data found:', {
      uid: data.uid,
      storeUid: data.storeUid,
      storeId: data.storeId,
      domains: data.domains,
      primaryDomain: data.primaryDomain,
    });

    const uid =
      data.uid ||
      data.storeUid ||
      (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) {
      console.error('No valid UID found in store document');
      return res.status(404).json({ error: 'UID_NOT_FOUND' });
    }

    console.log('Returning resolved storeUid:', uid);
    return res.status(200).json({ storeUid: uid });
  } catch (error) {
    const details = errMsg(error);
    logError('Unexpected error in resolve handler:', error);
    return res.status(500).json({
      error: 'RESOLVE_FAILED',
      details: process.env.NODE_ENV === 'development' ? details : undefined,
    });
  }
}
