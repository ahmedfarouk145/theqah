// src/pages/api/feedback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';
import { rateLimitPublic, RateLimitPresets } from '@/server/rate-limit-public';
import { handleApiError } from '@/server/core/error-handler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // C6: Rate limit feedback submissions - 10 requests per 5 minutes per IP
  const limited = await rateLimitPublic(req, res, {
    maxRequests: 10,
    windowMs: 5 * 60 * 1000,
    identifier: 'feedback-submit',
    message: 'Too many feedback submissions. Please wait a few minutes.',
  });
  if (limited) return;

  try {
    const supportService = new SupportService();
    const result = await supportService.submitFeedback(req.body);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({ success: true, feedbackId: result.feedbackId });
  } catch (error) {
    // C5: Centralized error handling
    handleApiError(res, error);
  }
}

