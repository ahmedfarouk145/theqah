
// src/pages/api/admin/reports/resolve.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { MaintenanceService } from '@/server/services/maintenance.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

    const { reportId, action } = req.body || {};
    if (!reportId || (action !== 'resolve' && action !== 'delete')) {
      return res.status(400).json({ message: 'Invalid body' });
    }

    const maintenance = new MaintenanceService();
    await maintenance.resolveReport(reportId, action);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('resolve report error', error);
    const msg = (error as Error).message || '';
    if (msg === 'Report not found') return res.status(404).json({ message: msg });
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
