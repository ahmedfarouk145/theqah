/**
 * Store service - store business logic
 * @module server/services/store.service
 */

import { RepositoryFactory } from '../repositories';
import type { Store } from '../core/types';

export interface DashboardAnalytics {
    totalOrders: number;
    totalReviews: number;
    positiveRate: number;
    ordersChart: { month: string; count: number }[];
    reviewsChart: { month: string; positive: number; negative: number }[];
}

export interface StoreInfo {
    storeUid: string;
    name: string | null;
    domain: string | null;
    platform: string;
    salla?: Record<string, unknown>;
}

export class StoreService {
    private storeRepo = RepositoryFactory.getStoreRepository();
    private domainRepo = RepositoryFactory.getDomainRepository();
    private reviewRepo = RepositoryFactory.getReviewRepository();
    private orderRepo = RepositoryFactory.getOrderRepository();

    /**
     * Get store by ID
     */
    async getStore(storeUid: string): Promise<Store | null> {
        return this.storeRepo.findById(storeUid);
    }

    /**
     * Get store info for API response
     */
    async getStoreInfo(storeUid: string): Promise<StoreInfo | null> {
        let store = await this.storeRepo.findById(storeUid);
        if (!store) return null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = store as any;

        // Handle alias stores
        if (data.storeUid && data.storeUid !== storeUid) {
            const realStore = await this.storeRepo.findById(data.storeUid);
            if (realStore) store = realStore;
        }


        const s = data.salla || {};
        const name = s.storeName ?? data.storeName ?? null;

        return {
            storeUid: store.id || storeUid,
            name,
            domain: s.domain ?? null,
            platform: data.platform ?? 'salla',
            salla: s,
        };
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
     * Get dashboard analytics for store
     */
    async getDashboardAnalytics(storeUid: string): Promise<DashboardAnalytics> {
        const [orders, reviewsResult] = await Promise.all([
            this.orderRepo.findByStoreUid(storeUid),
            this.reviewRepo.findByStoreUid(storeUid),
        ]);

        const reviews = reviewsResult.data;
        const totalOrders = orders.length;
        const totalReviews = reviews.length;

        // Calculate positive rate and charts
        const months = this.lastNMonthsKeys(12);
        const ordersBuckets = new Map<string, number>(months.map((m) => [m, 0]));
        const reviewsPosBuckets = new Map<string, number>(months.map((m) => [m, 0]));
        const reviewsNegBuckets = new Map<string, number>(months.map((m) => [m, 0]));

        let positiveCount = 0;

        orders.forEach((order: { createdAt?: unknown; created?: unknown }) => {
            const ts = this.toTs(order.createdAt) || this.toTs(order.created) || Date.now();
            const k = this.monthKey(ts);
            if (ordersBuckets.has(k)) ordersBuckets.set(k, (ordersBuckets.get(k) || 0) + 1);
        });

        reviews.forEach((review: { stars?: number; createdAt?: unknown; created?: unknown }) => {
            const stars = typeof review.stars === 'number' ? review.stars : Number(review.stars || 0);
            const ts = this.toTs(review.createdAt) || this.toTs(review.created) || Date.now();
            const k = this.monthKey(ts);

            if (stars >= 4) positiveCount += 1;

            if (reviewsPosBuckets.has(k)) {
                if (stars >= 4) reviewsPosBuckets.set(k, (reviewsPosBuckets.get(k) || 0) + 1);
            }
            if (reviewsNegBuckets.has(k)) {
                if (stars > 0 && stars <= 2) reviewsNegBuckets.set(k, (reviewsNegBuckets.get(k) || 0) + 1);
            }
        });

        const positiveRate = totalReviews ? Math.round((positiveCount / totalReviews) * 100) : 0;

        const ordersChart = months.map((m) => ({ month: m, count: ordersBuckets.get(m) || 0 }));
        const reviewsChart = months.map((m) => ({
            month: m,
            positive: reviewsPosBuckets.get(m) || 0,
            negative: reviewsNegBuckets.get(m) || 0,
        }));

        return { totalOrders, totalReviews, positiveRate, ordersChart, reviewsChart };
    }

    /**
     * Get store settings
     */
    async getSettings(storeUid: string): Promise<Record<string, unknown>> {
        const store = await this.storeRepo.findById(storeUid);
        if (!store) return {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (store as any).settings || {};
    }

    /**
     * Update store settings
     */
    async updateSettings(storeUid: string, settings: Record<string, unknown>): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.storeRepo.update(storeUid, { settings } as any);
    }

    /**
     * Update specific setting
     */
    async updateSetting(storeUid: string, key: string, value: unknown): Promise<void> {
        const updates: Record<string, unknown> = {};
        updates[`settings.${key}`] = value;
        await this.storeRepo.update(storeUid, updates);
    }

    /**
     * Update store subscription
     */
    async updateSubscription(
        storeUid: string,
        planId: string,
        startedAt: number,
        expiresAt?: number | null,
        raw?: object
    ): Promise<void> {
        await this.storeRepo.updateSubscription(storeUid, planId, startedAt, expiresAt, raw);
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

    /**
     * Find store by email - searches in userinfo and email fields
     * Prioritizes Salla/Zid connected stores
     */
    async findStoreByEmail(email: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // First try: Find stores where userinfo.data.context.email matches
        try {
            const emailQuery = db.collection('stores')
                .where('meta.userinfo.data.context.email', '==', email)
                .orderBy('updatedAt', 'desc')
                .limit(1);

            const snap = await emailQuery.get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                return { id: doc.id, data: doc.data() };
            }
        } catch {
            // Index might not exist, try alternative
        }

        // Second try: Find stores where email field matches AND salla.connected is true
        try {
            const simpleEmailQuery = db.collection('stores')
                .where('email', '==', email)
                .where('salla.connected', '==', true)
                .limit(1);

            const snap = await simpleEmailQuery.get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                return { id: doc.id, data: doc.data() };
            }
        } catch {
            // Index might not exist
        }

        // Third try: Find stores where email field matches AND zid.connected is true
        try {
            const zidEmailQuery = db.collection('stores')
                .where('email', '==', email)
                .where('zid.connected', '==', true)
                .limit(1);

            const snap = await zidEmailQuery.get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                return { id: doc.id, data: doc.data() };
            }
        } catch {
            // Index might not exist
        }

