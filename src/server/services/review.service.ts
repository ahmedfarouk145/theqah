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
    authorName?: string | null;
    authorShowName?: boolean;
}

export interface SubmitReviewResult {
    reviewId: string;
    status: string;
    needsModeration: boolean;
    published?: boolean;
    moderation?: {
        model: string;
        ok: boolean;
        score: number;
        flags: string[];
    } | null;
}

export class ReviewService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private tokenRepo = RepositoryFactory.getReviewTokenRepository();
    private storeRepo = RepositoryFactory.getStoreRepository();
    private auditRepo = RepositoryFactory.getAuditLogRepository();

    /**
         * Submit a new review with full moderation pipeline
         */
    async submitReview(input: SubmitReviewInput): Promise<ServiceResult<SubmitReviewResult>> {
        const { orderId, stars, text, images, tokenId, storeUid, productId, platform, author, authorName, authorShowName } = input;

        // Validate stars
        if (stars < 1 || stars > 5) {
            return { ok: false, error: 'Invalid star rating', code: 'INVALID_STARS' };
        }

        const now = Date.now();
        let token = null;
        let finalStoreUid = storeUid || '';
        let finalProductId = productId || '';
        let productIds: string[] = [];
        let verified = false;
        let verifiedReason: string | null = null;

        // Validate images (allow only ucarecdn or firebase storage)
        const safeImages = (images || []).filter((u) =>
            /^https:\/\/ucarecdn\.com\//.test(u) ||
            /^https:\/\/firebasestorage\.googleapis\.com\//.test(u)
        ).slice(0, 10);

        // Process author name
        const cleanName = this.sanitizeName(authorName);
        const authorData = {
            show: !!authorShowName && !!cleanName,
            name: cleanName || null,
            displayName: (!!authorShowName && cleanName) ? cleanName : this.maskName(cleanName),
            email: author?.email || '',
            mobile: author?.mobile || '',
        };

        // If tokenId provided, validate it
        if (tokenId) {
            try {
                token = await this.tokenRepo.findValid(tokenId);

                // Check orderId match
                if (token.orderId && String(token.orderId) !== String(orderId)) {
                    return { ok: false, error: 'Token order mismatch', code: 'TOKEN_ORDER_MISMATCH' };
                }

                finalStoreUid = token.storeUid || finalStoreUid;
                finalProductId = token.productId || finalProductId;
                productIds = token.productIds || [];
                verified = true;
                verifiedReason = 'invited_purchase';
            } catch (error) {
                const err = error as Error;
                const code = err.message.includes('not_found') ? 'TOKEN_NOT_FOUND' :
                    err.message.includes('used') ? 'TOKEN_ALREADY_USED' :
                        err.message.includes('expired') ? 'TOKEN_EXPIRED' :
                            err.message.includes('voided') ? 'TOKEN_VOIDED' : 'INVALID_TOKEN';
                return { ok: false, error: err.message, code };
            }

            // Check for duplicate review (only with token)
            const existing = await this.reviewRepo.findByOrderId(orderId);
            if (existing) {
                return { ok: false, error: 'Duplicate review', code: 'DUPLICATE_REVIEW' };
            }
        }

        // Create review ID
        const reviewId = `review_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

        // Create review document
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const review: any = {
            id: reviewId,
            reviewId,
            orderId,
            orderNumber: orderId,
            storeUid: finalStoreUid,
            productId: finalProductId,
            productIds,
            productName: '',
            source: token ? 'token' : platform || 'web',
            platform: platform || (token ? token.platform : 'web'),
            stars,
            text: text || '',
            images: safeImages,
            tokenId: tokenId || null,
            author: authorData,
            status: 'pending',
            published: false,
            publishedAt: null,
            trustedBuyer: !!token,
            verified,
            verifiedReason,
            moderation: null,
            createdAt: now,
            updatedAt: now,
            needsSallaId: false,
        };

        // Save initial review
        await this.reviewRepo.createWithId(reviewId, review);

        // Mark token as used
        if (token && token.id) {
            await this.tokenRepo.markUsed(token.id);
        }

        // Run moderation
        let okToPublish = false;
        let moderationResult: { ok: boolean; model?: string; score?: number; flags?: string[] } | null = null;

        try {
            const { moderateReview } = await import('../moderation');
            const mod = await moderateReview({
                text: text || '',
                images: safeImages,
                stars,
            });

            moderationResult = mod;
            okToPublish = !!mod?.ok;

            const moderationData = {
                flagged: !mod?.ok,
                flags: mod?.flags ?? (mod?.ok ? [] : ['blocked']),
                checkedAt: Date.now(),
            };

            await this.reviewRepo.update(reviewId, { moderation: moderationData });
        } catch (e) {
            okToPublish = false;
            await this.reviewRepo.update(reviewId, {
                moderation: { flagged: true, flags: ['moderation_error'], checkedAt: Date.now() }
            });
            console.error('[ReviewService] moderation failed:', e);
        }

        // Update publish status
        if (okToPublish) {
            await this.reviewRepo.update(reviewId, {
                status: 'published',
                publishedAt: Date.now(),
            });
        } else {
            await this.reviewRepo.update(reviewId, {
                status: 'rejected',
                publishedAt: 0,
            });
        }

        // Denormalize store info
        await this.denormalizeStoreInfo(reviewId, finalStoreUid);

        // Trigger notification
        await this.triggerReviewCreated(reviewId, okToPublish);

        return {
            ok: true,
            data: {
                reviewId,
                status: okToPublish ? 'published' : 'rejected',
                needsModeration: !okToPublish,
                published: okToPublish,
                moderation: moderationResult ? {
                    model: moderationResult.model || 'unknown',
                    ok: !!moderationResult.ok,
                    score: moderationResult.score ?? 0,
                    flags: moderationResult.flags ?? [],
                } : null,
            },
        };
    }

    /**
     * Sanitize author name
     */
    private sanitizeName(raw?: string | null): string {
        if (!raw) return '';
        return String(raw).trim().replace(/[^\p{L}\p{N}\s.''_-]/gu, '').slice(0, 60);
    }

    /**
     * Mask name for privacy
     */
    private maskName(clean: string): string {
        if (!clean) return 'عميل المتجر';
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return 'عميل المتجر';
        if (parts.length === 1) return parts[0];
        return `${parts[0]} ${parts[1][0]}.`;
    }

    /**
     * Denormalize store info to review
     */
    private async denormalizeStoreInfo(reviewId: string, storeUid: string): Promise<void> {
        if (!storeUid) return;

        try {
            const store = await this.storeRepo.findById(storeUid);
            if (!store) return;

            // Extract domain and name using type assertion for optional fields
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const storeData = store as any;

            const domain =
                storeData.domain?.base ||
                storeData.salla?.domain ||
                storeData.zid?.domain ||
                null;

            let name =
                storeData.merchant?.name ||
                storeData.salla?.storeName ||
                storeData.zid?.storeName ||
                storeData.storeName ||
                null;

            if (!name && domain) {
                try { name = new URL(domain).hostname; } catch { /* ignore */ }
            }

            await this.reviewRepo.update(reviewId, {
                storeName: name ?? 'غير محدد',
                storeDomain: domain ?? null,
            } as Partial<Review>);
        } catch (e) {
            console.warn('[ReviewService] denorm storeName failed:', e);
        }
    }

    /**
     * Trigger review created notification
     */
    private async triggerReviewCreated(reviewId: string, published: boolean): Promise<void> {
        if (published) return; // Only notify for pending reviews

        try {
            const { onReviewCreated } = await import('../triggers/review-created');
            const review = await this.reviewRepo.findById(reviewId);
            if (review) {
                await onReviewCreated(reviewId, review as unknown as Record<string, unknown>);
            }
        } catch (e) {
            console.error('[ReviewService] trigger failed:', e);
        }
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

