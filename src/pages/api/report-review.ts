// src/pages/api/report-review.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { SupportService } from '@/server/services/support.service';
import withCors from '@/server/withCors';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const supportService = new SupportService();
  const result = await supportService.reportReview(req.body || {});

  if (!result.success) {
    return res.status(400).json({ message: result.error });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
}

export default withCors(handler);
