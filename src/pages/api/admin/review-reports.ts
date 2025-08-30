import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

type Alert = {
  id: string;
  reason: string;
  reviewId: string;
  createdAt?: number;
  email?: string;
  name?: string;
  resolved?: boolean;
  resolvedAt?: number;
};

// Shape of the document in Firestore
type ReviewReportDoc = {
  reason?: string;
  reviewId?: string;
  createdAt?: FirebaseFirestore.Timestamp | number;
  email?: string;
  name?: string;
  resolved?: boolean;
  resolvedAt?: FirebaseFirestore.Timestamp | number;
};

// Type guard for Firestore Timestamp
function isTimestamp(v: unknown): v is FirebaseFirestore.Timestamp {
  return typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function';
}

// Convert Timestamp | number | unknown -> epoch ms | undefined
function toMillis(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (isTimestamp(v)) return v.toDate().getTime();
  return undefined;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ alerts: Alert[] } | { message: string }>
) {
  try {
    await verifyAdmin(req);
    if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

    const db = dbAdmin();
    const { resolved } = req.query;

    let q: FirebaseFirestore.Query = db.collection('review_reports');

    if (resolved === 'true') {
      q = q.where('resolved', '==', true);
    } else if (resolved === 'false') {
      q = q.where('resolved', '==', false);
    }

    q = q.orderBy('createdAt', 'desc').limit(200);

    const snap = await q.get();
    const alerts: Alert[] = snap.docs.map((d) => {
      const data = d.data() as ReviewReportDoc;

      return {
        id: d.id,
        reason: data.reason ?? '',
        reviewId: data.reviewId ?? '',
        createdAt: toMillis(data.createdAt),
        email: data.email ?? undefined,
        name: data.name ?? undefined,
        resolved: Boolean(data.resolved),
        resolvedAt: toMillis(data.resolvedAt),
      };
    });

    return res.status(200).json({ alerts });
  } catch (error) {
    console.error('review-reports error', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) return res.status(401).json({ message: 'Unauthorized' });
    if (msg.startsWith('permission-denied')) return res.status(403).json({ message: 'Forbidden' });
    return res.status(500).json({ message: 'Server error' });
  }
}
