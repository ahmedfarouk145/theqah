// src/pages/api/usage/current.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';
import { StoreService } from '@/server/services/store.service';

type UsageData = {
  invitesUsed: number;
  invitesLimit: number;
  percentage: number;
  monthKey: string;
  planCode: string;
  planName: string;
  status: 'safe' | 'warning' | 'critical' | 'exceeded';
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; usage?: UsageData; message?: string }>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed' });
  }

  try {
    const { uid } = await requireUser(req);
    const storeService = new StoreService();
    const usage = await storeService.getUsageStats(uid);

    if (!usage) {
      return res.status(404).json({ ok: false, message: 'Store not found' });
    }

    return res.status(200).json({ ok: true, usage });
  } catch (error) {
    console.error('[USAGE API] Error:', error);
    return res.status(500).json({ ok: false, message: 'Internal server error' });
  }
}
