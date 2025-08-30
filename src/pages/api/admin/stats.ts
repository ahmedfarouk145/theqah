// src/pages/api/admin/stats.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { verifyAdmin } from '@/utils/verifyAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    if (req.method !== 'GET') {
      return res.status(405).json({ message: 'Method not allowed' });
    }

    const db = dbAdmin();

    const [
      storesSnap,
      reviewsSnap,
      alertsSnap,
      publishedReviewsSnap,
      unresolvedAlertsSnap,
      recentReviewsSnap
    ] = await Promise.all([
      db.collection('stores').get(),
      db.collection('reviews').get(),
      db.collection('review_reports').get(),
      db.collection('reviews').where('published', '==', true).get(),
      db.collection('review_reports').where('resolved', '==', false).get(),
      db.collection('reviews').orderBy('createdAt', 'desc').limit(10).get(),
    ]);

    const totalStores = storesSnap.size;
    const totalReviews = reviewsSnap.size;
    const totalAlerts = alertsSnap.size;
    const publishedReviews = publishedReviewsSnap.size;
    const pendingReviews = totalReviews - publishedReviews;
    const unresolvedAlerts = unresolvedAlertsSnap.size;

    let averageRating = 0;
    const starsDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    if (reviewsSnap.size > 0) {
      let totalStars = 0;
      reviewsSnap.forEach((doc) => {
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = doc.data() as any;
        const stars = Number(data.stars) || 0;
        totalStars += stars;
        if (stars >= 1 && stars <= 5) starsDistribution[stars] = (starsDistribution[stars] || 0) + 1;
      });
      averageRating = Math.round((totalStars / reviewsSnap.size) * 10) / 10;
    }

    const publishRate = totalReviews > 0 ? Math.round((publishedReviews / totalReviews) * 100) : 0;
    const alertRate = totalReviews > 0 ? Math.round((totalAlerts / totalReviews) * 100) : 0;
    const averageReviewsPerStore = totalStores > 0 ? Math.round(totalReviews / totalStores) : 0;

    const reviewStatusData = [
      { name: 'منشورة', value: publishedReviews, percentage: publishRate },
      { name: 'معلقة', value: pendingReviews, percentage: 100 - publishRate },
    ];
    const alertStatusData = [
      { name: 'محلولة', value: totalAlerts - unresolvedAlerts },
      { name: 'غير محلولة', value: unresolvedAlerts },
    ];

    const recentActivities = recentReviewsSnap.docs.slice(0, 5).map((doc) => {
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = doc.data() as any;
      return {
        id: doc.id,
        type: 'review',
        storeName: data.storeName,
        stars: data.stars,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt || null,
        published: data.published,
      };
    });

    const stats = {
      totalStores,
      totalReviews,
      totalAlerts,
      publishedReviews,
      pendingReviews,
      unresolvedAlerts,

      averageRating,
      publishRate,
      alertRate,
      averageReviewsPerStore,

      reviewStatusData,
      alertStatusData,
      starsDistribution: Object.entries(starsDistribution).map(([stars, count]) => ({
        stars: Number(stars),
        count: Number(count),
        percentage: totalReviews > 0 ? Math.round((Number(count) / totalReviews) * 100) : 0,
      })),

      recentActivities,
      lastUpdated: new Date().toISOString(),

      insights: {
        topPerformingMetric:
          publishRate > 80
            ? 'معدل نشر عالي'
            : alertRate < 5
              ? 'معدل بلاغات منخفض'
              : averageRating > 4
                ? 'تقييمات إيجابية'
                : 'يحتاج تحسين',
        recommendation:
          publishRate < 50
            ? 'ينصح بمراجعة التقييمات المعلقة'
            : unresolvedAlerts > 10
              ? 'ينصح بمعالجة البلاغات المعلقة'
              : totalStores < totalReviews / 10
                ? 'فرصة لإضافة المزيد من المتاجر'
                : 'الأداء جيد، استمر!',
        healthScore: Math.round(
          (publishRate * 0.4) +
          (Math.max(0, 100 - alertRate * 2) * 0.3) +
          (Math.min(100, averageRating * 20) * 0.3)
        ),
      },
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Admin Stats Error:', error);
    const msg = (error as Error).message || '';
    if (msg.startsWith('unauthenticated')) {
      return res.status(401).json({ message: 'غير مصرح', error: 'Unauthorized' });
    }
    if (msg.startsWith('permission-denied')) {
      return res.status(403).json({ message: 'ليس لديك صلاحية', error: 'Forbidden' });
    }
    return res.status(500).json({
      message: 'خطأ داخلي في الخادم',
      error: 'Internal Server Error',
    });
  }
}
