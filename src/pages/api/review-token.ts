// src/pages/api/review-token.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = String(req.query.token || '').trim();
    const supportService = new SupportService();
    const result = await supportService.getReviewTokenInfo(token);

    if (!result.success) {
      const statusCode = result.error === 'missing_token' ? 400 : 404;
      return res.status(statusCode).json({ error: result.error });
    }

    return res.status(200).json(result.data);
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
}
