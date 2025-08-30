// src/pages/api/admin/users.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin } from '@/server/auth/requireAdmin';
import { authAdmin, dbAdmin } from '@/lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await requireAdmin(req);
    const db = dbAdmin();

    if (req.method === 'GET') {
      const { q = '', limit = '50' } = req.query;
      const lim = Math.min(Number(limit) || 50, 200);

      // لو عندك users collection
      let qRef = db.collection('users').limit(lim);

      if (typeof q === 'string' && q.trim()) {
        // فلترة بسيطة على emailLower (يفضّل تخزينه أثناء التسجيل)
        const qLower = q.toLowerCase();
        qRef = db
          .collection('users')
          .where('emailLower', '>=', qLower)
          .where('emailLower', '<=', qLower + '\uf8ff')
          .limit(lim);
      }

      const snap = await qRef.get();
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ users });
    }

    if (req.method === 'POST') {
      const { uid, makeAdmin } = req.body || {};
      if (!uid || typeof makeAdmin !== 'boolean') {
        return res.status(400).json({ message: 'uid/makeAdmin required' });
      }

      const auth = authAdmin();
      await auth.setCustomUserClaims(uid, { admin: makeAdmin });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (e) {
    // استخدام المتغير يُسكت تحذير no-unused-vars ويحتفظ بالأثر للتشخيص
    console.error('Admin users API error:', e);
    return res.status(403).json({ message: 'forbidden' });
  }
}
