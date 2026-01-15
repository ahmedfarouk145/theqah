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

    /**
     * List reviews with filters (for dashboard list.ts)
     */
    async listWithFilters(
        storeUid: string,
        options: {
            limit?: number;
            cursor?: string;
            status?: string;
        }
    ): Promise<{
        reviews: NormalizedReview[];
        pagination: { hasMore: boolean; nextCursor: string | null; limit: number };
    }> {
        const { limit = 50, cursor, status } = options;
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = db
            .collection('reviews')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(limit + 1);

        if (status && ['pending', 'pending_review', 'approved', 'rejected', 'published'].includes(status)) {
            query = query.where('status', '==', status);
        }

        if (cursor) {
            const cursorDoc = await db.collection('reviews').doc(cursor).get();
            if (cursorDoc.exists) {
                query = query.startAfter(cursorDoc);
            }
        }

        const snap = await query.get();
        const hasMore = snap.docs.length > limit;
        const docs = hasMore ? snap.docs.slice(0, limit) : snap.docs;

        const reviews: NormalizedReview[] = docs.map((d: FirebaseFirestore.DocumentSnapshot) => {
            const raw = d.data() as Record<string, unknown>;
            return this.normalizeReview(d.id, raw);
        });

        const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

        return {
            reviews,
            pagination: { hasMore, nextCursor, limit },
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
            const trustedBuyer = Boolean(review.tokenId);
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

            // Notify customer about rejection
            await this.notifyRejection(db, review.tokenId as string | null, verdict.reasons?.[0]);

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
                const trustedBuyer = Boolean(r.tokenId);
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
                await this.notifyRejection(db, r.tokenId as string | null, verdict.reasons?.[0]);
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

    /**
     * Notify customer about rejection via SMS and Email
     */
    private async notifyRejection(
        db: FirebaseFirestore.Firestore,
        tokenId: string | null | undefined,
        reason?: string
    ): Promise<void> {
        if (!tokenId) return;

        const inviteSnap = await db
            .collection('review_invites')
            .where('tokenId', '==', tokenId)
            .limit(1)
            .get();

        if (inviteSnap.empty) return;

        const inv = inviteSnap.docs[0].data();
        const name = inv?.customer?.name || 'عميلنا العزيز';
        const msg = `عذراً ${name}، تمت مراجعة تقييمك ولم يتم قبوله بسبب: ${reason || 'مخالفة سياسة المحتوى'}. يمكنك إرسال تقييم جديد بصياغة مناسبة.`;

        const mobile = inv?.customer?.mobile ? String(inv.customer.mobile).replace(/\s+/g, '') : null;
        const email = inv?.customer?.email || null;

        const tasks: Promise<unknown>[] = [];

        if (mobile) {
            const { sendSms } = await import('@/server/messaging/send-sms');
            tasks.push(sendSms(mobile, msg));
        }

        if (email) {
            const { sendEmailDmail } = await import('@/server/messaging/email-dmail');
            const html = `<div dir="rtl" style="font-family:Tahoma,Arial"><p>${msg}</p></div>`;
            tasks.push(sendEmailDmail(email, 'مراجعتك لم تُقبل', html));
        }

        await Promise.allSettled(tasks);
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


