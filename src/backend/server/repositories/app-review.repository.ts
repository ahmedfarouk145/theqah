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
}

export class AppReviewRepository extends BaseRepository<AppReview> {
    protected readonly collectionName = 'appReviews';

    async findAllActive(): Promise<AppReview[]> {
        return this.query()
            .orderBy('createdAt', 'desc')
            .getAll();
    }
}
