// src/pages/api/admin/review-reports.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { MaintenanceService } from '@/server/services/maintenance.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const { resolved } = req.query;
    const maintenance = new MaintenanceService();
    const alerts = await maintenance.listReviewReports(
      resolved === 'true' ? true : resolved === 'false' ? false : undefined
    );

    return res.status(200).json({ alerts });
  } catch (error) {
    console.error('review-reports error', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
