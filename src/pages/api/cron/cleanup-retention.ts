import type { NextApiRequest, NextApiResponse } from 'next';
import { MaintenanceService } from '@/server/services/maintenance.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const maintenance = new MaintenanceService();
    const result = await maintenance.cleanupRetentionArtifacts();
    return res.status(200).json({ ok: true, result });
  } catch (error) {
    console.error('[RETENTION_CLEANUP] Error:', error);
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
