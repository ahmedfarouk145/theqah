/**
 * Domain repository
 * @module server/repositories/domain.repository
 */

import { BaseRepository } from './base.repository';
import type { Domain } from '../core/types';

export class DomainRepository extends BaseRepository<Domain> {
    protected readonly collectionName = 'domains';
    protected readonly idField = 'key';

    /**
     * Encode URL for use as Firestore document ID
     */
    static encodeUrl(url: string): string {
        return url
            .replace(/^https?:\/\//, '')
            .replace(/\//g, '_')
            .replace(/\./g, '_')
            .toLowerCase();
    }

    /**
     * Find store UID by domain
     */
    async findStoreByDomain(domain: string): Promise<string | null> {
        const key = DomainRepository.encodeUrl(domain);
        const domainDoc = await this.findById(key);
        return domainDoc?.storeUid || null;
    }

    /**
     * Save domain mapping
     */
    async saveDomain(
        domain: string,
        storeUid: string,
        provider: string = 'salla'
    ): Promise<void> {
        const key = DomainRepository.encodeUrl(domain);
        await this.set(key, {
            base: domain,
            key,
            uid: storeUid,
            storeUid,
            provider,
        } as Domain);
    }

    /**
     * Save multiple domain variations
     */
    async saveDomainVariations(
        originalDomain: string,
        storeUid: string,
        provider: string = 'salla'
    ): Promise<void> {
        const variations = this.generateVariations(originalDomain);
        const batch = this.db.batch();

        for (const domain of variations) {
            const key = DomainRepository.encodeUrl(domain);
            batch.set(this.collection.doc(key), {
                base: domain,
                key,
                uid: storeUid,
                storeUid,
                provider,
                updatedAt: Date.now(),
            }, { merge: true });
        }

        await batch.commit();
    }

    /**
     * Delete domain mapping
     */
    async deleteDomain(domain: string): Promise<void> {
        const key = DomainRepository.encodeUrl(domain);
        await this.delete(key);
    }

    /**
     * Generate domain variations for better matching
     */
    private generateVariations(domain: string): string[] {
        const base = domain
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .toLowerCase();

        const variations = new Set<string>();
        variations.add(base);

        // With/without www
        if (base.startsWith('www.')) {
            variations.add(base.substring(4));
        } else {
            variations.add(`www.${base}`);
        }

        // Handle salla.sa subdirectory format (salla.sa/username)
        if (base.includes('salla.sa/')) {
            const path = base.split('salla.sa/')[1];
            if (path) {
                variations.add(`salla.sa/${path}`);
                variations.add(`www.salla.sa/${path}`);
            }
        }

        // With/without salla.sa suffix
        if (base.endsWith('.salla.sa')) {
            variations.add(base.replace('.salla.sa', ''));
        }

        return Array.from(variations);
    }

    /**
     * Save a custom domain mapping for a store
     * Used when a store has a custom domain (e.g., pointstylishes.com)
     */
    async saveCustomDomain(
        customDomain: string,
        storeUid: string,
        provider: string = 'salla'
    ): Promise<void> {
        if (!customDomain) return;

        const cleanDomain = customDomain
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '')
            .toLowerCase();

        // Skip platform-specific domains (handled by saveDomainVariations)
        if (cleanDomain.includes('salla.sa') || cleanDomain.includes('salla.dev') ||
            cleanDomain.includes('zid.store') || cleanDomain.includes('zid.sa')) {
            return;
        }

        const variations = [cleanDomain];
        if (cleanDomain.startsWith('www.')) {
            variations.push(cleanDomain.substring(4));
        } else {
            variations.push(`www.${cleanDomain}`);
        }

        const batch = this.db.batch();
        for (const dom of variations) {
            const key = DomainRepository.encodeUrl(dom);
            batch.set(this.collection.doc(key), {
                base: dom,
                key,
                uid: storeUid,
                storeUid,
                provider,
                isCustomDomain: true,
                updatedAt: Date.now(),
            }, { merge: true });
        }

        await batch.commit();
    }
}
