/**
 * Audit log repository
 * @module server/repositories/audit-log.repository
 */

import { BaseRepository } from './base.repository';
import type { EntityBase } from '../core/types';

export interface AuditLog extends EntityBase {
    action: string;
    entityType: string;
    entityId: string;
    userId?: string;
    userEmail?: string;
    storeUid?: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
}

export class AuditLogRepository extends BaseRepository<AuditLog> {
    protected readonly collectionName = 'admin_audit_logs';

    /**
     * Log an action
     */
    async log(
        action: string,
        entityType: string,
        entityId: string,
        options?: {
            userId?: string;
            userEmail?: string;
            storeUid?: string;
            changes?: Record<string, unknown>;
            metadata?: Record<string, unknown>;
            ip?: string;
            userAgent?: string;
        }
    ): Promise<void> {
        await this.create({
            action,
            entityType,
            entityId,
            ...options,
        } as Omit<AuditLog, 'id' | 'createdAt'>);
    }

    /**
     * Find logs by entity
     */
    async findByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
        return this.query()
            .where('entityType', '==', entityType)
            .where('entityId', '==', entityId)
            .orderBy('createdAt', 'desc')
            .getAll();
    }

    /**
     * Find logs by user
     */
    async findByUser(userId: string): Promise<AuditLog[]> {
        return this.query()
            .where('userId', '==', userId)
            .orderBy('createdAt', 'desc')
            .getAll();
    }

    /**
     * Find logs by store
     */
    async findByStore(storeUid: string): Promise<AuditLog[]> {
        return this.query()
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .getAll();
    }
}
