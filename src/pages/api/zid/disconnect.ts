import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';
import { dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();

    await db.collection('zid_tokens').doc(uid).delete().catch(() => null);
    await db.collection('stores').doc(uid).set(
      { zid: { connected: false, updatedAt: Date.now() } },
      { merge: true }
    );

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('zid/disconnect error', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
