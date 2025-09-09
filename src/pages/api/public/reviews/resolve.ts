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

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      // يستخدم Application Default Credentials أو مفاتيحك (اختياري)
      credential: admin.credential.applicationDefault(),
    });
  }
  return admin.firestore();
}

function cleanHost(raw: unknown): string {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const host = cleanHost(req.query.host || req.query.domain);
  const storeId = String(req.query.storeId || req.query.store || '').trim();
  const storeUid = String(req.query.storeUid || '').trim();

  // 1) إن وُجد storeUid أو storeId في الطلب
  if (storeUid) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ storeUid });
  }
  if (storeId) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ storeUid: `salla:${storeId}` });
  }

  // 2) بالـ host (الدومين)
  if (!host) return res.status(400).json({ error: 'MISSING_HOST' });

  try {
    const db = getDb();
    // البحث حسب arrays أو حقل أساسي
    let snap = await db.collection('stores').where('domains', 'array-contains', host).limit(1).get();
    let doc = snap.docs[0];

    if (!doc) {
      snap = await db.collection('stores').where('primaryDomain', '==', host).limit(1).get();
      doc = snap.docs[0];
    }

    if (!doc) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(404).json({ error: 'STORE_NOT_FOUND' });
    }

    const data = doc.data() as Partial<StoreDoc>;
    const uid =
      data.uid ||
      data.storeUid ||
      (data.storeId != null ? `salla:${String(data.storeId)}` : undefined);

    if (!uid) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(404).json({ error: 'UID_NOT_FOUND' });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ storeUid: uid });
  } catch (err) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ error: 'RESOLVE_FAILED' });
  }
}
