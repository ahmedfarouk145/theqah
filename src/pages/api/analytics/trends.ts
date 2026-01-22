// src/pages/api/analytics/trends.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';

/**
 * L8: Review Analytics Trends API
 * Returns daily/weekly review counts and rating trends for the store
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const user = await requireUser(req);
        const storeUid = user.uid;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Get period from query (default: 30 days)
        const days = Math.min(Number(req.query.days) || 30, 90);
        const startDate = Date.now() - (days * 24 * 60 * 60 * 1000);

        // Fetch reviews for the store in the period
        const reviewsSnap = await db.collection('reviews')
            .where('storeUid', '==', storeUid)
            .where('createdAt', '>=', startDate)
            .orderBy('createdAt', 'desc')
            .get();

        // Group by date
        const dailyData: Record<string, { count: number; totalStars: number; ratings: number[] }> = {};
        const weeklyData: Record<string, { count: number; totalStars: number }> = {};

        let totalReviews = 0;
        let totalStars = 0;
        const starsDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        reviewsSnap.forEach(doc => {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt);
            const dateKey = createdAt.toISOString().split('T')[0]; // YYYY-MM-DD
            const weekKey = getWeekKey(createdAt);
            const stars = Number(data.stars) || 0;

            // Daily aggregation
            if (!dailyData[dateKey]) {
                dailyData[dateKey] = { count: 0, totalStars: 0, ratings: [] };
            }
            dailyData[dateKey].count++;
            dailyData[dateKey].totalStars += stars;
            dailyData[dateKey].ratings.push(stars);

            // Weekly aggregation
            if (!weeklyData[weekKey]) {
                weeklyData[weekKey] = { count: 0, totalStars: 0 };
            }
            weeklyData[weekKey].count++;
            weeklyData[weekKey].totalStars += stars;

            // Totals
            totalReviews++;
            totalStars += stars;
            if (stars >= 1 && stars <= 5) {
                starsDistribution[stars as 1 | 2 | 3 | 4 | 5]++;
            }
        });

        // Convert to arrays sorted by date
        const daily = Object.entries(dailyData)
            .map(([date, data]) => ({
                date,
                count: data.count,
                averageRating: data.count > 0 ? Math.round((data.totalStars / data.count) * 10) / 10 : 0,
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        const weekly = Object.entries(weeklyData)
            .map(([week, data]) => ({
                week,
                count: data.count,
                averageRating: data.count > 0 ? Math.round((data.totalStars / data.count) * 10) / 10 : 0,
            }))
            .sort((a, b) => a.week.localeCompare(b.week));

        // Calculate trends
        const trend = calculateTrend(daily);

        return res.status(200).json({
            period: { days, startDate: new Date(startDate).toISOString() },
            summary: {
                totalReviews,
                averageRating: totalReviews > 0 ? Math.round((totalStars / totalReviews) * 10) / 10 : 0,
                reviewsPerDay: totalReviews > 0 ? Math.round((totalReviews / days) * 10) / 10 : 0,
                trend,
            },
            starsDistribution: Object.entries(starsDistribution).map(([stars, count]) => ({
                stars: Number(stars),
                count,
                percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
            })),
            daily,
            weekly,
        });

    } catch (error) {
        console.error('Analytics Trends Error:', error);
        return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}

// Get ISO week key (YYYY-WXX format)
function getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const weekNum = getWeekNumber(date);
    return `${year}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Calculate if trending up, down, or stable
function calculateTrend(daily: Array<{ count: number }>): 'up' | 'down' | 'stable' {
    if (daily.length < 7) return 'stable';

    const recent = daily.slice(-7).reduce((sum, d) => sum + d.count, 0);
    const previous = daily.slice(-14, -7).reduce((sum, d) => sum + d.count, 0);

    if (previous === 0) return recent > 0 ? 'up' : 'stable';

    const change = ((recent - previous) / previous) * 100;

    if (change > 10) return 'up';
    if (change < -10) return 'down';
    return 'stable';
}
