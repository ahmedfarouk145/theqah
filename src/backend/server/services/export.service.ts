/**
 * Export Service - Review export functionality (CSV, PDF)
 * @module server/services/export.service
 */

interface ExportRow {
    id: string;
    storeUid: string | null;
    productId: string | null;
    orderId: string | null;
    buyerVerified: boolean;
    stars: number;
    text: string;
    images: string[];
    createdAt: number | string;
    published: boolean;
    status: string;
}

interface ExportFilters {
    productId?: string;
    minStars?: number;
    maxStars?: number;
    fromTs?: number;
    toTs?: number;
}

export class ExportService {
    /**
     * Get reviews for export with filtering
     */
    async getReviewsForExport(storeUid: string, filters: ExportFilters = {}): Promise<ExportRow[]> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        const { productId, minStars = 1, maxStars = 5, fromTs = 0, toTs = Number.MAX_SAFE_INTEGER } = filters;

        let q = db.collection('reviews').where('storeUid', '==', storeUid);
        if (productId) q = q.where('productId', '==', productId);

        const snap = await q.get();

        return snap.docs
            .map((d) => {
                const data = d.data() as Record<string, unknown>;
                return {
                    id: d.id,
                    storeUid: this.asString(data.storeUid),
                    productId: this.asString(data.productId),
                    orderId: this.asString(data.orderId),
                    buyerVerified: this.asBoolean(data.buyerVerified) || this.asBoolean(data.trustedBuyer),
                    stars: this.asNumber(data.stars),
                    text: this.asString(data.text) ?? this.asString(data.comment) ?? '',
                    images: this.asStringArray(data.images),
                    createdAt: (data.createdAt ?? data.created ?? '') as number | string,
                    published: this.asBoolean(data.published) || data.status === 'published',
                    status: this.asString(data.status) ?? '',
                };
            })
            .filter((r) => {
                const okStars = r.stars >= minStars && r.stars <= maxStars;
                const t = this.toTimestamp(r.createdAt);
                const okRange = t >= fromTs && t <= toTs;
                return okStars && okRange;
            })
            .sort((a, b) => this.toTimestamp(b.createdAt) - this.toTimestamp(a.createdAt));
    }

    /**
     * Generate CSV content from rows
     */
    generateCsv(rows: ExportRow[]): string {
        const header = [
            'id', 'storeUid', 'productId', 'orderId', 'buyerVerified',
            'stars', 'text', 'images', 'createdAt', 'published', 'status',
        ];

        const lines = [
            header.join(','),
            ...rows.map((r) =>
                [
                    this.escapeCsv(r.id),
                    this.escapeCsv(r.storeUid ?? ''),
                    this.escapeCsv(r.productId ?? ''),
                    this.escapeCsv(r.orderId ?? ''),
                    this.escapeCsv(r.buyerVerified ? 'true' : 'false'),
                    this.escapeCsv(r.stars),
                    this.escapeCsv(r.text),
                    this.escapeCsv(r.images.join(' | ')),
                    this.escapeCsv(r.createdAt),
                    this.escapeCsv(r.published ? 'true' : 'false'),
                    this.escapeCsv(r.status || (r.published ? 'published' : '')),
                ].join(',')
            ),
        ];

        return '\ufeff' + lines.join('\n'); // BOM for Excel
    }

    /**
     * Get reviews for dashboard list
     */
    async getReviewsList(uid: string, statusFilter?: string): Promise<{ reviews: unknown[]; storeUid?: string }> {
        const { dbAdmin } = await import('@/lib/firebaseAdmin');
        const db = dbAdmin();

        // Lookup store UID
        const userDoc = await db.collection('users').doc(uid).get();
        const userData = userDoc.data();
        let storeUid = userData?.storeUid;

        if (!storeUid) {
            const storeSnap = await db.collection('stores')
                .where('ownerUid', '==', uid)
                .limit(1)
                .get();

            if (!storeSnap.empty) {
                const storeData = storeSnap.docs[0].data();
                storeUid = storeData.uid || storeData.storeUid || storeSnap.docs[0].id;
            }
        }

        if (!storeUid) {
            return { reviews: [] };
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query: any = db.collection('reviews')
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .limit(200);

        if (statusFilter && ['pending', 'pending_review', 'approved', 'rejected', 'published'].includes(statusFilter)) {
            query = query.where('status', '==', statusFilter);
        }

        const snap = await query.get();
        const reviews = snap.docs.map((d: { id: string; data: () => Record<string, unknown> }) => ({
            id: d.id,
            ...d.data(),
        }));

        return { reviews, storeUid };
    }

    private escapeCsv(v: unknown): string {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return `"${s}"`;
    }

    private toTimestamp(v: number | string | undefined): number {
        if (v == null) return 0;
        return typeof v === 'number' ? v : Date.parse(String(v));
    }

    private asString(v: unknown): string | null {
        return typeof v === 'string' ? v : null;
    }

    private asNumber(v: unknown): number {
        return typeof v === 'number' ? v : Number(v ?? 0) || 0;
    }

    private asBoolean(v: unknown): boolean {
        return typeof v === 'boolean' ? v : false;
    }

    private asStringArray(v: unknown): string[] {
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    }
}
