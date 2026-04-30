/**
 * Zid Review Sync Service - polls Zid API for reviews by product ID
 * SRP: Only responsible for fetching and saving reviews from Zid
 * DIP: Uses RepositoryFactory for data access, ZidTokenService for auth
 * @module server/services/zid-review-sync.service
 */

import { log } from '@/lib/logger';
import { createHash } from 'crypto';
import { ZidReviewRepository } from '@/server/repositories/zid-review.repository';

// Module-level singleton — repos are stateless and safe to share.
const zidReviewRepo = new ZidReviewRepository();

const ZID_API_URL = process.env.ZID_API_URL || 'https://api.zid.sa/v1';

/** Generate a deterministic hash for Zid review DOM matching.
 *  The widget computes the same hash from DOM data-time + reviewer name. */
function zidDomHash(authorName: string, createdAt: string): string {
    return createHash('sha256')
        .update(authorName + '|' + createdAt)
        .digest('hex')
        .substring(0, 16); // 16 hex chars = 64 bits, collision-safe for per-store reviews
}

/** Zid review from API response — matches actual Zid API schema */
export interface ZidApiReview {
    id: string;                // UUID
    customer: {
        id: number;
        name: string;
    };
    product: {
        id: string;            // UUID
        name: string;
        bought_this_item: boolean;
        image: string | null;
    };
    status: 'pending' | 'approved' | 'rejected' | 'published';
    is_anonymous: boolean;
    rating: number;
    comment: string;
    edit_requested: boolean;
    original_snapshot: unknown | null;
    reply: string | null;
    images: string[];
    created_at: string;
    updated_at: string;
}

/** Zid API response for List Reviews */
export interface ZidReviewsApiResponse {
    status: string;
    pagination: {
        page: number;
        next_page: number | null;
        last_page: number;
        result_count: number;
    };
    reviews: ZidApiReview[];
    message: {
        type: string;
        code: string | null;
        name: string | null;
        description: string | null;
    };
}

export interface ReviewSyncResult {
    synced: number;
    skipped: number;
    errors: number;
    details: string[];
}

export class ZidReviewSyncService {

    /**
     * Sync reviews for a single Zid store
     * Finds orders with un-checked products, queries Zid API for reviews, saves new ones
     */
    async syncReviewsForStore(
        storeUid: string,
        storeId: string,
        tokens: { access_token: string; authorization: string },
        options?: {
            sinceDays?: number;
            subscriptionStart?: number;
            /** Pull all-time reviews; ignores sinceDays. Used by backfill. */
            unbounded?: boolean;
            /** Override page safety cap. Defaults to 50 (cron). */
            maxPages?: number;
            /** Resume from a specific page (used when retrying a backfill). */
            startPage?: number;
            /** Bypass paid-order verification — trust the platform's review status.
             *  Used by historical backfill where pre-subscription orders aren't in our DB. */
            trustPlatformStatus?: boolean;
            /** Optional callback invoked after each page — used for cursor checkpointing. */
            onPageComplete?: (page: number, pageStats: { synced: number; skipped: number }) => Promise<void>;
        }
    ): Promise<ReviewSyncResult> {
        const result: ReviewSyncResult = { synced: 0, skipped: 0, errors: 0, details: [] };
        const unbounded = options?.unbounded === true;
        const sinceDays = options?.sinceDays ?? 7;
        const dateFrom = unbounded
            ? undefined
            : new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000)
                .toISOString().split('T')[0]; // YYYY-MM-DD

        const maxPages = options?.maxPages ?? 50;
        let page = options?.startPage ?? 1;

        try {
            // Fetch all approved reviews from the store (paginated)
            let hasMore = true;

            while (hasMore) {
                const pageStartSynced = result.synced;
                const pageStartSkipped = result.skipped;
                const reviewsResponse = await this.fetchReviewsPage(tokens, page, dateFrom);

                if (!reviewsResponse || !reviewsResponse.reviews) {
                    result.details.push(`Failed to fetch page ${page}`);
                    result.errors++;
                    break;
                }

                for (const zidReview of reviewsResponse.reviews) {
                    try {
                        const saved = await this.processReview(
                            zidReview,
                            storeUid,
                            options?.subscriptionStart,
                            options?.trustPlatformStatus === true,
                        );
                        if (saved) {
                            result.synced++;
                        } else {
                            result.skipped++;
                        }
                    } catch (reviewErr) {
                        result.errors++;
                        result.details.push(`Error processing review ${zidReview.id}: ${reviewErr}`);
                    }
                }

                // Per-page checkpoint hook (used by backfill to save cursor)
                if (options?.onPageComplete) {
                    await options.onPageComplete(page, {
                        synced: result.synced - pageStartSynced,
                        skipped: result.skipped - pageStartSkipped,
                    });
                }

                hasMore = reviewsResponse.pagination.next_page !== null;
                page++;

                if (page > maxPages) {
                    result.details.push(`Reached page limit (${maxPages})`);
                    break;
                }
            }

            log('info', `[ZID_SYNC] Store ${storeUid}: synced=${result.synced}, skipped=${result.skipped}, errors=${result.errors}`, { scope: 'zid' });

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors++;
            result.details.push(`Store sync failed: ${msg}`);
            log('error', `[ZID_SYNC] Store ${storeUid} sync failed: ${msg}`, { scope: 'zid' });
        }

