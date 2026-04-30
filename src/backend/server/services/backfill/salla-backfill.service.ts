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
    getReviewByOrderAndProduct: (orderId: string, productId: string) => Promise<{ reviewId: string } | null>;
    writeReview: (reviewId: string, doc: Record<string, unknown>) => Promise<void>;
    getStoreSubscriptionStart: (storeUid: string) => Promise<number>;
}

export interface SallaBackfillRunResult {
    written: number;
    skipped: number;
    lastPage: number;
    reachedEnd: boolean;
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

        while (page <= params.maxPages) {
            const pageStartWritten = written;
            const pageStartSkipped = skipped;

            const resp = await this.deps.fetchPage(accessToken, page);
            const reviews = resp.data ?? [];

            for (const r of reviews) {
                const type = String(r.type ?? 'rating').toLowerCase();
                if (type !== 'rating') {
                    skipped++;
                    continue;
                }
                const productId = String(r.product?.id ?? '');
                const orderId = String(r.order_id ?? '');
                if (!productId || !orderId) {
                    skipped++;
                    continue;
                }

                const existing = await this.deps.getReviewByOrderAndProduct(orderId, productId);
                if (existing) {
                    skipped++;
                    continue;
                }

                const docId = `salla_${params.merchantId}_order_${orderId}_product_${productId}`;
                const orderDateMs = r.date?.date ? new Date(r.date.date).getTime() : Date.now();

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

        return { written, skipped, lastPage, reachedEnd };
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
