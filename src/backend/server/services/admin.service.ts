/**
 * Admin service - platform administration
 * @module server/services/admin.service
 */

import { RepositoryFactory } from '../repositories';
import type { Store, Review, PaginatedResult, PaginationOptions } from '../core/types';
import { LIMITS } from '@/config/constants';

export interface PlatformStats {
    totalStores: number;
    activeStores: number;
    totalReviews: number;
    pendingReviews: number;
}

export interface DashboardStats {
    totalStores: number;
    totalReviews: number;
    totalAlerts: number;
    publishedReviews: number;
    pendingReviews: number;
    fetchedAt: string;
}

export interface AdminAlert {
    id?: string;
    message: string;
    level: 'info' | 'warn' | 'error';
    createdAt: number;
    createdBy?: string | null;
}

type FirestoreDoc = Record<string, unknown>;

function toDateValue(value: unknown): Date | undefined {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        return new Date(value);
    }

    if (
        typeof value === 'object' &&
        value !== null &&
        'toDate' in value &&
        typeof (value as { toDate?: () => Date }).toDate === 'function'
    ) {
        return (value as { toDate: () => Date }).toDate();
    }

    return undefined;
}

function isAliasStoreDoc(docId: string, data: FirestoreDoc | undefined): boolean {
    return typeof data?.storeUid === 'string' && data.storeUid !== docId;
}

function isPublishedReviewDoc(data: FirestoreDoc | undefined): boolean {
    return data?.published === true || data?.status === 'published' || data?.status === 'approved';
}

function resolveStoreDisplayName(data: FirestoreDoc | undefined): string {
    const meta = (data?.meta || {}) as FirestoreDoc;
    const userinfo = (meta.userinfo || {}) as FirestoreDoc;
    const payload = (userinfo.data || userinfo.context || {}) as FirestoreDoc;
    const merchant = (payload.merchant || {}) as FirestoreDoc;
    const store = (payload.store || {}) as FirestoreDoc;

    return (
        (typeof merchant.name === 'string' ? merchant.name : undefined) ||
        (typeof store.name === 'string' ? store.name : undefined) ||
        (typeof data?.storeName === 'string' ? data.storeName : undefined) ||
        (typeof data?.name === 'string' ? data.name : undefined) ||
        ((data?.salla || {}) as FirestoreDoc).storeName as string ||
        'غير محدد'
    );
}

function resolveStoreDomainValue(data: FirestoreDoc | undefined): string | null {
    const domain = data?.domain;
    if (typeof domain === 'string') {
        return domain;
    }

    const domainObject = (domain || {}) as FirestoreDoc;
    const salla = (data?.salla || {}) as FirestoreDoc;
    const zid = (data?.zid || {}) as FirestoreDoc;

    return (
        (typeof domainObject.base === 'string' ? domainObject.base : undefined) ||
        (typeof salla.domain === 'string' ? salla.domain : undefined) ||
        (typeof zid.domain === 'string' ? zid.domain : undefined) ||
        null
    );
}

export class AdminService {
    private storeRepo = RepositoryFactory.getStoreRepository();
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private auditRepo = RepositoryFactory.getAuditLogRepository();

    /**
     * Get dashboard stats
     */
    async getDashboardStats(): Promise<DashboardStats> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        let totalStores = 0;
        let totalReviews = 0;
        let totalAlerts = 0;
        let publishedReviews = 0;
        let pendingReviews = 0;

        try {
            const [storesSnap, reviewsSnap, alertsSnap] = await Promise.all([
                db.collection('stores').select('storeUid').get(),
                db.collection('reviews').select('published', 'status').get(),
                db.collection('review_reports').count().get(),
            ]);

            totalStores = storesSnap.docs.filter((doc) => !isAliasStoreDoc(doc.id, doc.data() as FirestoreDoc)).length;
            totalReviews = reviewsSnap.size;
            totalAlerts = alertsSnap.data().count;
            publishedReviews = reviewsSnap.docs.filter((doc) => isPublishedReviewDoc(doc.data() as FirestoreDoc)).length;
            pendingReviews = totalReviews - publishedReviews;
        } catch {
            /* */
        }

