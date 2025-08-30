import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireUser } from '@/server/auth/requireUser';

type Review = {
  stars: number;
  comment: string;
  lang: string;
  createdAt: string;
  trustedBuyer: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();

    const snap = await db
      .collection('reviews')
      .where('storeUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const reviews: Review[] = snap.docs.map((d) => {
      const r = d.data() as Record<string, unknown>;
      const createdAtRaw = r.createdAt;
      const createdAt =
        typeof createdAtRaw === 'number'
          ? new Date(createdAtRaw).toISOString()
          : (createdAtRaw as string) || new Date().toISOString();

      return {
        stars: Number(r.stars) || 0,
        comment: (r.comment as string) || '',
        lang: (r.lang as string) || 'ar',
        createdAt,
        trustedBuyer: r.trustedBuyer === true,
      };
    });

    return res.status(200).json({ reviews });
  } catch (e) {
    console.error('reviews/list error', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
