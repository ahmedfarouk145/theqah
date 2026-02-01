// src/pages/api/cron/sync-zid-reviews.ts
// Cron job to sync reviews from all connected Zid stores
// Should be scheduled daily via Vercel cron or GitHub Actions

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { fetchZidReviews } from '@/lib/zid/client';

const CRON_SECRET = process.env.CRON_SECRET ?? '';

interface SyncResult {
    storeUid: string;
    synced: number;
    skipped: number;
    error?: string;
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

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Verify cron secret
    const cronSecret = req.headers['x-cron-secret'] ?? req.query.secret;
    if (cronSecret !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const db = dbAdmin();
    const results: SyncResult[] = [];
    const startTime = Date.now();

    try {
        // Find all stores with active Zid connection and subscription
        const storesSnap = await db.collection('stores')
            .where('zid.connected', '==', true)
            .where('zid.subscription.status', '==', 'active')
            .get();

        console.log(`[Zid Cron] Found ${storesSnap.size} active Zid stores to sync`);

        for (const storeDoc of storesSnap.docs) {
            const storeUid = storeDoc.id;
            const storeData = storeDoc.data();
            const subscriptionStartedAt = storeData?.zid?.subscription?.startedAt as number | undefined;

            try {
                // Get tokens (use zid_tokens collection based on user auth, or from store doc)
                // For cron, we need to find the token - this assumes we have a userUid mapping
                let managerToken: string | null = null;

                // Check if tokens are stored in store document
                if (storeData?.zid?.tokens?.authorization) {
                    managerToken = storeData.zid.tokens.authorization;
                } else if (storeData?.zid?.tokens?.access_token) {
                    managerToken = storeData.zid.tokens.access_token;
                } else {
                    // Try to find from zid_tokens collection using store ID
                    const zidStoreId = storeData?.zid?.storeId;
                    if (zidStoreId) {
                        const tokenDoc = await db.collection('zid_tokens').doc(zidStoreId).get();
                        const tokenData = tokenDoc.data();
                        managerToken = tokenData?.authorization ?? tokenData?.access_token ?? null;
                    }
                }

                if (!managerToken) {
                    results.push({ storeUid, synced: 0, skipped: 0, error: 'No access token' });
                    continue;
                }

                // Fetch reviews from last 7 days
                const dateFrom = new Date();
                dateFrom.setDate(dateFrom.getDate() - 7);

                const reviewsResponse = await fetchZidReviews(managerToken, {
                    status: 'approved',
                    per_page: 100,
                    date_from: dateFrom.toISOString().split('T')[0],
                });

                const zidReviews = reviewsResponse.reviews ?? reviewsResponse.data ?? [];

                if (zidReviews.length === 0) {
                    results.push({ storeUid, synced: 0, skipped: 0 });
                    continue;
                }

                let synced = 0;
                let skipped = 0;
                const batch = db.batch();

                for (const zidReview of zidReviews) {
                    const reviewId = `zid_${zidReview.id}`;
                    const reviewRef = db.collection('reviews').doc(reviewId);

                    // Check if exists
                    const existingDoc = await reviewRef.get();
                    if (existingDoc.exists) {
                        skipped++;
                        continue;
                    }

                    const verified = isVerifiedReview(zidReview.created_at, subscriptionStartedAt);

                    batch.set(reviewRef, {
                        id: reviewId,
                        zidReviewId: zidReview.id,
                        productId: String(zidReview.product_id),
                        productName: zidReview.product_name ?? null,
                        rating: zidReview.rating,
                        customerName: zidReview.customer?.name || 'عميل',
                        customerId: zidReview.customer?.id ? String(zidReview.customer.id) : null,
                        comment: zidReview.comment || '',
                        source: 'zid_native',
                        platform: 'zid',
                        storeUid,
                        verified,
                        status: zidReview.status,
                        createdAt: new Date(zidReview.created_at).getTime(),
                        updatedAt: new Date(zidReview.updated_at).getTime(),
                        syncedAt: Date.now(),
                    }, { merge: true });

                    synced++;
                }

                if (synced > 0) {
                    await batch.commit();
                }

                results.push({ storeUid, synced, skipped });
                console.log(`[Zid Cron] Store ${storeUid}: synced=${synced}, skipped=${skipped}`);

            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                results.push({ storeUid, synced: 0, skipped: 0, error: errorMsg });
                console.error(`[Zid Cron] Store ${storeUid} error:`, err);
            }
        }

        const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
        const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
        const errors = results.filter(r => r.error).length;
        const duration = Date.now() - startTime;

        // Log cron run
        await db.collection('cron_logs').add({
            job: 'sync-zid-reviews',
            storesProcessed: storesSnap.size,
            totalSynced,
            totalSkipped,
            errors,
            duration,
            results,
            createdAt: Date.now(),
        });

        console.log(`[Zid Cron] Complete: ${totalSynced} synced, ${totalSkipped} skipped, ${errors} errors, ${duration}ms`);

        return res.status(200).json({
            ok: true,
            storesProcessed: storesSnap.size,
            totalSynced,
            totalSkipped,
            errors,
            duration,
            results,
        });

    } catch (err) {
        console.error('[Zid Cron] Fatal error:', err);
        return res.status(500).json({
            error: 'Cron job failed',
            message: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}
