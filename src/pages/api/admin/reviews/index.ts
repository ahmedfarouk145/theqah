// src/pages/api/admin/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { mapReview, ReviewOut } from '@/utils/mapReview';

type ReviewsResponse = {
  reviews: ReviewOut[];
  total: number;
  published: number;
  pending: number;
  averageRating: number;
  hasMore: boolean;
  nextCursor?: string | null;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReviewsResponse | { message: string; error?: string }>
) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const db = dbAdmin();

    const {
      limit: limitParam = '20',
      storeUid,                 // filter by store uid
      published,                // 'true' | 'false'
      status,                   // e.g. 'published' | 'pending' | 'hidden'
      stars,                    // exact int
      search,                   // client-side contains
      sortBy = 'createdAt',
      sortOrder = 'desc',
      cursor                    // review doc id (top-level)
    } = req.query as Record<string, string>;

    const limitNum = Math.min(100, Math.max(1, parseInt(String(limitParam), 10)));
    const sortField = ['createdAt','stars','storeName','lastModified','publishedAt'].includes(String(sortBy))
      ? String(sortBy) : 'createdAt';
    const sortDirection: FirebaseFirestore.OrderByDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    const searchTerm = (search || '').toLowerCase().trim();

    // لو مراجعاتك nested تحت stores/*/reviews استخدم collectionGroup بدلاً من collection
    let q: FirebaseFirestore.Query = db.collection('reviews');
    // let q: FirebaseFirestore.Query = db.collectionGroup('reviews');

    if (storeUid) q = q.where('storeUid', '==', storeUid);
    if (stars && !isNaN(Number(stars))) q = q.where('stars', '==', Number(stars));
    if (status) q = q.where('status', '==', status);
    if (published === 'true') q = q.where('published', '==', true);
    else if (published === 'false') q = q.where('published', '==', false);

    q = q.orderBy(sortField, sortDirection);
    if (sortField !== 'createdAt') q = q.orderBy('createdAt', 'desc');

    q = q.limit(limitNum + 1);

    if (cursor) {
      const cursorDoc = await db.collection('reviews').doc(cursor).get();
      if (cursorDoc.exists) q = q.startAfter(cursorDoc);
    }

    const snap = await q.get();

    // جمع storeUids لعمل join سريع
    const rowsRaw = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    const storeUids = Array.from(new Set(rowsRaw.map(r => r.data?.storeUid).filter(Boolean)));
    const storeNameMap = new Map<string, string>();

    await Promise.all(storeUids.map(async (uid) => {
      let sDoc = await db.collection('stores').doc(uid).get();
      if (!sDoc.exists) {
        const qs = await db.collection('stores').where('uid', '==', uid).limit(1).get();
        sDoc = qs.docs[0];
      }
      const s = sDoc?.data() || {};
      const name = s?.salla?.storeName || s?.zid?.storeName || s?.storeName || 'غير محدد';
      storeNameMap.set(uid, name);
    }));

    let reviews = rowsRaw.map(r => mapReview(r.id, r.data, storeNameMap.get(r.data?.storeUid) || 'غير محدد'));

    if (searchTerm) {
      reviews = reviews.filter((r) =>
        [r.storeName, r.text, r.status].filter(Boolean).join(' ').toLowerCase().includes(searchTerm)
      );
    }

    const hasMore = !searchTerm && reviews.length > limitNum;
    const nextCursor = hasMore ? snap.docs[limitNum]?.id ?? null : null;
    reviews = reviews.slice(0, limitNum);

    const total = reviews.length;
    const publishedCount = reviews.filter((r) => r.published).length;
    const pendingCount = total - publishedCount;
    const avg = total ? Math.round((reviews.reduce((s, r) => s + (r.stars || 0), 0) / total) * 10) / 10 : 0;

    return res.status(200).json({
      reviews,
      total,
      published: publishedCount,
      pending: pendingCount,
      averageRating: avg,
      hasMore,
      nextCursor,
    });//eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error('Admin reviews API error:', error);
    const msg = error?.message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'ليس لديك صلاحية للوصول', error: 'Forbidden' });
    return res.status(500).json({ message: 'خطأ داخلي في الخادم', error: 'Internal Server Error' });
  }
}
