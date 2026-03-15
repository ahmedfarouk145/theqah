import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/server/firebase-admin';
import type { Review } from '@/server/core/types';
import { sallaTokenService } from '@/server/services/salla-token.service';
import { sallaReviewIdLookupService } from '@/server/services/salla-review-id-lookup.service';

export const config = {
    maxDuration: 300,
};

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

    if (!reviewDocId) {
        return res.status(400).json({ error: 'Missing: reviewDocId' });
    }

    try {
        const db = getDb();
        const reviewDoc = await db.collection('reviews').doc(reviewDocId).get();
        const reviewData = reviewDoc.exists ? reviewDoc.data() as Partial<Review> : undefined;
        const resolvedStoreUid = typeof reviewData?.storeUid === 'string' && reviewData.storeUid
            ? reviewData.storeUid
            : storeUid;
        const resolvedOrderId = typeof reviewData?.orderId === 'string' && reviewData.orderId
            ? reviewData.orderId
            : orderId;

        if (!resolvedStoreUid || !resolvedOrderId) {
            return res.status(400).json({ error: 'Missing storeUid/orderId context for review lookup' });
        }

        // Get access token using the token service (handles refresh too)
        const accessToken = await sallaTokenService.getValidAccessToken(resolvedStoreUid);

        if (!accessToken) {
            return res.status(500).json({ error: `No valid access token for ${resolvedStoreUid}` });
        }

        const matching = await sallaReviewIdLookupService.findMatchForReview({
            accessToken,
            storeUid: resolvedStoreUid,
            review: {
                reviewId: reviewDocId,
                orderId: String(resolvedOrderId),
                productId: reviewData?.productId,
                stars: reviewData?.stars,
                text: reviewData?.text,
            },
        });

        if (!matching) {
            return res.status(404).json({
                error: 'Review not found in Salla API after pagination',
                searchedOrderId: resolvedOrderId,
                storeUid: resolvedStoreUid,
            });
        }

        // Update Firestore
        await db.collection('reviews').doc(reviewDocId).update({
            sallaReviewId: matching.sallaReviewId,
            needsSallaId: false,
            verified: true,
            backfilledAt: new Date().toISOString(),
        });

        return res.status(200).json({
            success: true,
            sallaReviewId: matching.sallaReviewId,
            reviewDocId,
            pageFound: matching.pageFound,
            updated: { verified: true, needsSallaId: false },
        });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: msg });
    }
}
