/**
 * Monitoring service - system health and metrics
 * @module server/services/monitoring.service
 */

import { getDB } from '../core';

export interface HealthCheck {
    service: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    latencyMs?: number;
    message?: string;
}

export interface SystemHealth {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    timestamp: number;
}

export interface SyncStats {
    lastSyncAt: number | null;
    reviewsSynced: number;
    errors: number;
}

export class MonitoringService {
    /**
     * Get overall system health
     */
    async getSystemHealth(): Promise<SystemHealth> {
        const checks: HealthCheck[] = [];

        // Check Firestore
        const firestoreCheck = await this.checkFirestore();
        checks.push(firestoreCheck);

        // Determine overall status
        const hasUnhealthy = checks.some(c => c.status === 'unhealthy');
        const hasDegraded = checks.some(c => c.status === 'degraded');

        return {
            overall: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
            checks,
            timestamp: Date.now(),
        };
    }

    /**
     * Check Firestore connectivity
     */
    private async checkFirestore(): Promise<HealthCheck> {
        const start = Date.now();
        try {
            const db = getDB().db;
            await db.collection('_health').doc('ping').get();
            return {
                service: 'firestore',
                status: 'healthy',
                latencyMs: Date.now() - start,
            };
        } catch (error) {
            return {
                service: 'firestore',
                status: 'unhealthy',
                latencyMs: Date.now() - start,
                message: (error as Error).message,
            };
        }
    }

    /**
     * Get sync stats for a store
     */
    async getSyncStats(storeUid: string): Promise<SyncStats> {
        const db = getDB().db;
        const logsRef = db.collection('sync_logs')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(100);

        const snapshot = await logsRef.get();

        if (snapshot.empty) {
            return { lastSyncAt: null, reviewsSynced: 0, errors: 0 };
        }

        const logs = snapshot.docs.map(d => d.data());
        const lastLog = logs[0];
        const errors = logs.filter(l => l.level === 'error').length;
        const synced = logs.filter(l => l.action === 'review_synced').length;

        return {
            lastSyncAt: lastLog.createdAt as number,
            reviewsSynced: synced,
            errors,
        };
    }

    /**
     * Get app metrics
     */
    async getAppMetrics(): Promise<Record<string, number>> {
        const db = getDB().db;

        // Get counts from metrics collection
        const metricsDoc = await db.collection('_metrics').doc('current').get();
        const metrics = metricsDoc.data() || {};

        return {
            webhooksReceived: metrics.webhooksReceived || 0,
            reviewsProcessed: metrics.reviewsProcessed || 0,
            errorsLast24h: metrics.errorsLast24h || 0,
            avgResponseTimeMs: metrics.avgResponseTimeMs || 0,
        };
    }

    /**
     * Log metric
     */
    async logMetric(name: string, value: number): Promise<void> {
        const db = getDB().db;
        const { FieldValue } = await import('firebase-admin/firestore');

        await db.collection('_metrics').doc('current').set({
            [name]: FieldValue.increment(value),
            lastUpdated: Date.now(),
        }, { merge: true });
    }
}
