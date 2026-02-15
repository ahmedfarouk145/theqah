import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/server/firebase-admin';

/**
 * Admin utility: Fetch Salla review ID for a specific review and update Firestore.
 * POST /api/_admin/fetch-salla-review-id
 * Body: { reviewDocId, storeUid, orderId }
 * Auth: Bearer CRON_SECRET
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reviewDocId, storeUid, orderId } = req.body;

    if (!reviewDocId || !storeUid || !orderId) {
        return res.status(400).json({ error: 'Missing: reviewDocId, storeUid, orderId' });
    }

    try {
        const db = getDb();

        // Get access token
        const ownerDoc = await db.collection('owners').doc(storeUid).get();
        if (!ownerDoc.exists) {
            return res.status(404).json({ error: `Owner not found: ${storeUid}` });
        }

        const ownerData = ownerDoc.data();
        let accessToken = ownerData?.oauth?.access_token;

        if (!accessToken) {
            // Try token refresh
            const { sallaTokenService } = await import('@/server/services/salla-token.service');
            accessToken = await sallaTokenService.getValidAccessToken(storeUid);
        }

        if (!accessToken) {
            return res.status(500).json({ error: 'No valid access token' });
        }

        // Fetch reviews from Salla API
        const response = await fetch(
            `https://api.salla.dev/admin/v2/reviews?per_page=100`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: 'application/json',
                },
            }
        );

        if (!response.ok) {
            const text = await response.text();
            return res.status(response.status).json({ error: 'Salla API error', status: response.status, body: text });
        }

        const data = await response.json();
        const reviews = data.data || [];

        // Find matching review by orderId
        const matching = reviews.find(
            (r: { order_id?: string | number; type?: string }) => {
                const isProduct = !r.type || r.type === 'rating';
                return isProduct && String(r.order_id) === String(orderId);
            }
        );

        if (!matching) {
            return res.status(404).json({
                error: 'Review not found in Salla API',
                totalReviews: reviews.length,
                searchedOrderId: orderId,
                availableOrderIds: reviews.slice(0, 10).map((r: { order_id?: string | number; id?: string | number }) => ({
                    orderId: r.order_id,
                    reviewId: r.id,
                })),
            });
        }

        // Update Firestore
        await db.collection('reviews').doc(reviewDocId).update({
            sallaReviewId: String(matching.id),
            needsSallaId: false,
            verified: true,
            backfilledAt: new Date().toISOString(),
        });

        return res.status(200).json({
            success: true,
            sallaReviewId: matching.id,
            reviewDocId,
            updated: { verified: true, needsSallaId: false },
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: msg });
    }
}
