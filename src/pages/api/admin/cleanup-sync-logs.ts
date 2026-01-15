// src/pages/api/admin/cleanup-sync-logs.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { MaintenanceService } from '@/server/services/maintenance.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const daysOld = parseInt(String(req.body?.daysOld || '60'));

  try {
    const maintenance = new MaintenanceService();
    const result = await maintenance.cleanupSyncLogs(daysOld);

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('[Cleanup] Error during sync logs cleanup:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
