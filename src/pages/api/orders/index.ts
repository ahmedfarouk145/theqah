// src/pages/api/orders/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireStore, StoreNotLinkedError } from '@/server/auth/resolveStoreUid';
import { OrderService } from '@/server/services/order.service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { storeUid } = await requireStore(req);

    const orderService = new OrderService();
    const result = await orderService.listWithPagination(storeUid, {
      limit: Math.min(parseInt(req.query.limit as string) || 50, 100),
      cursor: req.query.cursor as string | undefined,
    });

    res.status(200).json(result);
  } catch (e) {
    if (e instanceof StoreNotLinkedError) {
      return res.status(200).json({ orders: [], total: 0, storeNotLinked: true });
    }
    res.status(401).json({ message: 'Unauthorized' });
  }
}
