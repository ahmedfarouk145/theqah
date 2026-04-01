/**
 * Review repository
 * @module server/repositories/review.repository
 */

import { BaseRepository } from './base.repository';
import type { Review, PaginatedResult, PaginationOptions } from '../core/types';

export class ReviewRepository extends BaseRepository<Review> {
    protected readonly collectionName = 'reviews';
    protected readonly idField = 'reviewId';

    /**
     * Find review by order ID
     */
    async findByOrderId(orderId: string): Promise<Review | null> {
        return this.query()
            .where('orderId', '==', orderId)
            .getFirst();
    }

    /**
     * Find review by order and product
     */
    async findByOrderAndProduct(orderId: string, productId: string): Promise<Review | null> {
        return this.query()
            .where('orderId', '==', orderId)
            .where('productId', '==', productId)
            .getFirst();
    }

    /**
     * Find verified reviews for a store (for widget API)
     */
    async findVerifiedByStore(storeUid: string, productId?: string): Promise<Review[]> {
        let query = this.query()
            .where('storeUid', '==', storeUid)
            .where('verified', '==', true)
            .where('status', '==', 'approved');

        if (productId) {
            query = query.where('productId', '==', productId);
        }

        return query.getAll();
    }

    /**
     * Find reviews needing Salla ID (for backfill cron)
     */
    async findNeedingSallaId(limit: number = 50): Promise<Review[]> {
        return this.query()
            .where('needsSallaId', '==', true)
            .limit(limit)
            .getAll();
    }

    /**
     * Update Salla review ID
     */
    async updateSallaId(reviewId: string, sallaReviewId: string): Promise<void> {
        await this.update(reviewId, {
            sallaReviewId,
            needsSallaId: false,
            verified: true,
            backfilledAt: new Date().toISOString(),
        } as Partial<Review>);
    }

    /**
     * Increment backfill attempt counter; if max reached, mark as failed.
     */
    async incrementBackfillAttempt(reviewId: string, maxAttempts: number): Promise<{ gaveUp: boolean; attempts: number }> {
        const review = await this.findById(reviewId);
        if (!review) return { gaveUp: false, attempts: 0 };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- backfillAttempts is a dynamic field not in the Review type
        const attempts = ((review as any).backfillAttempts ?? 0) + 1;
        if (attempts >= maxAttempts) {
            await this.update(reviewId, {
                needsSallaId: false,
                backfillFailed: true,
                backfillAttempts: attempts,
                backfillGivenUpAt: new Date().toISOString(),
            } as Partial<Review>);
            return { gaveUp: true, attempts };
        }

        await this.update(reviewId, {
            backfillAttempts: attempts,
        } as Partial<Review>);
        return { gaveUp: false, attempts };
    }

    /**
     * Find reviews by store with pagination
     */
    async findByStoreUid(
        storeUid: string,
        options?: PaginationOptions
    ): Promise<PaginatedResult<Review>> {
        return this.query()
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .getPaginated(options);
    }

    /**
     * Find pending reviews for a store
     */
    async findPendingReviews(storeUid: string): Promise<Review[]> {
        return this.query()
            .where('storeUid', '==', storeUid)
            .where('status', '==', 'pending_review')
            .getAll();
    }

    /**
     * Update review status
     */
    async updateStatus(id: string, status: string, published: boolean): Promise<void> {
        await this.update(id, {
            status,
            published,
            publishedAt: published ? Date.now() : null,
        } as unknown as Partial<Review>);
    }

    /**
     * Hide a review
     */
    async hide(id: string): Promise<void> {
        await this.update(id, {
            status: 'hidden',
            published: false,
        } as unknown as Partial<Review>);
    }

    /**
     * Find published reviews for public widget API
     */
    async findPublishedByStore(
        storeUid: string,
        options?: {
            productId?: string;
            limit?: number;
            sort?: 'asc' | 'desc';
            sinceDays?: number;
        }
    ): Promise<Review[]> {
        const { productId, limit = 20, sort = 'desc', sinceDays = 0 } = options || {};

        const snapshot = await this.collection
            .where('storeUid', '==', storeUid)
            .where('status', '==', 'published')
            .orderBy('publishedAt', sort)
            .limit(limit)
            .get();

        let reviews = snapshot.docs.map(doc => this.mapDoc(doc));

        // Filter by productId if provided
        if (productId) {
            reviews = reviews.filter(r => r.productId === productId);
        }

        // Filter by sinceDays if provided
        if (sinceDays > 0) {
            const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
            reviews = reviews.filter(r => (r.publishedAt || 0) >= cutoff);
        }

        return reviews;
    }
}

