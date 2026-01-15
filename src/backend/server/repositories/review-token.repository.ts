/**
 * Review token repository
 * @module server/repositories/review-token.repository
 */

import { BaseRepository } from './base.repository';
import { TokenError } from '../core/errors';
import type { ReviewToken } from '../core/types';

export class ReviewTokenRepository extends BaseRepository<ReviewToken> {
    protected readonly collectionName = 'review_tokens';

    /**
     * Find and validate a token
     * @throws TokenError if token is invalid, expired, used, or voided
     */
    async findValid(tokenId: string): Promise<ReviewToken> {
        const token = await this.findById(tokenId);

        if (!token) {
            throw new TokenError('not_found');
        }

        if (token.voided || token.voidedAt) {
            throw new TokenError('voided');
        }

        if (token.usedAt) {
            throw new TokenError('used');
        }

        if (token.expiresAt && token.expiresAt < Date.now()) {
            throw new TokenError('expired');
        }

        return token;
    }

    /**
     * Mark token as used
     */
    async markUsed(tokenId: string): Promise<void> {
        await this.update(tokenId, {
            usedAt: Date.now(),
        } as Partial<ReviewToken>);
    }

    /**
     * Void a token
     */
    async void(tokenId: string, reason?: string): Promise<void> {
        await this.update(tokenId, {
            voided: true,
            voidedAt: Date.now(),
            voidReason: reason,
        } as unknown as Partial<ReviewToken>);
    }

    /**
     * Void all tokens for an order
     */
    async voidByOrderId(orderId: string, reason: string): Promise<number> {
        const tokens = await this.query()
            .where('orderId', '==', orderId)
            .getAll();

        if (tokens.length === 0) return 0;

        const batch = this.db.batch();
        for (const token of tokens) {
            if (token.id) {
                batch.update(this.getDocRef(token.id), {
                    voided: true,
                    voidedAt: Date.now(),
                    voidReason: reason,
                    updatedAt: Date.now(),
                });
            }
        }
        await batch.commit();

        return tokens.length;
    }

    /**
     * Find tokens by order
     */
    async findByOrderId(orderId: string): Promise<ReviewToken[]> {
        return this.query()
            .where('orderId', '==', orderId)
            .getAll();
    }

    /**
     * Find tokens by store
     */
    async findByStoreUid(storeUid: string): Promise<ReviewToken[]> {
        return this.query()
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .getAll();
    }
}
