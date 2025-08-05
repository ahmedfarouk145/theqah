import type { NextApiRequest, NextApiResponse } from 'next';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { verifyStore } from '@/utils/verifyStore';

interface StoreRequest extends NextApiRequest {
  storeId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const errorHandled = await verifyStore(req, res);
  if (errorHandled) return; // إذا كان هناك خطأ، نوقف التنفيذ

  const typedReq = req as StoreRequest;

  if (typedReq.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const storeId = typedReq.storeId;

    // الحصول على الطلبات والتقييمات من Firestore
    const ordersSnapshot = await getDocs(
      query(collection(db, 'orders'), where('storeId', '==', storeId))
    );
    const reviewsSnapshot = await getDocs(
      query(collection(db, 'reviews'), where('storeId', '==', storeId))
    );

    const totalOrders = ordersSnapshot.size;
    const totalReviews = reviewsSnapshot.size;

    const positiveReviews = reviewsSnapshot.docs.filter(doc => doc.data().stars >= 4).length;
    const positiveRate = totalReviews > 0 ? Math.round((positiveReviews / totalReviews) * 100) : 0;

    // تحويل الطلبات حسب الشهر
    const ordersByMonth: Record<string, number> = {};
    ordersSnapshot.docs.forEach(doc => {
      const createdAt = doc.data().createdAt;
      if (!createdAt) return;
      const date = new Date(createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      ordersByMonth[month] = (ordersByMonth[month] || 0) + 1;
    });

    const ordersChart = Object.entries(ordersByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    // تحويل التقييمات حسب الشهر: إيجابية وسلبية
    const reviewsByMonth: Record<string, { positive: number; negative: number }> = {};
    reviewsSnapshot.docs.forEach(doc => {
      const { createdAt, stars } = doc.data();
      if (!createdAt || typeof stars !== 'number') return;

      const date = new Date(createdAt);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!reviewsByMonth[month]) reviewsByMonth[month] = { positive: 0, negative: 0 };
      if (stars >= 4) reviewsByMonth[month].positive += 1;
      else reviewsByMonth[month].negative += 1;
    });

    const reviewsChart = Object.entries(reviewsByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { positive, negative }]) => ({ month, positive, negative }));

    return res.status(200).json({
      totalOrders,
      totalReviews,
      positiveRate,
      ordersChart,
      reviewsChart,
    });
  } catch (err) {
    console.error('Dashboard Error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