        return result;
    }

    /**
     * Fetch a page of reviews from Zid API
     */
    private async fetchReviewsPage(
        tokens: { access_token: string; authorization: string },
        page: number,
        dateFrom?: string
    ): Promise<ZidReviewsApiResponse | null> {
        try {
            const params = new URLSearchParams({
                page: String(page),
                page_size: '20',
                status: 'approved',
                order_by: 'id',
                sort_by: 'DESC',
            });

            if (dateFrom) {
                params.set('date_from', dateFrom);
            }

            const url = `${ZID_API_URL}/managers/store/reviews/product?${params.toString()}`;

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${tokens.authorization}`,
                    'X-Manager-Token': tokens.access_token,
                    'Accept': 'application/json',
                    'Accept-Language': 'ar',
                },
            });

            if (!response.ok) {
                log('error', `[ZID_SYNC] Fetch reviews HTTP ${response.status}`, { scope: 'zid' });
                return null;
            }

            const data = await response.json() as ZidReviewsApiResponse;
            return data;

        } catch (err) {
            log('error', `[ZID_SYNC] Fetch reviews exception: ${err}`, { scope: 'zid' });
            return null;
        }
    }

    /**
     * Process a single Zid review — check if it already exists, map, and save
     */
    private async processReview(
        zidReview: ZidApiReview,
        storeUid: string,
        subscriptionStart?: number,
        trustPlatformStatus = false,
    ): Promise<boolean> {
        // Skip anonymous reviews — cannot generate a reliable DOM hash
        if (zidReview.is_anonymous) {
            return false;
        }

        const reviewDocId = `zid_${zidReview.id}`;

        // Check if already saved (in either zid_reviews or legacy reviews)
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const existing = await zidReviewRepo.findById(reviewDocId);
        if (existing) {
            return false; // Already synced
        }

        // Determine verification status (Option C: verify against actual Zid order)
        // verified = reviewer has a real paid/delivered order for this product AND review is within subscription period
        const reviewCreatedAt = new Date(zidReview.created_at).getTime();
        const withinSubscription = subscriptionStart
            ? reviewCreatedAt >= subscriptionStart
            : true;

        // Find matching order: same store, same customer, same product, paid status
        const customerId = zidReview.customer?.id != null ? String(zidReview.customer.id) : null;
        const productId = zidReview.product.id;
        let matchingOrderId = '';
        let matchingOrderNumber = '';

        if (customerId && productId) {
            const orderSnap = await db.collection('orders')
                .where('storeUid', '==', storeUid)
                .where('customerId', '==', customerId)
                .where('productIds', 'array-contains', productId)
                .limit(1)
                .get();

            if (!orderSnap.empty) {
                const orderDoc = orderSnap.docs[0];
                const orderData = orderDoc.data();
                // Accept only orders that are paid (payment verified)
                const paymentStatus = String(orderData.paymentStatus || '').toLowerCase();
                if (paymentStatus === 'paid') {
                    matchingOrderId = String(orderData.id || '');
                    matchingOrderNumber = String(orderData.number || '');
                }
            }
        }

        const hasMatchingOrder = matchingOrderId !== '';
        // Backfill mode: trust the Zid platform's `approved`/`published`
        // status as the verification signal — pre-subscription orders
        // won't exist in our `orders` collection but the review is real.
        const verified = trustPlatformStatus
            ? true
            : (withinSubscription && hasMatchingOrder);

        // Map to internal Review format and write to zid_reviews. Several
        // fields below (zidCreatedAt, zidDomHash, images, reply, isAnonymous,
        // syncedAt) are Zid-sync metadata not enumerated on the shared
        // Review type — we cast the whole payload pragmatically.
        const payload = {
            reviewId: reviewDocId,
            storeUid,
            platform: 'zid' as const,
            orderId: matchingOrderId,      // Link to the matched order (empty if no match)
            orderNumber: matchingOrderNumber,
            productId: zidReview.product.id,
            productName: zidReview.product.name || '',
            source: 'zid_sync',
            stars: zidReview.rating,
            text: zidReview.comment || '',
            author: {
                displayName: zidReview.is_anonymous
                    ? 'عميل'
                    : (zidReview.customer?.name || 'عميل'),
                email: '',
                mobile: '',
            },
            status: 'approved',
            trustedBuyer: hasMatchingOrder, // Based on actual matching paid order
            verified,
            ...(trustPlatformStatus
                ? {
                    verificationMethod: 'platform-historical',
                    verifiedBy: 'zid-platform-status',
                    backfilledAt: Date.now(),
                    source: 'zid_backfill',
                }
                : {}),
            publishedAt: reviewCreatedAt || Date.now(),
            needsSallaId: false,
            zidReviewId: zidReview.id,
            zidCreatedAt: zidReview.created_at || '',
            zidDomHash: zidDomHash(zidReview.customer?.name || '', zidReview.created_at || ''),
            images: zidReview.images || [],
            reply: zidReview.reply || null,
            isAnonymous: zidReview.is_anonymous || false,
            createdAt: reviewCreatedAt || Date.now(),
            syncedAt: Date.now(),
        };
        await zidReviewRepo.set(reviewDocId, payload as unknown as Parameters<typeof zidReviewRepo.set>[1]);

        return true;
    }
}
