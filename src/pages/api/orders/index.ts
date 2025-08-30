// src/pages/api/orders/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireUser } from '@/server/auth/requireUser';

type OrderDoc = {
  name?: string;
  phone?: string;
  email?: string;
  createdAt?: number | string;
  reviewSent?: boolean;
  storeUid: string;
};

type OrderDTO = {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: number;
  sent: boolean;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();

    const snap = await db.collection('orders')
      .where('storeUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const orders: OrderDTO[] = snap.docs.map((d) => {
      const x = d.data() as OrderDoc;
      const created =
        typeof x.createdAt === 'number'
          ? x.createdAt
          : (typeof x.createdAt === 'string' ? Date.parse(x.createdAt) : Date.now());
      return {
        id: d.id,
        name: x.name || '',
        phone: x.phone || '',
        email: x.email || '',
        createdAt: Number.isFinite(created) ? created : Date.now(),
        sent: !!x.reviewSent,
      };
    });

    res.status(200).json({ orders });
  } catch (e) {
    console.error('orders list error', e);
    res.status(401).json({ message: 'Unauthorized' });
  }
}
