// src/pages/api/orders/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';
import { OrderService } from '@/server/services/order.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);

    const orderService = new OrderService();
    const result = await orderService.listWithPagination(uid, {
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
      cursor: req.query.cursor as string | undefined,
    });

    res.status(200).json(result);
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
}
