/**
 * Analytics service
 * @module server/services/analytics.service
 */

import { RepositoryFactory } from '../repositories';

export interface ReviewAnalytics {
    totalReviews: number;
    averageRating: number;
    ratingDistribution: Record<number, number>;
    verifiedCount: number;
    pendingCount: number;
}

export interface StoreAnalytics {
    reviews: ReviewAnalytics;
    ordersCount: number;
    conversionRate: number;
}

export class AnalyticsService {
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private orderRepo = RepositoryFactory.getOrderRepository();

    /**
     * Get review analytics for a store
     */
    async getReviewAnalytics(storeUid: string): Promise<ReviewAnalytics> {
        const reviews = await this.reviewRepo.query()
            .where('storeUid', '==', storeUid)
            .getAll();

        const totalReviews = reviews.length;
        const averageRating = totalReviews > 0
            ? reviews.reduce((sum, r) => sum + r.stars, 0) / totalReviews
            : 0;

        const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let verifiedCount = 0;
        let pendingCount = 0;

        for (const review of reviews) {
            ratingDistribution[review.stars] = (ratingDistribution[review.stars] || 0) + 1;
            if (review.verified) verifiedCount++;
            if (review.status === 'pending' || review.status === 'pending_review') pendingCount++;
        }

        return {
            totalReviews,
            averageRating: Math.round(averageRating * 10) / 10,
            ratingDistribution,
            verifiedCount,
            pendingCount,
        };
    }

    /**
     * Get full store analytics
     */
    async getStoreAnalytics(storeUid: string): Promise<StoreAnalytics> {
        const reviewAnalytics = await this.getReviewAnalytics(storeUid);
        const orders = await this.orderRepo.findByStoreUid(storeUid);

        const ordersCount = orders.length;
        const conversionRate = ordersCount > 0
            ? (reviewAnalytics.totalReviews / ordersCount) * 100
            : 0;

        return {
            reviews: reviewAnalytics,
            ordersCount,
            conversionRate: Math.round(conversionRate * 10) / 10,
        };
    }
}
