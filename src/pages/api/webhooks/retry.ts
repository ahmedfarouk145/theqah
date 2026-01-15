// src/pages/api/webhooks/retry.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  manualRetryWebhook,
  resolveDLQEntry,
  getRetryQueueStatus,
  getDLQStatus,
  checkRetrySystemHealth,
} from '@/server/queue/webhook-retry';
import { verifyAdminSession } from '@/server/auth-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await verifyAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user?.uid || 'unknown';

  if (req.method === 'GET') {
    const action = req.query.action as string;

    if (action === 'status') {
      return res.status(200).json(await getRetryQueueStatus());
    }
    if (action === 'dlq_status') {
      return res.status(200).json(await getDLQStatus());
    }
    if (action === 'health') {
      return res.status(200).json(await checkRetrySystemHealth());
    }
    return res.status(400).json({ error: 'Invalid action' });
  }

  if (req.method === 'POST') {
    const action = req.query.action as string;

    if (action === 'resolve') {
      const { dlqId, resolution, notes } = req.body;
      if (!dlqId || !resolution) {
        return res.status(400).json({ error: 'Missing dlqId or resolution' });
      }
      if (!['ignored', 'manual_fix'].includes(resolution)) {
        return res.status(400).json({ error: 'Invalid resolution type' });
      }
      const result = await resolveDLQEntry(dlqId, userId, resolution, notes);
      return result.ok
        ? res.status(200).json({ ok: true, message: 'DLQ entry resolved' })
        : res.status(500).json({ ok: false, error: result.error });
    }

    const { dlqId } = req.body;
    if (!dlqId) {
      return res.status(400).json({ error: 'Missing dlqId' });
    }
    const result = await manualRetryWebhook(dlqId, userId);
    return result.ok
      ? res.status(200).json({ ok: true, message: 'Webhook retry initiated' })
      : res.status(500).json({ ok: false, error: result.error });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
