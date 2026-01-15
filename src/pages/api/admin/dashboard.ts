// src/pages/api/admin/dashboard.ts
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
    const stats = await adminService.getDashboardStats();

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json(stats);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Admin Dashboard Error:', err);
    if (err.message?.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    }
    if (err.message?.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
