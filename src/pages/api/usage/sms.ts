// src/pages/api/usage/sms.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireUser } from '@/server/auth/requireUser';

/**
 * L10: SMS Cost Estimation API
 * Returns SMS usage stats and estimated costs for the store
 */

// OurSMS pricing (estimated - update with actual pricing)
const SMS_PRICING = {
    local: 0.05,      // SAR per SMS to Saudi numbers
    international: 0.12, // SAR per SMS to international numbers
    currency: 'SAR',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const user = await requireUser(req);
        const storeUid = user.uid;

        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Get period from query (default: current month)
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const days = Number(req.query.days) || 30;
        const startDate = req.query.period === 'month'
            ? startOfMonth
            : Date.now() - (days * 24 * 60 * 60 * 1000);

        // Query metrics for SMS events
        const metricsSnap = await db.collection('metrics')
            .where('type', '==', 'sms_sent')
            .where('storeUid', '==', storeUid)
            .where('timestamp', '>=', startDate)
            .get();

        let totalSent = 0;
        let successful = 0;
        let failed = 0;
        let localSms = 0;
        let internationalSms = 0;

        const dailyUsage: Record<string, { sent: number; success: number; failed: number }> = {};

        metricsSnap.forEach(doc => {
            const data = doc.data();
            const timestamp = data.timestamp;
            const dateKey = new Date(timestamp).toISOString().split('T')[0];
            const to = String(data.metadata?.to || '');

            // Initialize daily record
            if (!dailyUsage[dateKey]) {
                dailyUsage[dateKey] = { sent: 0, success: 0, failed: 0 };
            }

            totalSent++;
            dailyUsage[dateKey].sent++;

            if (data.severity === 'info') {
                successful++;
                dailyUsage[dateKey].success++;

                // Classify by destination
                if (to.startsWith('+966') || to.startsWith('966') || to.startsWith('05')) {
                    localSms++;
                } else if (to) {
                    internationalSms++;
                } else {
                    localSms++; // Default to local if unknown
                }
            } else {
                failed++;
                dailyUsage[dateKey].failed++;
            }
        });

        // Calculate estimated costs
        const estimatedCost = (localSms * SMS_PRICING.local) + (internationalSms * SMS_PRICING.international);

        // Convert daily usage to sorted array
        const daily = Object.entries(dailyUsage)
            .map(([date, data]) => ({
                date,
                ...data,
                cost: data.success * SMS_PRICING.local, // Simplified - all as local
            }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // Calculate projections for the month
        const daysElapsed = Math.ceil((Date.now() - startOfMonth) / (24 * 60 * 60 * 1000));
        const dailyAverage = daysElapsed > 0 ? totalSent / daysElapsed : 0;
        const projectedMonthly = Math.round(dailyAverage * 30);
        const projectedCost = (projectedMonthly * SMS_PRICING.local);

        return res.status(200).json({
            period: {
                days,
                startDate: new Date(startDate).toISOString(),
                isCurrentMonth: req.query.period === 'month',
            },
            summary: {
                totalSent,
                successful,
                failed,
                successRate: totalSent > 0 ? Math.round((successful / totalSent) * 100) : 0,
                localSms,
                internationalSms,
            },
            cost: {
                estimated: Math.round(estimatedCost * 100) / 100,
                currency: SMS_PRICING.currency,
                breakdown: {
                    local: { count: localSms, rate: SMS_PRICING.local, total: Math.round(localSms * SMS_PRICING.local * 100) / 100 },
                    international: { count: internationalSms, rate: SMS_PRICING.international, total: Math.round(internationalSms * SMS_PRICING.international * 100) / 100 },
                },
            },
            projection: {
                dailyAverage: Math.round(dailyAverage * 10) / 10,
                projectedMonthly,
                projectedCost: Math.round(projectedCost * 100) / 100,
            },
            daily,
            pricing: SMS_PRICING,
        });

    } catch (error) {
        console.error('SMS Usage Error:', error);
        return res.status(500).json({ error: 'Failed to fetch SMS usage' });
    }
}
