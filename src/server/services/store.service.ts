/**
 * Store service - store business logic
 * @module server/services/store.service
 */

import { RepositoryFactory } from '../repositories';
import type { Store } from '../core/types';

export class StoreService {
    private storeRepo = RepositoryFactory.getStoreRepository();
    private domainRepo = RepositoryFactory.getDomainRepository();

    /**
     * Get store by ID
     */
    async getStore(storeUid: string): Promise<Store | null> {
        return this.storeRepo.findById(storeUid);
    }

    /**
     * Get store denormalized data (name and domain)
     */
    async getStoreDenormData(storeUid: string): Promise<{ storeName: string; storeDomain: string | null }> {
        const result = await this.storeRepo.getDenormData(storeUid);
        if (!result) {
            return { storeName: 'متجر', storeDomain: null };
        }
        return result;
    }

    /**
     * Resolve store by domain (for widget)
     */
    async resolveStoreByDomain(domain: string): Promise<Store | null> {
        // First try direct store lookup
        const storeByDomain = await this.storeRepo.findByDomain(domain);
        if (storeByDomain) return storeByDomain;

        // Try domain collection
        const storeUid = await this.domainRepo.findStoreByDomain(domain);
        if (storeUid) {
            return this.storeRepo.findById(storeUid);
        }

        return null;
    }

    /**
     * Update store subscription
     */
    async updateSubscription(
        storeUid: string,
        planId: string,
        startedAt: number,
        raw?: object
    ): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, planId, startedAt, raw);
    }

    /**
     * Check if store has active subscription
     */
    async hasActiveSubscription(storeUid: string): Promise<boolean> {
        return this.storeRepo.hasActiveSubscription(storeUid);
    }

    /**
     * Get subscription start date
     */
    async getSubscriptionStartDate(storeUid: string): Promise<number | null> {
        return this.storeRepo.getSubscriptionStartDate(storeUid);
    }

    /**
     * Save store domain
     */
    async saveDomain(storeUid: string, domain: string): Promise<void> {
        const key = domain
            .replace(/^https?:\/\//, '')
            .replace(/\//g, '_')
            .replace(/\./g, '_')
            .toLowerCase();

        await this.storeRepo.updateDomain(storeUid, domain, key);
        await this.domainRepo.saveDomainVariations(domain, storeUid);
    }

    /**
     * Get store by Salla ID
     */
    async getStoreBySallaId(sallaStoreId: string): Promise<Store | null> {
        return this.storeRepo.findBySallaId(sallaStoreId);
    }
}
