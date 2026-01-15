// src/pages/api/reviews/list.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';
import { ReviewService } from '@/server/services/review.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);

    const reviewService = new ReviewService();
    const result = await reviewService.listWithFilters(uid, {
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
      cursor: req.query.cursor as string | undefined,
      status: req.query.status as string | undefined,
    });

    return res.status(200).json(result);
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
