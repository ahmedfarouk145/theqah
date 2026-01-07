/**
 * Admin service - platform administration
 * @module server/services/admin.service
 */

import { RepositoryFactory } from '../repositories';
import type { Store, Review, PaginatedResult, PaginationOptions } from '../core/types';

export interface PlatformStats {
    totalStores: number;
    activeStores: number;
    totalReviews: number;
    pendingReviews: number;
}

export class AdminService {
    private storeRepo = RepositoryFactory.getStoreRepository();
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private auditRepo = RepositoryFactory.getAuditLogRepository();

    /**
     * Get platform stats
     */
    async getPlatformStats(): Promise<PlatformStats> {
        // Note: In production, these should be aggregated/cached
        const stores = await this.storeRepo.findAll();
        const activeStores = stores.filter(s => s.plan?.active === true).length;

        return {
            totalStores: stores.length,
            activeStores,
            totalReviews: 0, // Would need aggregation
            pendingReviews: 0, // Would need aggregation
        };
    }

    /**
     * List all stores
     */
    async listStores(options?: PaginationOptions): Promise<PaginatedResult<Store>> {
        return this.storeRepo.findPaginated(options);
    }

    /**
     * Get store details
     */
    async getStoreDetails(storeUid: string): Promise<Store | null> {
        return this.storeRepo.findById(storeUid);
    }

    /**
     * Get store reviews
     */
    async getStoreReviews(
        storeUid: string,
        options?: PaginationOptions
    ): Promise<PaginatedResult<Review>> {
        return this.reviewRepo.findByStoreUid(storeUid, options);
    }

    /**
     * Bulk update review status
     */
    async bulkUpdateReviewStatus(
        reviewIds: string[],
        status: string,
        published: boolean,
        adminUid: string
    ): Promise<{ success: number; failed: number }> {
        let success = 0;
        let failed = 0;

        for (const reviewId of reviewIds) {
            try {
                await this.reviewRepo.updateStatus(reviewId, status, published);
                await this.auditRepo.log('bulk_update_status', 'review', reviewId, {
                    userId: adminUid,
                    changes: { status, published },
                });
                success++;
            } catch {
                failed++;
            }
        }

        return { success, failed };
    }

    /**
     * Override store subscription
     */
    async overrideSubscription(
        storeUid: string,
        planId: string,
        startedAt: number,
        adminUid: string
    ): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, planId, startedAt);
        await this.auditRepo.log('override_subscription', 'store', storeUid, {
            userId: adminUid,
            changes: { planId, startedAt },
        });
    }
}
