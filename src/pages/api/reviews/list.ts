// src/pages/api/reviews/list.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireStore, StoreNotLinkedError } from '@/server/auth/resolveStoreUid';
import { ReviewService } from '@/server/services/review.service';

/**
 * M12: Added search parameter
 * M13: Added date range filtering (startDate, endDate)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    // Resolve the logged-in user to their store (the login uid is NOT the storeUid).
    const { storeUid } = await requireStore(req);

    const reviewService = new ReviewService();
    const result = await reviewService.listWithFilters(storeUid, {
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
      cursor: req.query.cursor as string | undefined,
      status: req.query.status as string | undefined,
      // M12: Search in customer name, content, product name
      search: req.query.search as string | undefined,
      // M13: Date range filtering
      startDate: req.query.startDate ? Number(req.query.startDate) : undefined,
      endDate: req.query.endDate ? Number(req.query.endDate) : undefined,
      // Additional filters
      stars: req.query.stars ? Number(req.query.stars) : undefined,
      productId: req.query.productId as string | undefined,
    });

    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof StoreNotLinkedError) {
      // Authenticated, but this login isn't linked to a store yet. Surface a
      // clear, empty state instead of a silently-empty list or a 401.
      return res.status(200).json({
        reviews: [],
        pagination: { hasMore: false, nextCursor: null, limit: 0 },
        storeNotLinked: true,
      });
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
