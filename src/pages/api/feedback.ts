// src/pages/api/feedback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supportService = new SupportService();
    const result = await supportService.submitFeedback(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ success: true, feedbackId: result.feedbackId });
  } catch (error) {
    console.error('Error processing feedback:', error);
    return res.status(500).json({ error: 'Failed to submit feedback' });
  }
}
