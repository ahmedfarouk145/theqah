/**
 * Repository factory for dependency injection
 * @module server/repositories/factory
 */

import { ReviewRepository } from './review.repository';
import { StoreRepository } from './store.repository';
import { OrderRepository } from './order.repository';
import { OwnerRepository } from './owner.repository';
import { ReviewTokenRepository } from './review-token.repository';
import { DomainRepository } from './domain.repository';
import { AuditLogRepository } from './audit-log.repository';
import type { BaseRepository } from './base.repository';
import type { EntityBase } from '../core/types';

/**
 * Repository factory for centralized repository instantiation
 * Enables dependency injection and testing
 */
export class RepositoryFactory {
    private static instances: Map<string, BaseRepository<EntityBase>> = new Map();

    /**
     * Get ReviewRepository instance
     */
    static getReviewRepository(): ReviewRepository {
        if (!this.instances.has('review')) {
            this.instances.set('review', new ReviewRepository());
        }
        return this.instances.get('review') as ReviewRepository;
    }

    /**
     * Get StoreRepository instance
     */
    static getStoreRepository(): StoreRepository {
        if (!this.instances.has('store')) {
            this.instances.set('store', new StoreRepository());
        }
        return this.instances.get('store') as StoreRepository;
    }

    /**
     * Get OrderRepository instance
     */
    static getOrderRepository(): OrderRepository {
        if (!this.instances.has('order')) {
            this.instances.set('order', new OrderRepository());
        }
        return this.instances.get('order') as OrderRepository;
    }

    /**
     * Get OwnerRepository instance
     */
    static getOwnerRepository(): OwnerRepository {
        if (!this.instances.has('owner')) {
            this.instances.set('owner', new OwnerRepository());
        }
        return this.instances.get('owner') as OwnerRepository;
    }

    /**
     * Get ReviewTokenRepository instance
     */
    static getReviewTokenRepository(): ReviewTokenRepository {
        if (!this.instances.has('reviewToken')) {
            this.instances.set('reviewToken', new ReviewTokenRepository());
        }
        return this.instances.get('reviewToken') as ReviewTokenRepository;
    }

    /**
     * Get DomainRepository instance
     */
    static getDomainRepository(): DomainRepository {
        if (!this.instances.has('domain')) {
            this.instances.set('domain', new DomainRepository());
        }
        return this.instances.get('domain') as DomainRepository;
    }

    /**
     * Get AuditLogRepository instance
     */
    static getAuditLogRepository(): AuditLogRepository {
        if (!this.instances.has('auditLog')) {
            this.instances.set('auditLog', new AuditLogRepository());
        }
        return this.instances.get('auditLog') as AuditLogRepository;
    }

    /**
     * Override a repository instance (for testing)
     */
    static override<T extends BaseRepository<EntityBase>>(name: string, instance: T): void {
        this.instances.set(name, instance);
    }

    /**
     * Reset all instances (for test isolation)
     */
    static reset(): void {
        this.instances.clear();
    }
}
