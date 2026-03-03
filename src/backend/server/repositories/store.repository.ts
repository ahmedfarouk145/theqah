/**
 * Store repository
 * @module server/repositories/store.repository
 */

import { BaseRepository } from './base.repository';
import type { Store } from '../core/types';

export class StoreRepository extends BaseRepository<Store> {
    protected readonly collectionName = 'stores';
    protected readonly idField = 'uid';

    /**
     * Find store by domain (nested field query)
     */
    async findByDomain(domain: string): Promise<Store | null> {
        const snapshot = await this.collection
            .where('domain.base', '==', domain)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        return this.mapDoc(snapshot.docs[0]);
    }

    /**
     * Find store by Salla store ID (nested field query)
     */
    async findBySallaId(sallaStoreId: string): Promise<Store | null> {
        const snapshot = await this.collection
            .where('salla.storeId', '==', sallaStoreId)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        return this.mapDoc(snapshot.docs[0]);
    }

    /**
     * Get store denormalized data (name, domain)
     */
    async getDenormData(storeUid: string): Promise<{ storeName: string; storeDomain: string | null } | null> {
        const store = await this.findById(storeUid);
        if (!store) return null;

        const storeName = (store.meta?.userinfo as { merchant?: { name?: string } })?.merchant?.name || 'متجر';
        const storeDomain = store.domain?.base || store.salla?.domain || null;

        return { storeName, storeDomain };
    }

    /**
     * Update subscription
     */
    async updateSubscription(
        storeUid: string,
        planId: string,
        startedAt: number,
        expiresAt?: number | null,
        raw?: object
    ): Promise<void> {
        const now = Date.now();
        await this.set(storeUid, {
            subscription: {
                planId,
                startedAt,
                ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
                syncedAt: now,
                raw,
                updatedAt: now,
            },
            plan: {
                code: planId,
                active: true,
                updatedAt: now,
            },
        } as Partial<Store>);
    }

    /**
     * Update domain
     */
    async updateDomain(storeUid: string, domain: string, key: string): Promise<void> {
        await this.set(storeUid, {
            domain: {
                base: domain,
                key,
                updatedAt: Date.now(),
            },
        } as Partial<Store>);
    }

    /**
     * Check if store has active subscription
     */
    async hasActiveSubscription(storeUid: string): Promise<boolean> {
        const store = await this.findById(storeUid);
        return store?.plan?.active === true;
    }

    /**
     * Deactivate subscription (expired/cancelled)
     */
    async deactivateSubscription(storeUid: string, raw?: object): Promise<void> {
        const now = Date.now();
        await this.set(storeUid, {
            subscription: {
                planId: 'TRIAL',
                expiresAt: now,
                expiredAt: now,
                syncedAt: now,
                raw,
                updatedAt: now,
            },
            plan: {
                code: 'TRIAL',
                active: false,
                expiredAt: now,
                updatedAt: now,
            },
        } as Partial<Store>);
    }

    /**
     * Get subscription start date
     */
    async getSubscriptionStartDate(storeUid: string): Promise<number | null> {
        const store = await this.findById(storeUid);
        return store?.subscription?.startedAt || null;
    }
}
