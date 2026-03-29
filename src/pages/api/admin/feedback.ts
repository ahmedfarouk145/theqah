// src/pages/api/admin/feedback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { AdminService } from '@/server/services/admin.service';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    const adminService = new AdminService();

    if (req.method === 'GET') {
      const { limit = '100', cursor } = req.query;
      const result = await adminService.listFeedback(
        Number(limit) || 100,
        typeof cursor === 'string' ? cursor : undefined
      );
      return res.status(200).json({
        ...result,
        feedbacks: result.feedback,
      });
    }

    if (req.method === 'PUT') {
      const { feedbackId, status, notes } = req.body;
      if (!feedbackId || !status) {
        return res.status(400).json({ error: 'feedbackId and status are required' });
      }
      const validStatuses = ['new', 'reviewed', 'resolved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      await adminService.updateFeedbackStatus(feedbackId, status, notes);
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Feedback ID is required' });
      }
      await adminService.deleteFeedback(id);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[feedback] error:', err);

    if (err.message.startsWith('permission-denied')) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية' });
    }

    if (err.message.startsWith('unauthenticated')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'غير مصرح' });
    }

    return res.status(500).json({ error: 'Failed to handle feedback', message: err.message });
  }
}
