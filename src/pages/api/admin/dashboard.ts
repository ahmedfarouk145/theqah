//src/pages/api/admin/dashboard.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { getDocs, collection } from 'firebase/firestore';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const storesSnap = await getDocs(collection(db, 'stores'));
    const reviewsSnap = await getDocs(collection(db, 'reviews'));
    const alertsSnap = await getDocs(collection(db, 'review_reports'));

    return res.status(200).json({
      totalStores: storesSnap.size,
      totalReviews: reviewsSnap.size,
      totalAlerts: alertsSnap.size,
    });
  } catch (error) {
    console.error('Admin Dashboard Error:', error);
    return res.status(401).json({ message: (error as Error).message || 'Unauthorized' });
  }
}
