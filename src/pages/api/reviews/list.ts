import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { requireUser } from '@/server/auth/requireUser';

type Review = {
  id: string;
  productId?: string;
  stars: number;
  text?: string;
  comment?: string;
  createdAt: number;
  buyerVerified?: boolean;
  status?: 'pending' | 'published' | 'rejected';
};

function toTs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : Date.parse(v);
  }
  return 0;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
  return false;
}

function normalizeReview(docId: string, raw: Record<string, unknown>): Review {
  const id = String(raw['id'] ?? raw['_id'] ?? raw['reviewId'] ?? docId ?? '');
  const productId = (raw['productId'] ?? raw['product_id']) as string | undefined;

  const starsRaw = raw['stars'];
  const starsNum = typeof starsRaw === 'number' ? starsRaw : Number(starsRaw ?? 0);
  const stars = Number.isFinite(starsNum) ? starsNum : 0;

  const createdAt =
    toTs(raw['createdAt'] ?? raw['created'] ?? raw['timestamp'] ?? raw['created_at']) || Date.now();

  const bvCandidate =
    raw['buyerVerified'] ??
    raw['trustedBuyer'] ??
    raw['trusted_buyer'] ??
    raw['buyer_trusted'] ??
    raw['verified'] ??
    raw['isVerified'] ??
    raw['verifiedBuyer'] ??
    raw['buyer_verified'];

  const buyerVerified = toBool(bvCandidate);
  const text = (raw['text'] ?? raw['comment'] ?? '') as string | undefined;
  const comment = (raw['comment'] as string | undefined) ?? undefined;
  const status = raw['status'] as Review['status'] | undefined;

  return { id, productId, stars, text, comment, createdAt, buyerVerified, status };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();

    // Pagination parameters
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100); // Max 100 items
    const cursor = req.query.cursor as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    let query = db
      .collection('reviews')
      .where('storeUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1); // Fetch one extra to check if there's a next page

    // Add status filter if provided
    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      query = query.where('status', '==', statusFilter) as any;
    }

    // Apply cursor if provided
    if (cursor) {
      const cursorDoc = await db.collection('reviews').doc(cursor).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const snap = await query.get();
    const hasMore = snap.docs.length > limit;
    const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

    const reviews: Review[] = docs.map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return normalizeReview(d.id, raw);
    });

    const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

    return res.status(200).json({ 
      reviews,
      pagination: {
        hasMore,
        nextCursor,
        limit
      }
    });
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
