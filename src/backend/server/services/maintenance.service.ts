/**
 * Maintenance service - cleanup, monitoring, and administrative tasks
 * @module server/services/maintenance.service
 */

import { MONITORING, RETENTION } from '@/config/constants';

export class MaintenanceService {
    private async getDb() {
        const { getDb } = await import('@/server/firebase-admin');
        return getDb();
    }

    private async cleanupByNumberField(
        collectionName: string,
        field: string,
        cutoff: number
    ): Promise<number> {
        const db = await this.getDb();
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
            const snapshot = await db
                .collection(collectionName)
                .where(field, '<', cutoff)
                .limit(500)
                .get();

            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                batch.delete(doc.ref);
                totalDeleted++;
            });

            await batch.commit();
            hasMore = snapshot.size === 500;
        }

        return totalDeleted;
    }

    /**
     * Cleanup temporary artifacts and short-lived operational data
     */
    async cleanupRetentionArtifacts(): Promise<Record<string, number>> {
        const now = Date.now();
        const setupUsedCutoff = now - RETENTION.SETUP_TOKENS_USED_GRACE_MS;
        const onboardingUsedCutoff = now - RETENTION.ONBOARDING_TOKENS_USED_GRACE_MS;
        const oauthStateCutoff = now - RETENTION.OAUTH_STATE_GRACE_MS;
        const rateLimitCutoff = now - RETENTION.RATE_LIMIT_COUNTER_GRACE_MS;
        const processedEventsCutoff = now - RETENTION.PROCESSED_EVENTS_RETENTION_MS;
        const widgetImpressionsCutoff = now - RETENTION.WIDGET_IMPRESSIONS_RETENTION_MS;
        const authLogsCutoff = now - RETENTION.AUTH_LOGS_RETENTION_MS;
        const emailLogsCutoff = now - RETENTION.EMAIL_LOGS_RETENTION_MS;
        const smsLogsCutoff = now - RETENTION.SMS_LOGS_RETENTION_MS;
        const registrationLogsCutoff = now - RETENTION.REGISTRATION_LOGS_RETENTION_MS;

        const { cleanupOldActivity } = await import('@/server/activity-tracker');
        const { cleanupExpiredKeys } = await import('@/server/utils/idempotency');

        return {
            setupTokensExpired: await this.cleanupByNumberField('setup_tokens', 'expiresAt', now),
            setupTokensUsed: await this.cleanupByNumberField('setup_tokens', 'usedAt', setupUsedCutoff),
            onboardingTokensExpired: await this.cleanupByNumberField('onboarding_tokens', 'expiresAt', now),
            onboardingTokensUsed: await this.cleanupByNumberField('onboarding_tokens', 'usedAt', onboardingUsedCutoff),
            zidStatesExpired: await this.cleanupByNumberField('zid_states', 'expiresAt', oauthStateCutoff),
            rateLimitsExpired: await this.cleanupByNumberField('ratelimits', 'resetAt', rateLimitCutoff),
            processedEventsExpired: await this.cleanupByNumberField('processed_events', 'at', processedEventsCutoff),
            idempotencyKeysExpired: await cleanupExpiredKeys({ ttlMs: RETENTION.IDEMPOTENCY_KEYS_RETENTION_MS }),
            userActivityExpired: (await cleanupOldActivity()).deleted,
            widgetImpressionsExpired: await this.cleanupByNumberField('widget_impressions', 'at', widgetImpressionsCutoff),
            authLogsExpired: await this.cleanupByNumberField('auth_logs', 'timestamp', authLogsCutoff),
            emailLogsExpired: await this.cleanupByNumberField('email_logs', 'timestamp', emailLogsCutoff),
            smsLogsTimestampExpired: await this.cleanupByNumberField('sms_logs', 'timestamp', smsLogsCutoff),
            smsLogsAtExpired: await this.cleanupByNumberField('sms_logs', 'at', smsLogsCutoff),
            registrationLogsExpired: await this.cleanupByNumberField('registration_logs', 'timestamp', registrationLogsCutoff),
        };
    }

    /**
     * Cleanup old metrics
     */
    async cleanupMetrics(daysOld: number = 30): Promise<{ deletedCount: number; cutoffDate: string }> {
        const db = await this.getDb();

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const metricsRef = db.collection('metrics');
        const query = metricsRef.where('timestamp', '<', cutoffDate);

        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
            const snapshot = await query.limit(500).get();
            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                batch.delete(doc.ref);
                totalDeleted++;
            });

            await batch.commit();
            hasMore = snapshot.size === 500;
        }

        // Log cleanup
        await db.collection('metrics').add({
            timestamp: new Date(),
            type: 'cleanup',
            severity: 'info',
            metadata: { deletedCount: totalDeleted, cutoffDate: cutoffDate.toISOString(), daysOld },
        });

        return { deletedCount: totalDeleted, cutoffDate: cutoffDate.toISOString() };
    }

    /**
     * Cleanup old sync logs
     */
    async cleanupSyncLogs(daysOld: number = MONITORING.LOGS_RETENTION_DAYS): Promise<{ deletedCount: number; cutoffDate: string }> {
        const db = await this.getDb();

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const query = db.collection('syncLogs').where('timestamp', '<', cutoffDate);

        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
            const snapshot = await query.limit(500).get();
            if (snapshot.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
                batch.delete(doc.ref);
                totalDeleted++;
            });

            await batch.commit();
            hasMore = snapshot.size === 500;
        }

        // Log cleanup
        await db.collection('metrics').add({
            timestamp: new Date(),
            type: 'cleanup',
            severity: 'info',
            metadata: { collection: 'syncLogs', deletedCount: totalDeleted, cutoffDate: cutoffDate.toISOString(), daysOld },
        });

        return { deletedCount: totalDeleted, cutoffDate: cutoffDate.toISOString() };
    }

    /**
     * List review reports (alerts)
     */
    async listReviewReports(resolved?: boolean, limit = 200): Promise<unknown[]> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        let q: FirebaseFirestore.Query = db.collection('review_reports');
        if (resolved === true) q = q.where('resolved', '==', true);
        else if (resolved === false) q = q.where('resolved', '==', false);

        q = q.orderBy('createdAt', 'desc').limit(limit);
        const snap = await q.get();

        return snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                reason: data.reason ?? '',
                reviewId: data.reviewId ?? '',
                createdAt: this.toMillis(data.createdAt),
                email: data.email,
                name: data.name,
                resolved: Boolean(data.resolved),
                resolvedAt: this.toMillis(data.resolvedAt),
            };
        });
    }

    /**
     * Resolve or delete a review report
     */
    async resolveReport(reportId: string, action: 'resolve' | 'delete'): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const ref = db.collection('review_reports').doc(reportId);
        const snap = await ref.get();
        if (!snap.exists) throw new Error('Report not found');

        if (action === 'delete') {
            await ref.delete();
        } else {
            await ref.update({ resolved: true, resolvedAt: new Date() });
        }

        await db.collection('admin_audit_logs').add({
            action: `report-${action}`,
            reportId,
            createdAt: new Date(),
        }).catch(e => console.warn('audit log failed', e));
    }

    /**
     * Export all reviews (for debugging)
     */
    async exportReviews(): Promise<{ total: number; reviews: unknown[]; summary: Record<string, number> }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const snap = await db.collection('reviews').get();
        const reviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const summary = {
            total: reviews.length,
            withNeedsSallaId: reviews.filter((r) => (r as Record<string, unknown>).needsSallaId).length,
            withSallaReviewId: reviews.filter((r) => (r as Record<string, unknown>).sallaReviewId).length,
            verified: reviews.filter((r) => (r as Record<string, unknown>).verified).length,
            sallaNative: reviews.filter((r) => (r as Record<string, unknown>).source === 'salla_native').length,
        };

        return { total: reviews.length, reviews, summary };
    }

    // Helper: Convert Firestore timestamp or number to milliseconds
    private toMillis(v: unknown): number | undefined {
        if (typeof v === 'number') return v;
        if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
            return (v as { toDate: () => Date }).toDate().getTime();
        }
        return undefined;
    }
}
