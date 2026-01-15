/**
 * Maintenance service - cleanup, monitoring, and administrative tasks
 * @module server/services/maintenance.service
 */

export class MaintenanceService {
    /**
     * Cleanup old metrics
     */
    async cleanupMetrics(daysOld = 30): Promise<{ deletedCount: number; cutoffDate: string }> {
        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();

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
    async cleanupSyncLogs(daysOld = 60): Promise<{ deletedCount: number; cutoffDate: string }> {
        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();

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