        return null;
    }

    // Helper methods
    private toTs(v: unknown): number {
        if (typeof v === 'number') return v;
        if (typeof v === 'string') {
            const n = Number(v);
            return Number.isFinite(n) ? n : Date.parse(v);
        }
        return 0;
    }

    private monthKey(ts: number): string {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    private lastNMonthsKeys(n: number): string[] {
        const out: string[] = [];
        const d = new Date();
        d.setDate(1);
        for (let i = 0; i < n; i++) {
            out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            d.setMonth(d.getMonth() - 1);
        }
        return out;
    }

    /**
     * Get Salla connection status
     */
    async getSallaConnectionStatus(uid: string): Promise<{
        connected: boolean;
        uid: string;
        storeId: string | number | null;
        storeName: string | null;
        domain: string | null;
        apiBase: string | null;
        reason: string;
    }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Try stores collection first
        const doc = await db.collection('stores').doc(uid).get();
        if (doc.exists) {
            const data = doc.data() || {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const s = (data as any).salla || {};

            const connected = this.normalizeConnected(data);

            return {
                connected,
                uid: doc.id,
                storeId: s.storeId ?? null,
                storeName: s.storeName ?? null,
                domain: s.domain ?? null,
                apiBase: s.apiBase ?? null,
                reason: 'read_by_uid',
            };
        }

        // Fallback: salla_tokens collection
        const tok = await db.collection('salla_tokens').doc(uid).get();
        if (tok.exists) {
            const t = tok.data() || {};
            return {
                connected: true,
                uid,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storeId: (t as any).storeId ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                storeName: (t as any).storeName ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                domain: (t as any).storeDomain ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                apiBase: (t as any).apiBase ?? null,
                reason: 'fallback_by_tokens',
            };
        }

        return {
            connected: false,
            uid,
            storeId: null,
            storeName: null,
            domain: null,
            apiBase: null,
            reason: 'not_found',
        };
    }

    /**
     * Resolve store UID from alias or ownerUid
     */
    async resolveStoreUidFromAlias(ownerUid: string): Promise<string | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const aliasDoc = await db.collection('stores').doc(ownerUid).get();
        if (aliasDoc.exists) {
            const alias = aliasDoc.data() || {};
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const storeUid = (alias as any).storeUid as string | undefined;
            if (storeUid) return storeUid;
        }
        return null;
    }

    private normalizeConnected(docData: Record<string, unknown> | undefined): boolean {
        const s = (docData?.salla || {}) as Record<string, unknown>;
        const connectedFlag = Boolean(s.connected);
        const installedAt = Number(s.installedAt ?? docData?.installedAt ?? 0) || 0;
        const uninstalledAt = Number(docData?.uninstalledAt ?? 0) || 0;
        if (!connectedFlag) return false;
        if (!installedAt) return true;
        if (!uninstalledAt) return true;
        return uninstalledAt < installedAt;
    }

    /**
     * Get store usage stats for billing
     */
    async getUsageStats(uid: string): Promise<{
        invitesUsed: number;
        invitesLimit: number;
        percentage: number;
        monthKey: string;
        planCode: string;
        planName: string;
        status: 'safe' | 'warning' | 'critical' | 'exceeded';
    } | null> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const { getPlanConfig } = await import('@/server/billing/plans');
        const db = dbAdmin();

        const storeSnap = await db.collection('stores').doc(uid).get();
        if (!storeSnap.exists) return null;

        const storeData = storeSnap.data();
        const planCode = (storeData?.subscription?.planId || storeData?.plan?.code || 'STARTER') as 'STARTER' | 'SALES_BOOST' | 'EXPANSION';
        const planConfig = getPlanConfig(planCode);

        const usage = storeData?.usage || {};
        const invitesUsed = Number(usage.invitesUsed || 0);
        const invitesLimit = planConfig.monthlyInvites;
        const percentage = invitesLimit > 0 ? Math.round((invitesUsed / invitesLimit) * 100) : 0;

        let status: 'safe' | 'warning' | 'critical' | 'exceeded' = 'safe';
        if (percentage >= 100) status = 'exceeded';
        else if (percentage >= 90) status = 'critical';
        else if (percentage >= 70) status = 'warning';

        const planNames: Record<string, string> = {
            STARTER: 'باقة الانطلاقة',
            SALES_BOOST: 'باقة زيادة المبيعات',
            EXPANSION: 'باقة التوسع'
        };

        return {
            invitesUsed,
            invitesLimit,
            percentage,
            monthKey: usage.monthKey || '',
            planCode,
            planName: planNames[planCode] || planCode,
            status,
        };
    }
}

