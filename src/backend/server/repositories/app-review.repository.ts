/**
 * App Review repository - for Salla app store reviews displayed on landing page
 * @module server/repositories/app-review.repository
 */

import { BaseRepository } from './base.repository';
import type { EntityBase } from '../core/types';

export interface AppReview extends EntityBase {
    storeName: string;
    stars: number;
    text: string;
    reviewDate: string;
    source: string; // 'salla'
    /** Store logo URL from Salla CDN (optional, captured at sync time). */
    avatar?: string | null;
    /** Public store URL resolved by matching the reviewer's merchant name
     *  against installed stores in the `stores` collection at sync time. */
    storeUrl?: string | null;
}

export class AppReviewRepository extends BaseRepository<AppReview> {
    protected readonly collectionName = 'appReviews';

    async findAllActive(): Promise<AppReview[]> {
        return this.query()
            .orderBy('createdAt', 'desc')
            .getAll();
    }
}
