/**
 * Owner repository (OAuth tokens)
 * @module server/repositories/owner.repository
 */

import { BaseRepository } from './base.repository';
import type { Owner } from '../core/types';

export class OwnerRepository extends BaseRepository<Owner> {
    protected readonly collectionName = 'owners';
    protected readonly idField = 'uid';

    /**
     * Save OAuth tokens for a store
     */
    async saveOAuth(
        storeUid: string,
        provider: string,
        oauth: {
            access_token: string;
            refresh_token?: string;
            scope?: string;
            expires?: number;
            strategy?: string;
        }
    ): Promise<void> {
        await this.set(storeUid, {
            uid: storeUid,
            provider,
            oauth: {
                ...oauth,
                receivedAt: Date.now(),
                strategy: oauth.strategy || 'easy_mode',
            },
        } as Owner);
    }

    /**
     * Get access token for a store
     */
    async getAccessToken(storeUid: string): Promise<string | null> {
        const owner = await this.findById(storeUid);
        return owner?.oauth?.access_token || null;
    }

    /**
     * Update access token (after refresh)
     */
    async updateAccessToken(
        storeUid: string,
        accessToken: string,
        expires?: number
    ): Promise<void> {
        const owner = await this.findById(storeUid);
        if (!owner) return;

        await this.set(storeUid, {
            oauth: {
                ...owner.oauth,
                access_token: accessToken,
                receivedAt: Date.now(),
                ...(expires && { expires }),
            },
        } as Partial<Owner>);
    }

    /**
     * Check if token needs refresh
     */
    async needsRefresh(storeUid: string, bufferMs: number = 300000): Promise<boolean> {
        const owner = await this.findById(storeUid);
        if (!owner?.oauth?.expires) return false;

        const expiresAt = owner.oauth.expires * 1000; // Convert to ms if in seconds
        return Date.now() + bufferMs >= expiresAt;
    }
}
