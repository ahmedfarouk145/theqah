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

    // Pagination parameters
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100 items
    const cursor = req.query.cursor as string | undefined;

    let query = db.collection('orders')
      .where('storeUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1); // Fetch one extra to check if there's a next page

    // Apply cursor if provided
    if (cursor) {
      const cursorDoc = await db.collection('orders').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    const orders: OrderDTO[] = docs.map((d) => {
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

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    res.status(200).json({ 
      orders,
      pagination: {
        hasMore,
        nextCursor,
        limit
      }
    });
  } catch {
    res.status(401).json({ message: 'Unauthorized' });
  }
}
