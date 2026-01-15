// src/pages/api/admin/quota.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdminSession } from '@/lib/auth';
import {
  getQuotaStatus,
  getHistoricalQuota,
  isQuotaHealthy,
  cleanupOldQuotaData,
} from '@/server/monitoring/quota-tracker';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await verifyAdminSession(req);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Unauthorized - Admin access required' });
    }

    const { action, days } = req.query;

    if (req.method === 'GET') {
      if (action === 'history') {
        const history = await getHistoricalQuota(days ? parseInt(days as string) : 7);
        return res.status(200).json({ success: true, data: { history, days: days ? parseInt(days as string) : 7 } });
      }
      if (action === 'health') {
        const health = await isQuotaHealthy();
        return res.status(200).json({ success: true, data: health });
      }
      const status = await getQuotaStatus();
      return res.status(200).json({ success: true, data: status });
    }

    if (req.method === 'POST') {
      if (action === 'cleanup') {
        const result = await cleanupOldQuotaData();
        return res.status(200).json({ success: true, message: `Cleaned up ${result.deleted} old quota records`, data: result });
      }
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[API] Quota endpoint error:', error);
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
  }
}
