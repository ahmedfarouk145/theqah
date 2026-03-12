/**
 * Review service - core review business logic
 * @module server/services/review.service
 */

import { RepositoryFactory } from '../repositories';
import { NotFoundError } from '../core/errors';
import type { Review, PaginatedResult, PaginationOptions } from '../core/types';

export class ReviewService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private auditRepo = RepositoryFactory.getAuditLogRepository();

    /**
     * Hide a review
     */
    async hideReview(reviewId: string, adminUid: string): Promise<void> {
        const review = await this.reviewRepo.findById(reviewId);
        if (!review) {
            throw new NotFoundError('Review', reviewId);
        }

        await this.reviewRepo.hide(reviewId);

        // Log audit
        await this.auditRepo.log('hide_review', 'review', reviewId, {
            userId: adminUid,
            storeUid: review.storeUid,
            changes: { status: 'hidden', published: false },
        });
    }

    /**
     * Approve a review
     */
    async approveReview(reviewId: string, adminUid: string): Promise<void> {
        const review = await this.reviewRepo.findById(reviewId);
        if (!review) {
            throw new NotFoundError('Review', reviewId);
        }

        await this.reviewRepo.updateStatus(reviewId, 'approved', true);

        await this.auditRepo.log('approve_review', 'review', reviewId, {
            userId: adminUid,
            storeUid: review.storeUid,
            changes: { status: 'approved', published: true },
        });
    }

    /**
     * Reject a review
     */
    async rejectReview(reviewId: string, adminUid: string, reason?: string): Promise<void> {
        const review = await this.reviewRepo.findById(reviewId);
        if (!review) {
            throw new NotFoundError('Review', reviewId);
        }

        await this.reviewRepo.updateStatus(reviewId, 'rejected', false);

        await this.auditRepo.log('reject_review', 'review', reviewId, {
            userId: adminUid,
            storeUid: review.storeUid,
            changes: { status: 'rejected', published: false },
            metadata: { reason },
        });
    }

    /**
     * List reviews for a store
     */
    async listReviews(
        storeUid: string,
        options?: PaginationOptions
    ): Promise<PaginatedResult<Review>> {
        return this.reviewRepo.findByStoreUid(storeUid, options);
    }

    /**
     * Get verified reviews (for widget API)
     */
    async getVerifiedReviews(storeUid: string, productId?: string): Promise<Review[]> {
        return this.reviewRepo.findVerifiedByStore(storeUid, productId);
    }

    /**
     * Get pending reviews for moderation
     */
    async getPendingReviews(storeUid: string): Promise<Review[]> {
        return this.reviewRepo.findPendingReviews(storeUid);
    }

    /**
     * Get review by ID
     */
    async getReview(reviewId: string): Promise<Review | null> {
        return this.reviewRepo.findById(reviewId);
    }

    /**
     * Get public reviews for widget API
     */
    async getPublicReviews(
        storeUid: string,
        options?: {
            productId?: string;
            limit?: number;
            sort?: 'asc' | 'desc';
            sinceDays?: number;
        }
    ): Promise<{
        id: string;
        productId: string | null;
        stars: number;
        text: string;
        publishedAt: number;
        trustedBuyer: boolean;
        author: { displayName: string };
        images?: string[];
    }[]> {
        const reviews = await this.reviewRepo.findPublishedByStore(storeUid, options);

        return reviews.map(r => ({
            id: r.id || r.reviewId || '',
            productId: r.productId || null,
            stars: r.stars,
            text: r.text || '',
            publishedAt: r.publishedAt || 0,
            trustedBuyer: !!r.trustedBuyer,
            author: { displayName: r.author?.displayName || 'عميل المتجر' },
            images: Array.isArray((r as { images?: string[] }).images)
                ? (r as { images?: string[] }).images
                : undefined,
        }));
    }

    /**
     * List reviews with filters (for dashboard list.ts)
     * M12: Added search parameter (client-side filtering for Firestore)
     * M13: Added date range filtering (startDate, endDate)
     */
    async listWithFilters(
        storeUid: string,
        options: {
            limit?: number;
            cursor?: string;
            status?: string;
            search?: string;
            startDate?: number;
            endDate?: number;
            stars?: number;
            productId?: string;
        }
    ): Promise<{
        reviews: NormalizedReview[];
        pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
    }> {
        const { limit = 50, cursor, status, search, startDate, endDate, stars, productId } = options;
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Note: Firestore doesn't support full-text search, so we fetch more and filter client-side
        const fetchLimit = search ? Math.min(limit * 3, 200) : limit + 1;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = db
            .collection('reviews')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(fetchLimit);

        // Status filter
        if (status && ['pending', 'pending_review', 'approved', 'rejected', 'published'].includes(status)) {
            query = query.where('status', '==', status);
        }

        // Stars filter
        if (stars && stars >= 1 && stars <= 5) {
            query = query.where('stars', '==', stars);
        }

        // Product filter
        if (productId) {
            query = query.where('productId', '==', productId);
        }

        // Cursor for pagination
        if (cursor) {
            const cursorDoc = await db.collection('reviews').doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snap = await query.get();

        // Map and filter results
        let reviews: NormalizedReview[] = snap.docs.map((d: FirebaseFirestore.DocumentSnapshot) => {
            const raw = d.data() as Record<string, unknown>;
            return this.normalizeReviewWithExtras(d.id, raw);
        });

        // M13: Date range filtering (client-side since Firestore already ordered by createdAt)
        if (startDate) {
            reviews = reviews.filter(r => r.createdAt >= startDate);
        }
        if (endDate) {
            reviews = reviews.filter(r => r.createdAt <= endDate);
        }

        // M12: Search filtering (client-side - searches in customer name, text, product name)
        if (search && search.trim()) {
            const searchLower = search.trim().toLowerCase();
            reviews = reviews.filter(r => {
                const textMatch = r.text?.toLowerCase().includes(searchLower);
                const commentMatch = r.comment?.toLowerCase().includes(searchLower);
                const authorMatch = r.authorName?.toLowerCase().includes(searchLower);
                const productMatch = r.productName?.toLowerCase().includes(searchLower);
                return textMatch || commentMatch || authorMatch || productMatch;
            });
        }

        // Apply final limit after filtering
        const hasMore = reviews.length > limit;
        const finalReviews = hasMore ? reviews.slice(0, limit) : reviews;
        const nextCursor = hasMore && finalReviews.length > 0 ? finalReviews[finalReviews.length - 1].id : null;

        return {
            reviews: finalReviews,
            pagination: { hasMore, nextCursor, limit },
        };
    }

    // Extended normalize to include extra fields for search
    private normalizeReviewWithExtras(docId: string, raw: Record<string, unknown>): NormalizedReview & { authorName?: string; productName?: string } {
        const base = this.normalizeReview(docId, raw);
        return {
            ...base,
            authorName: (raw['author'] as { displayName?: string; name?: string })?.displayName ||
                (raw['author'] as { displayName?: string; name?: string })?.name ||
                raw['authorName'] as string || '',
            productName: raw['productName'] as string || '',
        };
    }

    /**
     * Update review status (for store owner dashboard)
     */
    async updateReviewStatus(
        reviewId: string,
        storeUid: string,
        status: 'approved' | 'rejected'
    ): Promise<{ ok: boolean; reviewId?: string; status?: string; error?: string }> {
        const review = await this.reviewRepo.findById(reviewId);

        if (!review) {
            return { ok: false, error: 'review_not_found' };
        }

        if (review.storeUid !== storeUid) {
            return { ok: false, error: 'forbidden' };
        }

        const now = Date.now();
        const updates: Partial<Review> = {
            status,
            updatedAt: now,
        };

        if (status === 'approved') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (updates as any).published = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (updates as any).publishedAt = now;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (updates as any).published = false;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (updates as any).publishedAt = null;
        }

        await this.reviewRepo.update(reviewId, updates);

        return { ok: true, reviewId, status };
    }

    // Helper to normalize review data
    private normalizeReview(docId: string, raw: Record<string, unknown>): NormalizedReview {
        const id = String(raw['id'] ?? raw['_id'] ?? raw['reviewId'] ?? docId ?? '');
        const productId = (raw['productId'] ?? raw['product_id']) as string | undefined;

        const starsRaw = raw['stars'];
        const starsNum = typeof starsRaw === 'number' ? starsRaw : Number(starsRaw ?? 0);
        const stars = Number.isFinite(starsNum) ? starsNum : 0;

        const createdAt = this.toTs(raw['createdAt'] ?? raw['created'] ?? raw['timestamp'] ?? raw['created_at']) || Date.now();

        const bvCandidate =
            raw['buyerVerified'] ??
            raw['trustedBuyer'] ??
            raw['trusted_buyer'] ??
            raw['buyer_trusted'] ??
            raw['verified'] ??
            raw['isVerified'] ??
            raw['verifiedBuyer'] ??
            raw['buyer_verified'];

        const buyerVerified = this.toBool(bvCandidate);
        const text = (raw['text'] ?? raw['comment'] ?? '') as string | undefined;
        const comment = (raw['comment'] as string | undefined) ?? undefined;
        const status = raw['status'] as NormalizedReview['status'] | undefined;

        return { id, productId, stars, text, comment, createdAt, buyerVerified, status };
    }

    private toTs(v: unknown): number {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const n = Number(v);
            return Number.isFinite(n) ? n : Date.parse(v);
        }
        return 0;
    }

    private toBool(v: unknown): boolean {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        if (typeof v === 'string') return ['1', 'true', 'yes', 'y'].includes(v.toLowerCase());
        return false;
    }

    /**
     * Moderate a single review by ID
     */
    async moderateSingleReview(reviewId: string): Promise<ModerationResult> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const ref = db.collection('reviews').doc(reviewId);
        const snap = await ref.get();

        if (!snap.exists) {
            return { ok: false, error: 'not_found' };
        }

        const review = snap.data() as Record<string, unknown>;
        const status = review.status as string;

        if (status !== 'pending') {
            return { ok: true, skipped: true, status };
        }

        const { checkReviewModeration } = await import('@/server/moderation/checkReview');
        const verdict = await checkReviewModeration(String(review.text || ''));

        if (verdict.allowed) {
            const trustedBuyer = this.toBool(review.trustedBuyer ?? review.verified);
            await ref.set({
                status: 'published',
                trustedBuyer,
                moderatedAt: Date.now(),
                moderationReasons: verdict.reasons || [],
            }, { merge: true });
            return { ok: true, published: true, trustedBuyer };
        } else {
            await ref.set({
                status: 'rejected',
                moderatedAt: Date.now(),
                moderationReasons: verdict.reasons,
                moderationCategory: verdict.category,
            }, { merge: true });

            return {
                ok: true,
                rejected: true,
                reasons: verdict.reasons,
                category: verdict.category,
            };
        }
    }

    /**
     * Moderate batch of pending reviews
     */
    async moderatePendingBatch(limit: number = 20): Promise<BatchModerationResult> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const { checkReviewModeration } = await import('@/server/moderation/checkReview');
        const db = dbAdmin();

        const q = await db
            .collection('reviews')
            .where('status', '==', 'pending')
            .orderBy('createdAt', 'asc')
            .limit(limit)
            .get();

        const results: ModerationItemResult[] = [];

        for (const doc of q.docs) {
            const r = doc.data() as Record<string, unknown>;
            const verdict = await checkReviewModeration(String(r.text || ''));

            if (verdict.allowed) {
                const trustedBuyer = this.toBool(r.trustedBuyer ?? r.verified);
                await doc.ref.set({
                    status: 'published',
                    trustedBuyer,
                    moderatedAt: Date.now(),
                    moderationReasons: verdict.reasons || [],
                }, { merge: true });
                results.push({ id: doc.id, published: true, trustedBuyer });
            } else {
                await doc.ref.set({
                    status: 'rejected',
                    moderatedAt: Date.now(),
                    moderationReasons: verdict.reasons,
                    moderationCategory: verdict.category,
                }, { merge: true });
                results.push({
                    id: doc.id,
                    rejected: true,
                    reasons: verdict.reasons,
                    category: verdict.category,
                });
            }
        }

        return { ok: true, processed: results.length, results };
    }
}

export interface NormalizedReview {
    id: string;
    productId?: string;
    stars: number;
    text?: string;
    comment?: string;
    createdAt: number;
    buyerVerified?: boolean;
    status?: 'pending' | 'published' | 'rejected' | 'pending_review' | 'approved';
    // M12: Added for search support
    authorName?: string;
    productName?: string;
}

export interface ModerationResult {
    ok: boolean;
    error?: string;
    skipped?: boolean;
    status?: string;
    published?: boolean;
    rejected?: boolean;
    trustedBuyer?: boolean;
    reasons?: string[];
    category?: string;
}

export interface ModerationItemResult {
    id: string;
    published?: boolean;
    rejected?: boolean;
    trustedBuyer?: boolean;
    reasons?: string[];
    category?: string;
}

export interface BatchModerationResult {
    ok: boolean;
    processed: number;
    results: ModerationItemResult[];
}


