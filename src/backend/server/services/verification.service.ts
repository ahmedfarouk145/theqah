/**
 * Verification service - for widget API
 * @module server/services/verification.service
 */

import { RepositoryFactory } from '../repositories';
import { VerifiedIndexService } from './verified-index.service';
import type { Review, Store } from '../core/types';

export interface VerifiedReviewResult {
    hasVerified: boolean;
    reviews: Review[];
    count: number;
}

export interface StoreResolveResult {
    storeUid: string;
    storeName: string;
    storeDomain: string | null;
    hasSubscription: boolean;
}

export class VerificationService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private storeRepo = RepositoryFactory.getStoreRepository();
    private domainRepo = RepositoryFactory.getDomainRepository();
    private indexService = new VerifiedIndexService();

    /**
     * Get verified reviews for widget display
     * Only returns reviews if store exists and is installed/active
     */
    async getVerifiedReviews(
        storeId: string,
        productId?: string
    ): Promise<VerifiedReviewResult> {
        // IMPORTANT: First check if store exists and is valid
        const store = await this.storeRepo.findById(storeId);

        // Don't show certificate if:
        // 1. Store doesn't exist in database
        // 2. Store is not connected/installed (app was uninstalled)
        if (!store) {
            return { hasVerified: false, reviews: [], count: 0 };
        }

        // Check if store has Salla connected flag
        const isConnected = store.salla?.connected !== false && store.salla?.installed !== false;
        if (!isConnected) {
            return { hasVerified: false, reviews: [], count: 0 };
        }

        // Serve from the per-store verified index (1 doc read + 1 count
        // aggregate) instead of reading every verified review per call.
        // The page's own product reviews are fetched in full (small set)
        // for JSON-LD; the rest of the store's reviews come back as
        // compact ID-only entries — enough for the widget's DOM badge
        // matching, and naturally excluded from JSON-LD by the widget's
        // `r.stars && r.authorName` filter.
        const [index, productReviews] = await Promise.all([
            this.indexService.getFresh(storeId),
            productId ? this.reviewRepo.findVerifiedByStore(storeId, productId) : Promise.resolve([]),
        ]);

        const seen = new Set<string>(productReviews.map((r) => String(r.id || r.reviewId)));
        const reviews: Review[] = [...productReviews];

        for (const r of index.rich) {
            if (seen.has(r.id)) continue;
            seen.add(r.id);
            reviews.push({
                id: r.id,
                reviewId: r.id,
                sallaReviewId: r.sallaReviewId,
                zidDomHash: r.zidDomHash,
                productId: r.productId,
                productName: r.productName,
                stars: r.stars,
                verified: true,
                author: r.authorName ? { displayName: r.authorName } : undefined,
                text: r.text,
                publishedAt: r.publishedAt,
            } as unknown as Review);
        }

        for (const e of index.entries) {
            if (seen.has(e.id)) continue;
            seen.add(e.id);
            // Compact entry: IDs only. No stars/author so the widget's
            // JSON-LD filter skips it; badge matching still works.
            reviews.push({
                id: e.id,
                reviewId: e.id,
                sallaReviewId: e.sallaReviewId,
                zidDomHash: e.zidDomHash,
                productId: e.productId,
                verified: true,
            } as unknown as Review);
        }

        return {
            hasVerified: index.count > 0 || reviews.length > 0,
            reviews,
            count: Math.max(index.count, reviews.length),
        };
    }

    /**
     * Resolve store by domain for widget
     */
    async resolveStoreByDomain(host: string): Promise<StoreResolveResult | null> {
        // Normalize host
        const domain = host
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .toLowerCase();

        // Try domain collection first
        const storeUid = await this.domainRepo.findStoreByDomain(domain);

        let store: Store | null = null;

        if (storeUid) {
            store = await this.storeRepo.findById(storeUid);
        } else {
            // Try direct store lookup by domain
            store = await this.storeRepo.findByDomain(domain);
        }

        if (!store) return null;

        const hasSubscription = store.plan?.active === true;
        const storeName = (store.meta?.userinfo as { merchant?: { name?: string } })?.merchant?.name || 'متجر';
        const storeDomain = store.domain?.base || store.salla?.domain || null;

        return {
            storeUid: store.uid,
            storeName,
            storeDomain,
            hasSubscription,
        };
    }

    /**
     * Check if review is from after subscription start (for verification badge)
     */
    async isReviewVerifiable(storeUid: string, reviewDate: number): Promise<boolean> {
        const subscriptionStart = await this.storeRepo.getSubscriptionStartDate(storeUid);
        if (!subscriptionStart) return false;
        return reviewDate >= subscriptionStart;
    }

    /**
     * Get widget data for a store
     */
    async getWidgetData(storeUid: string): Promise<{
        storeUid: string;
        storeName: string;
        publicReviewUrl: string;
    }> {
        const store = await this.storeRepo.findById(storeUid);

        // Cast to any to access dynamic store properties
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = store as any;

        const storeName = s?.merchant?.name
            || s?.salla?.storeName
            || s?.storeName
            || 'متجرك';

        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || '')
            .replace(/\/+$/, '');
        const publicReviewUrl = `${baseUrl}/s/${encodeURIComponent(storeUid)}`;

        return {
            storeUid,
            storeName,
            publicReviewUrl,
        };
    }

    /**
     * Get platform-wide stats for public display
     */
    async getPlatformStats(): Promise<{ stores: number; reviews: number }> {
        const stores = await this.storeRepo.count();
        const reviews = await this.reviewRepo.count();
        return { stores, reviews };
    }
}


