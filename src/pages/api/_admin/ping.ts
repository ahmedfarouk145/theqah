// src/pages/api/_admin/ping.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = req.headers.authorization || '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ ok: false, error: 'MISSING_ID_TOKEN' });
    }

    const decoded = await authAdmin().verifyIdToken(token);
    const uid = decoded.uid;

    // test read/write (read store doc by uid as id)
    const ref = dbAdmin().collection('stores').doc(uid);
    const snap = await ref.get();

    return res.status(200).json({
      ok: true,
      uid,
      storeDocExists: snap.exists,
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    console.error('PING ERROR:', e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
