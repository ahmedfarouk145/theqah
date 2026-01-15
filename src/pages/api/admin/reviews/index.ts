// src/pages/api/admin/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { AdminService } from '@/server/services/admin.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const {
      limit,
      storeUid,
      published,
      status,
      stars,
      search,
      sortBy,
      sortOrder,
      cursor,
    } = req.query as Record<string, string>;

    const adminService = new AdminService();
    const result = await adminService.listAdminReviews({
      limit: limit ? parseInt(limit, 10) : undefined,
      storeUid,
      published: published === 'true' ? true : published === 'false' ? false : undefined,
      status,
      stars: stars && !isNaN(Number(stars)) ? Number(stars) : undefined,
      search,
      sortBy,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
      cursor,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Admin reviews API error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
