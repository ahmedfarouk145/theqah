// src/pages/api/admin/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

interface Review {
  id: string;
  name?: string;
  comment?: string;
  stars?: number;
  storeName?: string;
  published?: boolean;
  createdAt?: string;
  lastModified?: string;
  moderatorNote?: string;
}

interface ReviewsResponse {
  reviews: Review[];
  total: number;
  published: number;
  pending: number;
  averageRating: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReviewsResponse | { message: string; error?: string }>
) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const db = dbAdmin();

    const {
      limit: limitParam = '20',
      storeName,
      stars,
      published,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      cursor // review id to startAfter
    } = req.query;

    const limitNum = Math.min(100, Math.max(1, parseInt(limitParam as string, 10)));
    const sortDirection = (sortOrder === 'asc' ? 'asc' : 'desc') as FirebaseFirestore.OrderByDirection;
    const searchTerm = (search as string | undefined)?.toLowerCase().trim();

    const validSortFields = ['createdAt', 'stars', 'name', 'storeName', 'lastModified'];
    const sortField = (validSortFields.includes(sortBy as string) ? (sortBy as string) : 'createdAt');

    let q: FirebaseFirestore.Query = db.collection('reviews');

    if (storeName && typeof storeName === 'string') {
      q = q.where('storeName', '==', storeName);
    }
    if (stars && !isNaN(Number(stars))) {
      q = q.where('stars', '==', Number(stars));
    }
    if (published === 'true') {
      q = q.where('published', '==', true);
    } else if (published === 'false') {
      q = q.where('published', '==', false);
    }

    q = q.orderBy(sortField, sortDirection);
    if (sortField !== 'createdAt') {
      // secondary order to stabilize
      q = q.orderBy('createdAt', 'desc');
    }

    q = q.limit(limitNum + 1);

    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('reviews').doc(cursor).get();
      if (cursorDoc.exists) {
        q = q.startAfter(cursorDoc);
      }
    }

    const snap = await q.get();

    let reviews = snap.docs.map((doc) => {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = doc.data() as any;
      const createdAt =
        d.createdAt?.toDate?.()?.toISOString?.() ?? (typeof d.createdAt === 'string' ? d.createdAt : undefined);
      const lastModified =
        d.lastModified?.toDate?.()?.toISOString?.() ?? (typeof d.lastModified === 'string' ? d.lastModified : undefined);
      return {
        id: doc.id,
        name: d.name ?? 'مجهول',
        comment: d.comment ?? '',
        stars: d.stars ?? 0,
        storeName: d.storeName ?? 'غير محدد',
        published: Boolean(d.published),
        createdAt,
        lastModified,
        moderatorNote: d.moderatorNote,
      } as Review;
    });

    const hasMore = reviews.length > limitNum;
    let nextCursor: string | null = null;
    if (hasMore) {
      const last = snap.docs[limitNum];
      nextCursor = last?.id ?? null;
      reviews = reviews.slice(0, limitNum);
    }

    if (searchTerm) {
      reviews = reviews.filter((r) => {
        const text = [r.name, r.comment, r.storeName, r.moderatorNote].filter(Boolean).join(' ').toLowerCase();
        return text.includes(searchTerm);
      });
    }

    const total = reviews.length;
    const publishedCount = reviews.filter((r) => r.published).length;
    const pendingCount = reviews.filter((r) => !r.published).length;
    const avg = total ? reviews.reduce((s, r) => s + (r.stars ?? 0), 0) / total : 0;

    return res.status(200).json({
      reviews,
      total,
      published: publishedCount,
      pending: pendingCount,
      averageRating: Math.round(avg * 10) / 10,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error('Admin reviews API error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية للوصول', error: 'Forbidden' });
    }
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
