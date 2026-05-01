/**
 * SallaBackfillService — paginates Salla `/admin/v2/reviews` and
 * writes verified historical review docs into the existing `reviews`
 * collection. Trusts Salla's review existence as the verification
 * signal: only `type=='rating'` reviews come from real completed
 * orders on Salla's side.
 *
 * Uses dependency injection so tests don't need Firestore or the
 * live Salla API. The cron worker wires the real implementations.
 *
 * @module server/services/backfill/salla-backfill.service
 */

import { LIMITS, TIMEOUT } from '@/config/constants';
import { fetchJsonWithTimeout } from '@/server/utils/fetch';
import { log } from '@/lib/logger';

const SALLA_REVIEWS_API = 'https://api.salla.dev/admin/v2/reviews';

export interface SallaApiReview {
    id: number | string;
    order_id: number | string | null;
    type?: string | null;
    rating?: number | null;
    content?: string | null;
    is_anonymous?: boolean;
    is_published?: boolean;
    product?: { id?: number | string; name?: string };
    customer?: {
        name?: string;
        first_name?: string;
        last_name?: string;
        email?: string;
        mobile?: string;
    };
    /**
     * Salla returns `created_at` as a top-level string ("YYYY-MM-DD HH:mm:ss"
     * or ISO). The legacy `date: { date }` shape was a guess from earlier
     * docs and isn't actually returned. We accept both for compatibility.
     */
    created_at?: string;
    date?: { date?: string };
    images?: unknown[];
}

export interface SallaApiResponse {
    data?: SallaApiReview[];
    pagination?: {
        totalPages?: number;
        currentPage?: number;
        links?: { next?: string | null };
    };
}

export interface SallaBackfillDeps {
    fetchPage: (accessToken: string, page: number) => Promise<SallaApiResponse>;
    getAccessToken: (storeUid: string) => Promise<string | null>;
    /** @deprecated kept for tests — backfill now uses sallaReviewId for dedupe */
    getReviewByOrderAndProduct?: (orderId: string, productId: string) => Promise<{ reviewId: string } | null>;
    /**
     * Dedupe by Salla's globally-unique review id. Implementations should
     * query both `sallaReviewId == id` AND the deterministic backfill doc
     * id (`salla_backfill_<id>`) to catch already-imported rows.
     */
    getReviewBySallaId?: (sallaReviewId: string) => Promise<{ reviewId: string } | null>;
    writeReview: (reviewId: string, doc: Record<string, unknown>) => Promise<void>;
    getStoreSubscriptionStart: (storeUid: string) => Promise<number>;
}

export interface SallaBackfillRunResult {
    written: number;
    skipped: number;
    lastPage: number;
    reachedEnd: boolean;
    skipReasons: Record<string, number>;
}

export class SallaBackfillService {
    constructor(private readonly deps: SallaBackfillDeps) { }

    async runOnce(params: {
        storeUid: string;
        merchantId: string;
        startPage: number;
        maxPages: number;
        onPageComplete: (page: number, stats: { written: number; skipped: number }) => Promise<void>;
    }): Promise<SallaBackfillRunResult> {
        const accessToken = await this.deps.getAccessToken(params.storeUid);
        if (!accessToken) {
            throw new Error(`No Salla access token for ${params.storeUid}`);
        }

        const subscriptionStart = await this.deps.getStoreSubscriptionStart(params.storeUid);

        let page = params.startPage;
        let written = 0;
        let skipped = 0;
        let reachedEnd = false;
        let lastPage = page - 1;
        const skipReasons: Record<string, number> = {};
        const bumpSkip = (reason: string) => {
            skipped++;
            skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        };

        while (page <= params.maxPages) {
            const pageStartWritten = written;
            const pageStartSkipped = skipped;

            const resp = await this.deps.fetchPage(accessToken, page);
            const reviews = resp.data ?? [];

            for (const r of reviews) {
                const type = String(r.type ?? 'rating').toLowerCase();
                if (type !== 'rating') {
                    bumpSkip(`type_${type}`);
                    continue;
                }
                const sallaReviewId = String(r.id ?? '');
                if (!sallaReviewId) { bumpSkip('no_review_id'); continue; }

                // Salla's bulk reviews endpoint does NOT return product info
                // inline. We use sallaReviewId (globally unique) as the dedupe
                // key instead of orderId+productId. productId stays empty —
                // the cert page reads the product name from sallaReviewId on
                // demand if needed.
                const orderId = String(r.order_id ?? '');
                const productId = '';

                if (this.deps.getReviewBySallaId) {
                    const existing = await this.deps.getReviewBySallaId(sallaReviewId);
                    if (existing) { bumpSkip('already_exists'); continue; }
                }

                const docId = `salla_backfill_${sallaReviewId}`;
                const createdAtRaw = r.created_at || r.date?.date;
                const orderDateMs = createdAtRaw ? new Date(createdAtRaw).getTime() : Date.now();

                const displayName = r.customer?.name
                    || [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(' ')
                    || 'عميل سلة';

                const doc: Record<string, unknown> = {
                    reviewId: docId,
                    storeUid: params.storeUid,
                    orderId,
                    orderNumber: orderId,
                    productId,
                    productName: String(r.product?.name ?? ''),
                    source: 'salla_backfill',
                    stars: Number(r.rating ?? 0),
                    text: String(r.content ?? ''),
                    author: { displayName: String(displayName) },
                    status: 'approved',
                    trustedBuyer: true,
                    verified: true,
                    verificationMethod: 'platform-historical',
                    verifiedBy: 'salla-platform-status',
                    publishedAt: orderDateMs,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    needsSallaId: false,
                    sallaReviewId: String(r.id),
                    backfilledAt: Date.now(),
                    subscriptionStartAtBackfill: subscriptionStart,
                };

                await this.deps.writeReview(docId, doc);
                written++;
            }

            await params.onPageComplete(page, {
                written: written - pageStartWritten,
                skipped: skipped - pageStartSkipped,
            });

            lastPage = page;

            const totalPages = resp.pagination?.totalPages;
            const hasNext = !!resp.pagination?.links?.next;
            if (reviews.length === 0) { reachedEnd = true; break; }
            if (typeof totalPages === 'number' && page >= totalPages) { reachedEnd = true; break; }
            if (!hasNext && totalPages == null) { reachedEnd = true; break; }

            page++;
        }

        return { written, skipped, lastPage, reachedEnd, skipReasons };
    }
}

/** Default fetchPage impl wired by the cron worker. */
export async function fetchSallaReviewsPage(
    accessToken: string,
    page: number,
): Promise<SallaApiResponse> {
    const url = new URL(SALLA_REVIEWS_API);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(LIMITS.SALLA_REVIEWS_PER_PAGE));
    // Critical: without type=rating, Salla returns `type=ask` records
    // (customer questions) which we'd skip 100% of. type=rating is what
    // gets us actual product reviews. Verified against /admin/v2/reviews
    // probe — same store: type=ask returned 352 questions, type=rating
    // returned 119 product reviews.
    url.searchParams.set('type', 'rating');

    const r = await fetchJsonWithTimeout<SallaApiResponse>(url.toString(), {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
        timeoutMs: TIMEOUT.API_REQUEST_LONG,
    });
    if (!r.ok) {
        log('error', `[SALLA_BACKFILL] page ${page} fetch failed: ${r.error}`, { scope: 'backfill' });
        throw new Error(r.error);
    }
    return r.data;
}
