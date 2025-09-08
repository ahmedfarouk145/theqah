// src/pages/api/public/reviews/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const raw = String(req.query.host || '').trim().toLowerCase().replace(/^www\./,'');
  if (!raw) return res.status(400).json({ error: 'MISSING_HOST' });

  try {
    const db = dbAdmin();

    // جرّب domains[] ثم primaryDomain
    let snap = await db.collection('stores').where('domains', 'array-contains', raw).limit(1).get();
    let doc = snap.docs[0];
    if (!doc) {
      snap = await db.collection('stores').where('primaryDomain', '==', raw).limit(1).get();
      doc = snap.docs[0];
    }
    if (!doc) return res.status(404).json({ error: 'STORE_NOT_FOUND' });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = doc.data() as any;
    const uid =
      data.storeUid || data.uid || (data.sallaStoreId ? `salla:${data.sallaStoreId}` : null);

    if (!uid) return res.status(404).json({ error: 'UID_NOT_FOUND' });

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ storeUid: uid });
    //eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    return res.status(500).json({ error: 'RESOLVE_FAILED' });
  }
}
