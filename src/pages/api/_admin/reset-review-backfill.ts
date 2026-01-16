/**
 * Test endpoint to reset a review for backfill testing
 * DELETE after testing!
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getDb } from '@/server/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Basic auth check
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const reviewId = req.query.reviewId as string || req.body?.reviewId;

    if (!reviewId) {
        return res.status(400).json({ error: 'Missing reviewId' });
    }

    try {
        const db = getDb();
        const reviewRef = db.collection('reviews').doc(reviewId);
        const reviewSnap = await reviewRef.get();

        if (!reviewSnap.exists) {
            return res.status(404).json({ error: 'Review not found' });
        }

        const before = reviewSnap.data();

        // Reset for backfill testing
        await reviewRef.update({
            needsSallaId: true,
            sallaReviewId: FieldValue.delete(),
            backfilledAt: FieldValue.delete(),
        });

        return res.status(200).json({
            success: true,
            reviewId,
            before: {
                needsSallaId: before?.needsSallaId,
                sallaReviewId: before?.sallaReviewId,
                backfilledAt: before?.backfilledAt,
            },
            after: {
                needsSallaId: true,
                sallaReviewId: null,
                backfilledAt: null,
            },
            message: 'Review reset for backfill testing. Wait for cron or trigger manually.',
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ error: message });
    }
}
