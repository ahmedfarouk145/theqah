/**
 * Zid store repository — isolated from Salla.
 *
 * Writes:
 *   - Always go to the new `zid_stores` collection.
 *
 * Reads:
 *   - Check `zid_stores` first.
 *   - Fall back to the legacy `stores` collection for any pre-existing
 *     Zid store that hasn't been touched (and therefore lazy-migrated)
 *     since the cut-over.
 *
 * Salla and `easy:*` stores are NOT served by this repository — use
 * `StoreRepository` for those.
 *
 * @module server/repositories/zid-store.repository
 */

import { BaseRepository } from './base.repository';
import type { Store } from '../core/types';

const LEGACY_COLLECTION = 'stores';

export class ZidStoreRepository extends BaseRepository<Store> {
    protected readonly collectionName = 'zid_stores';
    protected readonly idField = 'uid';

    /** Reference to the legacy collection used for read-fallback. */
    private get legacy() {
        return this.db.collection(LEGACY_COLLECTION);
    }

    /**
     * Find a Zid store by its uid. Tries `zid_stores`, falls back to
     * legacy `stores`. Returns null if neither has it.
     */
    override async findById(uid: string): Promise<Store | null> {
        const newDoc = await this.collection.doc(uid).get();
        if (newDoc.exists) return this.mapDoc(newDoc);

        const legacyDoc = await this.legacy.doc(uid).get();
        if (legacyDoc.exists) return this.mapDoc(legacyDoc);

        return null;
    }

    /**
     * Find a Zid store by its Zid store ID (the numeric merchant id from
     * the marketplace). Searches both collections; new wins on conflict.
     */
    async findByZidStoreId(zidStoreId: string): Promise<Store | null> {
        const newSnap = await this.collection
            .where('zid.storeId', '==', zidStoreId)
            .limit(1)
            .get();
        if (!newSnap.empty) return this.mapDoc(newSnap.docs[0]);

        const legacySnap = await this.legacy
            .where('zid.storeId', '==', zidStoreId)
            .limit(1)
            .get();
        if (!legacySnap.empty) return this.mapDoc(legacySnap.docs[0]);

        return null;
    }

    /**
     * Find a Zid store by its primary domain. Searches both collections.
     */
    async findByDomain(domain: string): Promise<Store | null> {
        const newSnap = await this.collection
            .where('domain.base', '==', domain)
            .limit(1)
            .get();
        if (!newSnap.empty) return this.mapDoc(newSnap.docs[0]);

        const legacySnap = await this.legacy
            .where('domain.base', '==', domain)
            .limit(1)
            .get();
        if (!legacySnap.empty) return this.mapDoc(legacySnap.docs[0]);

        return null;
    }

    /**
     * Get denormalized name + domain for emails / widgets.
     */
    async getDenormData(
        storeUid: string,
    ): Promise<{ storeName: string; storeDomain: string | null } | null> {
        const store = await this.findById(storeUid);
        if (!store) return null;

        const storeName =
            (store.meta?.userinfo as { merchant?: { name?: string } })?.merchant?.name ||
            'متجر';
        const storeDomain = store.domain?.base || store.zid?.domain || null;

        return { storeName, storeDomain };
    }

    /**
     * Mark a subscription as active. Writes to `zid_stores` only — if the
     * store exists only in legacy today, this creates a new doc in
     * `zid_stores` with the subscription block, lazy-migrating on touch.
     */
    async updateSubscription(
        storeUid: string,
        planId: string,
        startedAt: number,
        expiresAt?: number | null,
        raw?: object,
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
     * Mark a subscription as expired/cancelled. Writes to `zid_stores`
     * only.
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

    /** True iff the store currently has plan.active === true. */
    async hasActiveSubscription(storeUid: string): Promise<boolean> {
        const store = await this.findById(storeUid);
        return store?.plan?.active === true;
    }

    /** Subscription start timestamp (ms), or null if unknown. */
    async getSubscriptionStartDate(storeUid: string): Promise<number | null> {
        const store = await this.findById(storeUid);
        return store?.subscription?.startedAt || null;
    }

    /** True iff the doc exists in either collection. */
    override async exists(uid: string): Promise<boolean> {
        const newDoc = await this.collection.doc(uid).get();
        if (newDoc.exists) return true;
        const legacyDoc = await this.legacy.doc(uid).get();
        return legacyDoc.exists;
    }
}
