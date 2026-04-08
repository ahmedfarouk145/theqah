/**
 * Verification service - for widget API
 * @module server/services/verification.service
 */

import { RepositoryFactory } from '../repositories';
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
            console.log(`[VerificationService] store NOT FOUND: ${storeId}`);
            return { hasVerified: false, reviews: [], count: 0 };
        }

        // Check if store has Salla connected flag
        const isConnected = store.salla?.connected !== false && store.salla?.installed !== false;
        if (!isConnected) {
            console.log(`[VerificationService] store NOT CONNECTED: ${storeId} salla.connected=${store.salla?.connected} salla.installed=${store.salla?.installed}`);
            return { hasVerified: false, reviews: [], count: 0 };
        }

        const reviews = await this.reviewRepo.findVerifiedByStore(storeId, productId);

        console.log(`[VerificationService] store=${storeId} productId=${productId || 'all'} → ${reviews.length} verified reviews, sallaIds=[${reviews.map(r => r.sallaReviewId || 'NO_SALLA_ID').join(',')}]`);

        return {
            hasVerified: reviews.length > 0,
            reviews,
            count: reviews.length,
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


