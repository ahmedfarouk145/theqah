// src/pages/api/admin/reviews/bulk.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { AdminService } from '@/server/services/admin.service';

type BulkAction = 'publish' | 'unpublish' | 'delete' | 'updateNotes';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const decoded = await verifyAdmin(req);
    const { action, reviewIds, moderatorNote, reason } = req.body || {};

    if (!action || !['publish', 'unpublish', 'delete', 'updateNotes'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    if (!Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json({ message: 'reviewIds must be a non-empty array' });
    }

    if (reviewIds.length > 50) {
      return res.status(400).json({ message: 'Cannot process more than 50 items' });
    }

    if (action === 'delete' && (!reason || typeof reason !== 'string' || !reason.trim())) {
      return res.status(400).json({ message: 'Delete action requires a non-empty reason' });
    }

    if (action === 'updateNotes' && (!moderatorNote || typeof moderatorNote !== 'string')) {
      return res.status(400).json({ message: 'updateNotes action requires moderatorNote' });
    }

    const ids = reviewIds.map((id: unknown) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean);
    if (ids.length !== reviewIds.length) {
      return res.status(400).json({ message: 'Some reviewIds are invalid' });
    }

    const adminService = new AdminService();
    const result = await adminService.bulkReviewAction({
      action: action as BulkAction,
      reviewIds: ids,
      adminUid: decoded.uid,
      moderatorNote,
      reason,
      ip: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined,
    });

    return res.status(200).json({
      message: 'Bulk operation completed',
      ...result,
    });
  } catch (error) {
    console.error('Bulk reviews API error:', error);
    if (error instanceof Error) {
      if (error.message.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
      if (error.message.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
      return res.status(400).json({ message: error.message || 'Bad Request' });
    }
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
