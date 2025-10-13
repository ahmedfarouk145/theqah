// src/pages/api/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireUser } from '@/server/auth/requireUser';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();

    // Get status filter from query params
    const statusFilter = req.query.status as string | undefined;

    let query = db
      .collection('reviews')
      .where('storeUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(200);

    // Add status filter if provided
    if (statusFilter && ['pending', 'approved', 'rejected', 'published'].includes(statusFilter)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.where('status', '==', statusFilter) as any;
    }

    const snap = await query.get();

    const reviews = snap.docs.map((d) => {
      const r = d.data();
      return {
        id: d.id,
        ...r,
      };
    });

    return res.status(200).json({ reviews });
  } catch (e) {
    console.error('reviews/index error', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
