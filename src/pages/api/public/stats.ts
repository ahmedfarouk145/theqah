import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const db = dbAdmin();

    // جلب عدد المتاجر
    const storesSnapshot = await db.collection('stores').count().get();
    const storesCount = storesSnapshot.data().count;

    // جلب عدد التقييمات
    const reviewsSnapshot = await db.collection('reviews').count().get();
    const reviewsCount = reviewsSnapshot.data().count;

    // Cache for 5 minutes (CDN) + 10 minutes stale-while-revalidate
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

    res.status(200).json({
      stores: storesCount,
      reviews: reviewsCount
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
}