// src/pages/api/zid/sync-reviews.ts
// Sync reviews from Zid API - like Salla's reviews sync
// Called by cron job or manually to fetch and save reviews

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { fetchZidReviews, ZidReview } from '@/lib/zid/client';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

interface ReviewDocument {
    id: string;
    zidReviewId: number;
    productId: string;
    productName: string | null;
    rating: number;
    customerName: string;
    customerId: string | null;
    comment: string;
    source: 'zid_native';
    platform: 'zid';
    storeUid: string;
    verified: boolean;
    status: string;
    createdAt: number;
    updatedAt: number;
    syncedAt: number;
}

/**
 * Check if review was created after subscription started
 */
function isVerifiedReview(
    reviewCreatedAt: string,
    subscriptionStartedAt: number | undefined
): boolean {
    if (!subscriptionStartedAt) return false;
    const reviewTime = new Date(reviewCreatedAt).getTime();
    return reviewTime >= subscriptionStartedAt;
}

/**
 * Map Zid review to our review schema
 */
function mapZidReview(
    review: ZidReview,
    storeUid: string,
    subscriptionStartedAt: number | undefined
): ReviewDocument {
    const verified = isVerifiedReview(review.created_at, subscriptionStartedAt);

    return {
        id: `zid_${review.id}`,
        zidReviewId: review.id,
        productId: String(review.product_id),
        productName: review.product_name ?? null,
        rating: review.rating,
        customerName: review.customer?.name || 'عميل',
        customerId: review.customer?.id ? String(review.customer.id) : null,
        comment: review.comment || '',
        source: 'zid_native',
        platform: 'zid',
        storeUid,
        verified,
        status: review.status,
        createdAt: new Date(review.created_at).getTime(),
        updatedAt: new Date(review.updated_at).getTime(),
        syncedAt: Date.now(),
    };
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Auth check - either cron secret or admin auth
    const authHeader = req.headers.authorization;
    const cronHeader = req.headers['x-cron-secret'];

    if (cronHeader !== CRON_SECRET && !authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { storeUid, managerToken, page = 1, perPage = 50
    } = req.body as {
        storeUid?: string;
        managerToken?: string;
        page?: number;
        perPage?: number;
    };

    if (!storeUid || !managerToken) {
        return res.status(400).json({ error: 'storeUid and managerToken required' });
    }

    const db = dbAdmin();

    try {
        // Get store subscription info for verification logic
        const storeDoc = await db.collection('stores').doc(storeUid).get();
        const storeData = storeDoc.data();
        const subscriptionStartedAt = storeData?.zid?.subscription?.startedAt as number | undefined;

        // Fetch reviews from Zid API
        const reviewsResponse = await fetchZidReviews(managerToken, {
            page,
            per_page: perPage,
            status: 'approved', // Only sync approved reviews
        });

        const zidReviews = reviewsResponse.reviews ?? reviewsResponse.data ?? [];

        if (zidReviews.length === 0) {
            return res.status(200).json({
                ok: true,
                synced: 0,
                skipped: 0,
                message: 'No reviews to sync'
            });
        }

        let synced = 0;
        let skipped = 0;
        const batch = db.batch();

        for (const zidReview of zidReviews) {
            const reviewId = `zid_${zidReview.id}`;
            const reviewRef = db.collection('reviews').doc(reviewId);

            // Check if review already exists
            const existingDoc = await reviewRef.get();
            if (existingDoc.exists) {
                skipped++;
                continue;
            }

            // Map and save review
            const reviewDoc = mapZidReview(zidReview, storeUid, subscriptionStartedAt);
            batch.set(reviewRef, reviewDoc, { merge: true });
            synced++;
        }

        await batch.commit();

        // Log sync event
        await db.collection('sync_logs').add({
            platform: 'zid',
            storeUid,
            type: 'reviews',
            synced,
            skipped,
            page,
            total: zidReviews.length,
            createdAt: Date.now(),
        });

        // Get pagination info - handle different response formats
        const pagination = reviewsResponse.pagination ?? reviewsResponse.meta;
        let hasMore = false;
        if (pagination) {
            const currentPage = pagination.current_page ?? page;
            // Use type assertion to handle union type
            const paginationAny = pagination as Record<string, number>;
            const totalPages = paginationAny.total_pages ?? paginationAny.last_page ?? 1;
            hasMore = currentPage < totalPages;
        }

        return res.status(200).json({
            ok: true,
            synced,
            skipped,
            total: zidReviews.length,
            page,
            hasMore,
            pagination,
        });
    } catch (err) {
        console.error('[Zid] Reviews sync error:', err);
        return res.status(500).json({
            error: 'Sync failed',
            message: err instanceof Error ? err.message : 'Unknown error'
        });
    }
}
