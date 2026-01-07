// src/pages/api/admin/reviews/hide.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { ReviewService } from '@/server/services';
import { handleApiError, ValidationError } from '@/server/core';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const decoded = await verifyAdmin(req);
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      throw new ValidationError('Missing review ID', 'id');
    }

    const reviewService = new ReviewService();
    await reviewService.hideReview(id, decoded.uid);

    return res.status(200).json({ message: 'Review hidden successfully' });
  } catch (error) {
    handleApiError(res, error);
  }
}
