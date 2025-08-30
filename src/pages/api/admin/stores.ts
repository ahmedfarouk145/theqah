// src/pages/api/admin/stores.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

interface Store {
  id: string;
  name?: string;
  email?: string;
  username?: string;
  connected?: boolean;
  createdAt?: string;
  lastActive?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

interface StoresResponse {
  stores: Store[];
  total: number;   // approximate unless you add counting
  page: number;
  limit: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StoresResponse | { message: string; error?: string }>
) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const db = dbAdmin();

    const {
      page = '1', // kept for backwards compatibility; we use cursor pagination internally
      limit: limitParam = '50',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      filterConnected,
      status,
      cursor, // store id to startAfter
    } = req.query;

    const limitNum = Math.min(100, Math.max(1, parseInt(limitParam as string, 10)));
    const sortDirection = (sortOrder === 'asc' ? 'asc' : 'desc') as FirebaseFirestore.OrderByDirection;
    const searchTerm = (search as string).toLowerCase().trim();
    const pageNum = Math.max(1, parseInt(page as string, 10));

    const validSortFields = ['createdAt', 'name', 'email', 'lastActive'];
    const sortField = validSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt';

    let q: FirebaseFirestore.Query = db.collection('stores');

    if (filterConnected === 'connected') {
      q = q.where('connected', '==', true);
    } else if (filterConnected === 'disconnected') {
      q = q.where('connected', '==', false);
    }

    if (status && ['active', 'inactive', 'suspended'].includes(status as string)) {
      q = q.where('status', '==', status);
    }

    // Simple prefix search on name (requires index & lowercase normalization in data)
    if (searchTerm) {
      q = q.where('name_lower', '>=', searchTerm).where('name_lower', '<=', searchTerm + '\uf8ff');
    }

    q = q.orderBy(sortField, sortDirection).limit(limitNum + 1);

    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('stores').doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snapshot = await q.get();

    let stores: Store[] = snapshot.docs.map((doc) => {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc.data() as any;
      const createdAt =
        data.createdAt?.toDate?.()?.toISOString?.() ?? (typeof data.createdAt === 'string' ? data.createdAt : undefined);
      const lastActive =
        data.lastActive?.toDate?.()?.toISOString?.() ?? (typeof data.lastActive === 'string' ? data.lastActive : undefined);
      return {
        id: doc.id,
        name: data.name,
        email: data.email,
        username: data.username,
        connected: Boolean(data.connected),
        createdAt,
        lastActive,
        status: data.status || 'active',
      };
    });

    const hasMore = stores.length > limitNum;
    let nextCursor: string | null = null;
    if (hasMore) {
      const last = snapshot.docs[limitNum];
      nextCursor = last?.id ?? null;
      stores = stores.slice(0, limitNum);
    }

    // (optional) extra client-side filter for search if you don't have name_lower in DB
    // if (searchTerm) { ... }

    const response: StoresResponse = {
      stores,
      total: pageNum === 1 ? stores.length + (hasMore ? 1 : 0) : -1,
      page: pageNum,
      limit: limitNum,
      hasMore,
      nextCursor,
    };

    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json(response);
  } catch (error) {
    console.error('Admin Stores API Error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'غير مصرح لك بالوصول لهذه البيانات', error: 'Forbidden' });
    }
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
