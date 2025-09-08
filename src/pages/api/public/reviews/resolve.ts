// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import * as admin from 'firebase-admin';

// لو عندك تهيئة جاهزة (dbAdmin) استخدمها بدل getDb()
function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      // يفضل ضبط GOOGLE_APPLICATION_CREDENTIALS أو استخدام Admin SDK من env
      credential: admin.credential.applicationDefault(),
    });
  }
  return admin.firestore();
}

type StoreDoc = {
  uid?: string;
  storeUid?: string;
  storeId?: string | number;
  domains?: string[];
  primaryDomain?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const rawHost = String(req.query.host ?? '').trim().toLowerCase();
  const host = rawHost
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];

  const storeId = String((req.query.storeId ?? req.query.store ?? '') as string).trim();
  const storeUid = String((req.query.storeUid ?? '') as string).trim();

  // 1) لو جاي storeUid أو storeId جاهز
  if (storeUid) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ storeUid });
  }
  if (storeId) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ storeUid: `salla:${storeId}` });
  }

  // 2) البحث بالدومين
  if (!host) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'MISSING_HOST' });
  }

  try {
    const db = getDb();

    // domains array-contains
    let snap = await db.collection('stores').where('domains', 'array-contains', host).limit(1).get();
    let doc = snap.docs[0];

    // أو primaryDomain == host
    if (!doc) {
      snap = await db.collection('stores').where('primaryDomain', '==', host).limit(1).get();
      doc = snap.docs[0];
    }

    if (!doc) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(404).json({ error: 'STORE_NOT_FOUND' });
    }

    const data = doc.data() as StoreDoc;
    const uid =
      data.uid ??
      data.storeUid ??
      (data.storeId !== undefined && data.storeId !== null ? `salla:${String(data.storeId)}` : null);

    if (!uid) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(404).json({ error: 'UID_NOT_FOUND' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ storeUid: uid });
  } catch (e) {
    console.error('resolve error:', e);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'RESOLVE_FAILED' });
  }
}
