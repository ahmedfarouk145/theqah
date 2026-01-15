// src/pages/api/_admin/ping.ts
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const auth = req.headers.authorization || '';
    const [scheme, token] = auth.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ ok: false, error: 'MISSING_ID_TOKEN' });
    }

    // Use AuthService to verify token (via Firebase Auth)
    const { authAdmin, dbAdmin } = await import('@/lib/firebaseAdmin');
    const decoded = await authAdmin().verifyIdToken(token);
    const uid = decoded.uid;

    // Test read store doc
    const ref = dbAdmin().collection('stores').doc(uid);
    const snap = await ref.get();

    return res.status(200).json({
      ok: true,
      uid,
      storeDocExists: snap.exists,
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } catch (e) {
    console.error('PING ERROR:', e);
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
