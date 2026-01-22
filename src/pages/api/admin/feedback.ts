// src/pages/api/admin/feedback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { AdminService } from '@/server/services/admin.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Authentication
  const authHeader = req.headers.authorization;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const adminService = new AdminService();

  if (req.method === 'GET') {
    try {
      const { limit = '100', cursor } = req.query;
      const result = await adminService.listFeedback(
        Number(limit) || 100,
        typeof cursor === 'string' ? cursor : undefined
      );
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      return res.status(500).json({ error: 'Failed to fetch feedback' });
    }
  }

  if (req.method === 'PUT') {
    try {
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
    } catch (error) {
      console.error('Error updating feedback:', error);
      return res.status(500).json({ error: 'Failed to update feedback' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id || typeof id !== 'string') {
        return res.status(400).json({ error: 'Feedback ID is required' });
      }
      await adminService.deleteFeedback(id);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error deleting feedback:', error);
      return res.status(500).json({ error: 'Failed to delete feedback' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
