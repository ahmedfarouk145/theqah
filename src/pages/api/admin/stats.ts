// src/pages/api/admin/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { AdminService } from '@/server/services/admin.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const adminService = new AdminService();
    const stats = await adminService.getDetailedStats();

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Admin Stats Error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    }
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
