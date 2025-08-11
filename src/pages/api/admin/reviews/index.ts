// src/pages/api/admin/reviews/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { getDocs, collection, query, where, orderBy } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req); // ✅ تحقق من الصلاحيات

    const { storeName, stars, published } = req.query;

    const reviewsRef = collection(db, 'reviews');
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filters: any[] = [];

    if (storeName) filters.push(where('storeName', '==', storeName));
    if (stars) filters.push(where('stars', '==', Number(stars)));
    if (published === 'true' || published === 'false') {
      filters.push(where('published', '==', published === 'true'));
    }

    const q =
      filters.length > 0
        ? query(reviewsRef, ...filters, orderBy('createdAt', 'desc'))
        : query(reviewsRef, orderBy('createdAt', 'desc'));

    const snapshot = await getDocs(q);
    const reviews = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).json({ reviews });
  } catch (error) {
    console.error('Admin reviews error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
