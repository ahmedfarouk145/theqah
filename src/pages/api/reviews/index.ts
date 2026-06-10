// src/pages/api/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireStore, StoreNotLinkedError } from '@/server/auth/resolveStoreUid';
import { ExportService } from '@/server/services/export.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { storeUid } = await requireStore(req);
    const statusFilter = req.query.status as string | undefined;

    const exportService = new ExportService();
    const result = await exportService.getReviewsList(storeUid, statusFilter);

    if (!result.storeUid) {
      return res.status(200).json({ reviews: [], message: 'No store linked' });
    }

    return res.status(200).json({ reviews: result.reviews });
  } catch (e) {
    if (e instanceof StoreNotLinkedError) {
      return res.status(200).json({ reviews: [], storeNotLinked: true });
    }
    console.error('reviews/index error', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