        return { totalStores, totalReviews, totalAlerts, publishedReviews, pendingReviews, fetchedAt: new Date().toISOString() };
    }

    /**
     * Get platform stats
     */
    async getPlatformStats(): Promise<PlatformStats> {
        const stores = await this.storeRepo.findAll();
        const activeStores = stores.filter(s => s.plan?.active === true).length;

        return {
            totalStores: stores.length,
            activeStores,
            totalReviews: 0,
            pendingReviews: 0,
        };
    }

    /**
     * List all stores
     */
    async listStores(options?: PaginationOptions): Promise<PaginatedResult<Store>> {
        return this.storeRepo.findPaginated(options);
    }

    /**
     * Get store details
     */
    async getStoreDetails(storeUid: string): Promise<Store | null> {
        return this.storeRepo.findById(storeUid);
    }

    /**
     * Get store reviews
     */
    async getStoreReviews(storeUid: string, options?: PaginationOptions): Promise<PaginatedResult<Review>> {
        return this.reviewRepo.findByStoreUid(storeUid, options);
    }

    /**
     * Bulk update review status
     */
    async bulkUpdateReviewStatus(
        reviewIds: string[],
        status: string,
        published: boolean,
        adminUid: string
    ): Promise<{ success: number; failed: number }> {
        let success = 0, failed = 0;

        for (const reviewId of reviewIds) {
            try {
                await this.reviewRepo.updateStatus(reviewId, status, published);
                await this.auditRepo.log('bulk_update_status', 'review', reviewId, {
                    userId: adminUid,
                    changes: { status, published },
                });
                success++;
            } catch {
                failed++;
            }
        }

        return { success, failed };
    }

    /**
     * Override store subscription
     */
    async overrideSubscription(storeUid: string, planId: string, startedAt: number, adminUid: string): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, planId, startedAt);
        await this.auditRepo.log('override_subscription', 'store', storeUid, {
            userId: adminUid,
            changes: { planId, startedAt },
        });
    }

    /**
     * List alerts
     */
    async listAlerts(limit = 100, cursor?: string): Promise<{ alerts: AdminAlert[]; nextCursor: string | null }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const limitNum = Math.min(limit, 100);
        let q = db.collection('admin_alerts').orderBy('createdAt', 'desc').limit(limitNum + 1);

        if (cursor) {
            const doc = await db.collection('admin_alerts').doc(cursor).get();
            if (doc.exists) q = q.startAfter(doc);
        }

        const snap = await q.get();
        const alerts = snap.docs.slice(0, limitNum).map(d => ({ id: d.id, ...d.data() } as AdminAlert));
        const nextCursor = snap.docs.length > limitNum ? snap.docs[limitNum - 1].id : null;

        return { alerts, nextCursor };
    }

    /**
     * Create alert
     */
    async createAlert(alert: Omit<AdminAlert, 'id'>): Promise<string> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const ref = await db.collection('admin_alerts').add({
            message: String(alert.message).slice(0, 1000),
            level: alert.level,
            createdAt: Date.now(),
            createdBy: alert.createdBy || null,
        });

        // Audit log
        await this.auditRepo.log('create_alert', 'system', ref.id, {
            userId: alert.createdBy || 'system',
            changes: { message: alert.message, level: alert.level }
        });

        return ref.id;
    }

    /**
     * List feedback
     */
    async listFeedback(limit = 100, cursor?: string): Promise<{ feedback: unknown[]; nextCursor: string | null }> {
        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();
        const limitNum = Math.min(limit, 100);
        let q = db.collection('feedback').orderBy('createdAt', 'desc').limit(limitNum + 1);

        if (cursor) {
            const doc = await db.collection('feedback').doc(cursor).get();
            if (doc.exists) q = q.startAfter(doc);
        }

        const snap = await q.get();
        const docs = snap.docs.slice(0, limitNum);
        const feedback = docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: toDateValue(doc.data().createdAt),
            resolvedAt: toDateValue(doc.data().resolvedAt),
        }));

        const nextCursor = snap.docs.length > limitNum ? snap.docs[limitNum - 1].id : null;
        return { feedback, nextCursor };
    }

    /**
     * Update feedback status
     */
    async updateFeedbackStatus(feedbackId: string, status: string, notes?: string): Promise<void> {
        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();
        const updateData: Record<string, unknown> = { status };
        if (status === 'resolved') updateData.resolvedAt = new Date();
        if (notes) updateData.notes = notes;
        await db.collection('feedback').doc(feedbackId).update(updateData);

        await this.auditRepo.log('update_feedback', 'feedback', feedbackId, {
            changes: { status, notes }
        });
    }

    /**
     * Delete feedback
     */
    async deleteFeedback(feedbackId: string): Promise<void> {
        const { getDb } = await import('@/server/firebase-admin');
        const db = getDb();
        await db.collection('feedback').doc(feedbackId).delete();
        await this.auditRepo.log('delete_feedback', 'feedback', feedbackId, {});
    }

    /**
     * List users
     */
    async listUsers(search?: string, limit = 50, cursor?: string): Promise<{ users: unknown[]; nextCursor: string | null }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();
        const lim = Math.min(limit, 200);

        let query: FirebaseFirestore.Query = db.collection('users');
        if (search && search.trim()) {
            const qLower = search.toLowerCase();
            query = query
                .where('emailLower', '>=', qLower)
                .where('emailLower', '<=', qLower + '\uf8ff');
        } else {
            // Only order by email if no search, or simply default order if not searching
            // If searching, we rely on the range filter which implicitly orders
            query = query.orderBy('emailLower');
        }

        query = query.limit(lim + 1);

        if (cursor) {
            const doc = await db.collection('users').doc(cursor).get();
            if (doc.exists) query = query.startAfter(doc);
        }

        const snap = await query.get();
        const docs = snap.docs.slice(0, lim);
        const users = docs.map(d => ({ id: d.id, ...d.data() }));
        const nextCursor = snap.docs.length > lim ? snap.docs[lim - 1].id : null;

        return { users, nextCursor };
    }

    /**
     * Set user admin claim
     */
    async setUserAdminClaim(uid: string, isAdmin: boolean, adminUid?: string): Promise<void> {
        const { authAdmin } = await import('@/lib/firebaseAdmin');
        await authAdmin().setCustomUserClaims(uid, { admin: isAdmin });

        await this.auditRepo.log('set_admin_claim', 'user', uid, {
            userId: adminUid || 'system',
            changes: { isAdmin }
        });
    }

    /**
     * Get single review with store info for admin
     */
    async getReviewWithStore(reviewId: string): Promise<{ review: unknown; storeName: string } | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const snap = await db.collection('reviews').doc(reviewId).get();
        if (!snap.exists) return null;

        const d = snap.data() || {};
        let storeName = 'غير محدد';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = d as any;
        if (data.storeName) {
            storeName = data.storeName;
        } else if (data.storeUid) {
            let sDoc = await db.collection('stores').doc(data.storeUid).get();
            if (!sDoc.exists) {
                const qs = await db.collection('stores').where('uid', '==', data.storeUid).limit(1).get();
                sDoc = qs.docs[0];
            }
            storeName = resolveStoreDisplayName((sDoc?.data() as FirestoreDoc | undefined) || undefined);
        }

        return { review: d, storeName };
    }

    /**
     * Update review (admin)
     */
    async updateReview(reviewId: string, updates: {
        published?: boolean;
        status?: string;
        moderatorNote?: string;
    }): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const now = Date.now();
        const updateData: Record<string, unknown> = { lastModified: new Date(now) };

        if (updates.published !== undefined) {
            updateData.published = updates.published;
            updateData.status = updates.published ? 'published' : 'hidden';
            updateData.publishedAt = updates.published ? now : null;
        }
        if (updates.status !== undefined) {
            updateData.status = updates.status;
            if (updates.status === 'published' || updates.status === 'approved') {
                updateData.published = true;
                updateData.publishedAt = now;
            } else if (updates.status === 'hidden' || updates.status === 'rejected' || updates.status === 'pending') {
                updateData.published = false;
                updateData.publishedAt = null;
            }
        }
        if (updates.moderatorNote !== undefined) {
            updateData.moderatorNote = updates.moderatorNote.replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '').trim();
        }

        await db.collection('reviews').doc(reviewId).update(updateData);

        // Audit log
        await db.collection('admin_audit_logs').add({
            action: 'updateReview',
            reviewId,
            changes: updateData,
            createdAt: new Date(),
        }).catch(e => console.error('Audit log failed', e));
    }

    /**
     * Delete review (admin)
     */
    async deleteReview(reviewId: string, reason: string): Promise<void> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        await db.collection('reviews').doc(reviewId).delete();

        await db.collection('admin_audit_logs').add({
            action: 'deleteReview',
            reviewId,
            reason: reason.replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '').trim(),
            createdAt: new Date(),
        }).catch(e => console.error('Audit log failed', e));
    }

    /**
     * Bulk review action
     */
    async bulkReviewAction(params: {
        action: 'publish' | 'unpublish' | 'delete' | 'updateNotes';
        reviewIds: string[];
        adminUid: string;
        moderatorNote?: string;
        reason?: string;
        ip?: string;
    }): Promise<{ processed: number; failed: number; errors: Array<{ id?: string; error: string }> }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const { action, reviewIds, adminUid, moderatorNote, reason, ip } = params;
        const errors: Array<{ id?: string; error: string }> = [];
        let processedCount = 0;

        const refs = reviewIds.map(id => db.collection('reviews').doc(id));
        const snaps = await Promise.all(refs.map(r => r.get()));

        const batch = db.batch();

        for (let i = 0; i < reviewIds.length; i++) {
            const snap = snaps[i];
            if (!snap.exists) {
                errors.push({ id: reviewIds[i], error: 'Review not found' });
                continue;
            }

            const ref = refs[i];
            const now = new Date();

            switch (action) {
                case 'publish':
                    batch.update(ref, {
                        published: true,
                        status: 'published',
                        publishedAt: Date.now(),
                        lastModified: now,
                    });
                    break;
                case 'unpublish':
                    batch.update(ref, {
                        published: false,
                        status: 'hidden',
                        publishedAt: null,
                        lastModified: now,
                    });
                    break;
                case 'updateNotes':
                    batch.update(ref, {
                        moderatorNote: (moderatorNote || '').replace(/<\s*script.*?>.*?<\s*\/\s*script\s*>/gi, '').trim(),
                        lastModified: now
                    });
                    break;
                case 'delete':
                    batch.delete(ref);
                    break;
            }
            processedCount++;
        }

        await batch.commit();

        // Audit log
        await db.collection('admin_audit_logs').add({
            action: `bulk-${action}`,
            adminUid,
            reviewCountRequested: reviewIds.length,
            reviewCountProcessed: processedCount - errors.filter(e => !!e.id).length,
            reviewIds,
            details: action === 'delete' ? { reason } : action === 'updateNotes' ? { moderatorNote } : {},
            errors,
            ip,
            createdAt: new Date(),
        }).catch(e => console.error('Audit log failed', e));

        return {
            processed: processedCount - errors.filter(e => !!e.id).length,
            failed: errors.length,
            errors,
        };
    }

    /**
     * Get detailed platform stats
     */
    async getDetailedStats(): Promise<Record<string, unknown>> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const [storesSnap, reviewsSnap, alertsSnap, unresolvedSnap, recentSnap] = await Promise.all([
            db.collection('stores').get(),
            db.collection('reviews').get(),
            db.collection('review_reports').get(),
            db.collection('review_reports').where('resolved', '==', false).get(),
            db.collection('reviews').orderBy('createdAt', 'desc').limit(10).get(),
        ]);

        const totalStores = storesSnap.docs.filter((doc) => !isAliasStoreDoc(doc.id, doc.data() as FirestoreDoc)).length;
        const totalReviews = reviewsSnap.size;
        const totalAlerts = alertsSnap.size;
        const publishedReviews = reviewsSnap.docs.filter((doc) => isPublishedReviewDoc(doc.data() as FirestoreDoc)).length;
        const pendingReviews = totalReviews - publishedReviews;
        const unresolvedAlerts = unresolvedSnap.size;

        let averageRating = 0;
        const starsDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

        if (reviewsSnap.size > 0) {
            let totalStars = 0;
            reviewsSnap.forEach(doc => {
                const data = doc.data();
                const stars = Number(data.stars) || 0;
                totalStars += stars;
                if (stars >= 1 && stars <= 5) starsDistribution[stars]++;
            });
            averageRating = Math.round((totalStars / reviewsSnap.size) * 10) / 10;
        }

        const publishRate = totalReviews > 0 ? Math.round((publishedReviews / totalReviews) * 100) : 0;
        const alertRate = totalReviews > 0 ? Math.round((totalAlerts / totalReviews) * 100) : 0;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recentActivities = recentSnap.docs.slice(0, 5).map((doc: any) => {
            const data = doc.data();
            return {
                id: doc.id,
                type: 'review',
                storeName: data.storeName || resolveStoreDisplayName(data),
                stars: data.stars,
                createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
                published: isPublishedReviewDoc(data),
            };
        });

        return {
            totalStores,
            totalReviews,
            totalAlerts,
            publishedReviews,
            pendingReviews,
            unresolvedAlerts,
            averageRating,
            publishRate,
            alertRate,
            averageReviewsPerStore: totalStores > 0 ? Math.round(totalReviews / totalStores) : 0,
            starsDistribution: Object.entries(starsDistribution).map(([stars, count]) => ({
                stars: Number(stars),
                count,
                percentage: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
            })),
            recentActivities,
            lastUpdated: new Date().toISOString(),
            insights: {
                topPerformingMetric: publishRate > 80 ? 'معدل نشر عالي' : alertRate < 5 ? 'معدل بلاغات منخفض' : averageRating > 4 ? 'تقييمات إيجابية' : 'يحتاج تحسين',
                recommendation: publishRate < 50 ? 'ينصح بمراجعة التقييمات المعلقة' : unresolvedAlerts > 10 ? 'ينصح بمعالجة البلاغات المعلقة' : 'الأداء جيد، استمر!',
                healthScore: Math.round((publishRate * 0.4) + (Math.max(0, 100 - alertRate * 2) * 0.3) + (Math.min(100, averageRating * 20) * 0.3)),
            },
        };
    }

    /**
     * List admin reviews with filters and pagination
     */
    async listAdminReviews(params: {
        limit?: number;
        storeUid?: string;
        published?: boolean;
        status?: string;
        stars?: number;
        search?: string;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        cursor?: string;
    }): Promise<{
        reviews: unknown[];
        total: number;
        published: number;
        pending: number;
        averageRating: number;
        hasMore: boolean;
        nextCursor: string | null;
    }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const { mapReview } = await import('@/utils/mapReview');
        const db = dbAdmin();

        const limitNum = Math.min(
            LIMITS.MAX_BATCH_SIZE,
            Math.max(1, params.limit || LIMITS.MAX_BATCH_SIZE),
        );
        const sortField = ['createdAt', 'stars', 'storeName', 'name', 'lastModified', 'publishedAt'].includes(params.sortBy || '')
            ? params.sortBy!
            : 'createdAt';
        const querySortField = sortField === 'name' || sortField === 'storeName'
            ? 'createdAt'
            : sortField;
        const sortDirection: FirebaseFirestore.OrderByDirection = params.sortOrder === 'asc' ? 'asc' : 'desc';
        const searchTerm = (params.search || '').toLowerCase().trim();

        let q: FirebaseFirestore.Query = db.collection('reviews');
        if (params.storeUid) q = q.where('storeUid', '==', params.storeUid);
        if (params.stars !== undefined) q = q.where('stars', '==', params.stars);
        if (params.status) q = q.where('status', '==', params.status);

        q = q.orderBy(querySortField, sortDirection);
        if (querySortField !== 'createdAt') q = q.orderBy('createdAt', 'desc');
        q = q.limit(limitNum + 1);

        if (params.cursor) {
            const cursorDoc = await db.collection('reviews').doc(params.cursor).get();
            if (cursorDoc.exists) q = q.startAfter(cursorDoc);
        }

        const snap = await q.get();
        const raw = snap.docs.map(d => ({ id: d.id, data: d.data() }));

        // Get store info
        const uids = Array.from(new Set(raw.map(r => r.data?.storeUid).filter(Boolean)));
        const storeInfo = new Map<string, { name: string; domain: string | null }>();

        await Promise.all(uids.map(async (uid) => {
            let sDoc = await db.collection('stores').doc(uid).get();
            if (!sDoc.exists) {
                const alt = await db.collection('stores').where('uid', '==', uid).limit(1).get();
                sDoc = alt.docs[0];
            }
            const s = (sDoc?.data() as FirestoreDoc | undefined) || undefined;
            const name = resolveStoreDisplayName(s);
            const domain = resolveStoreDomainValue(s);
            storeInfo.set(uid, { name, domain });
        }));

        let reviews = raw.map(r => {
            const info = storeInfo.get(r.data?.storeUid) || { name: 'غير محدد', domain: null };
            return mapReview(r.id, r.data, info.name, info.domain);
        });

        if (params.published !== undefined) {
            reviews = reviews.filter(
                (review) => (review as { published?: boolean }).published === params.published,
            );
        }

        if (searchTerm) {
            reviews = reviews.filter((r: Record<string, unknown>) =>
                [r.storeName, r.text, r.status, r.name, r.storeDomain].filter(Boolean).join(' ').toLowerCase().includes(searchTerm)
            );
        }

        if (sortField === 'name' || sortField === 'storeName') {
            const directionFactor = sortDirection === 'asc' ? 1 : -1;
            reviews.sort((left, right) => {
                const leftValue = String(
                    (sortField === 'name'
                        ? (left as { name?: string }).name
                        : (left as { storeName?: string }).storeName) || '',
                );
                const rightValue = String(
                    (sortField === 'name'
                        ? (right as { name?: string }).name
                        : (right as { storeName?: string }).storeName) || '',
                );
                return leftValue.localeCompare(rightValue, 'ar') * directionFactor;
            });
        }

        const total = reviews.length;
        const publishedCount = reviews.filter((r: Record<string, unknown>) => r.published).length;
        const pendingCount = total - publishedCount;
        const avg = total ? Math.round((reviews.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.stars) || 0), 0) / total) * 10) / 10 : 0;
        const hasMore = total > limitNum || snap.docs.length > limitNum;
        const nextCursor = hasMore ? snap.docs[limitNum]?.id ?? null : null;

        reviews = reviews.slice(0, limitNum);

        return { reviews, total, published: publishedCount, pending: pendingCount, averageRating: avg, hasMore, nextCursor };
    }
}
