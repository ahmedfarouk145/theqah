/**
 * Review service - core review business logic
 * @module server/services/review.service
 */

import { RepositoryFactory } from '../repositories';
import { NotFoundError } from '../core/errors';
import type { Review, PaginatedResult, PaginationOptions, ServiceResult } from '../core/types';

export interface SubmitReviewInput {
    orderId: string;
    stars: number;
    text?: string;
    images?: string[];
    tokenId?: string;
    storeUid?: string;
    productId?: string;
    platform?: string;
    author?: {
        displayName?: string;
        email?: string;
        mobile?: string;
    };
}

export interface SubmitReviewResult {
    reviewId: string;
    status: string;
    needsModeration: boolean;
}

export class ReviewService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private tokenRepo = RepositoryFactory.getReviewTokenRepository();
    private storeRepo = RepositoryFactory.getStoreRepository();
    private auditRepo = RepositoryFactory.getAuditLogRepository();

    /**
     * Submit a new review
     */
    async submitReview(input: SubmitReviewInput): Promise<ServiceResult<SubmitReviewResult>> {
        const { orderId, stars, text, tokenId, storeUid, productId, platform, author } = input;

        // Validate stars
        if (stars < 1 || stars > 5) {
            return { ok: false, error: 'Invalid star rating', code: 'INVALID_STARS' };
        }

        // If tokenId provided, validate it
        let token = null;
        if (tokenId) {
            try {
                token = await this.tokenRepo.findValid(tokenId);
            } catch (error) {
                return { ok: false, error: (error as Error).message, code: 'INVALID_TOKEN' };
            }
        }

        // Create review
        const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();

        const review: Omit<Review, 'id' | 'createdAt'> = {
            reviewId,
            orderId,
            orderNumber: orderId,
            storeUid: token?.storeUid || storeUid || '',
            productId: token?.productId || productId || '',
            productName: '',
            source: token ? 'token' : platform || 'web',
            stars,
            text: text || '',
            author: {
                displayName: author?.displayName || 'Anonymous',
                email: author?.email || '',
                mobile: author?.mobile || '',
            },
            status: 'pending',
            trustedBuyer: !!token,
            verified: !!token,
            publishedAt: now,
            needsSallaId: false,
            updatedAt: now,
        };

        await this.reviewRepo.createWithId(reviewId, review);

        // Mark token as used
        if (token && token.id) {
            await this.tokenRepo.markUsed(token.id);
        }

        return {
            ok: true,
            data: {
                reviewId,
                status: 'pending',
                needsModeration: true,
            },
        };
    }

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
}

