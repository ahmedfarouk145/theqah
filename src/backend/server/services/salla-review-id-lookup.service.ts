import { LIMITS, TIMEOUT } from '@/config/constants';
import { log } from '@/lib/logger';
import { fetchJsonWithTimeout } from '@/server/utils/fetch';

const SALLA_REVIEWS_API_URL = 'https://api.salla.dev/admin/v2/reviews';
const PRODUCT_REVIEW_TYPES = new Set(['', 'rating', 'product']);

export interface SallaReviewLookupTarget {
    reviewId: string;
    orderId: string;
    productId?: string | null;
    stars?: number | null;
    text?: string | null;
}

export interface SallaReviewLookupMatch {
    reviewId: string;
    sallaReviewId: string;
    pageFound: number;
    remoteRating?: number;
}

export interface SallaReviewBatchLookupResult {
    matches: Map<string, SallaReviewLookupMatch>;
    unresolvedReviewIds: string[];
    pagesScanned: number;
    totalPages: number;
    totalRemote: number;
    reachedMaxPages: boolean;
}

interface SallaReviewApiItem {
    id: number | string;
    order_id: number | string | null;
    rating?: number | null;
    type?: string | null;
    content?: string | null;
}

interface SallaReviewApiResponse {
    data?: SallaReviewApiItem[];
    pagination?: {
        total?: number;
        totalPages?: number;
        currentPage?: number;
        perPage?: number;
        links?: {
            next?: string | null;
        };
    };
}

interface InternalScanResult {
    matches: Map<string, SallaReviewLookupMatch>;
    pagesScanned: number;
    totalPages: number;
    totalRemote: number;
    reachedMaxPages: boolean;
}

function normalizeText(text: string | null | undefined): string {
    return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function toPositiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.trunc(parsed);
}

function isProductReviewType(type: string | null | undefined): boolean {
    return PRODUCT_REVIEW_TYPES.has((type || '').trim().toLowerCase());
}

/**
 * Legacy scoring used by the unfiltered fallback path.
 *
 * IMPORTANT: this function is NOT used by the primary product-scoped path
 * anymore. Scoring on stars/text was responsible for incident 2026-04 where
 * a stale `stars` value in Firestore (3) outranked the true match (remote
 * rating 4) and caused a ghost `sallaReviewId` to be stored for an entirely
 * different product. The product-scoped path removes the ambiguity by
 * filtering server-side and no longer needs these soft bonuses.
 *
 * Returns -1 if definitely not a match, 0+ for potential matches.
 */
function scoreRemoteReviewLegacy(target: SallaReviewLookupTarget, remote: SallaReviewApiItem): number {
    if (!isProductReviewType(remote.type)) {
        return -1;
    }

    if (String(remote.order_id) !== String(target.orderId)) {
        return -1;
    }

    let score = 1; // base score for order_id match

    if (typeof target.stars === 'number' && target.stars > 0 && remote.rating === target.stars) {
        score += 2;
    }

    const targetText = normalizeText(target.text);
    const remoteText = normalizeText(remote.content);
    if (targetText && remoteText && targetText === remoteText) {
        score += 3;
    }

    return score;
}

export class SallaReviewIdLookupService {
    async findMatchForReview(params: {
        accessToken: string;
        storeUid: string;
        review: SallaReviewLookupTarget;
        maxPages?: number;
    }): Promise<SallaReviewLookupMatch | null> {
        const batchResult = await this.findMatchesForStoreReviews({
            accessToken: params.accessToken,
            storeUid: params.storeUid,
            reviews: [params.review],
            maxPages: params.maxPages,
        });

        return batchResult.matches.get(params.review.reviewId) ?? null;
    }

    async findMatchesForStoreReviews(params: {
        accessToken: string;
        storeUid: string;
        reviews: SallaReviewLookupTarget[];
        maxPages?: number;
    }): Promise<SallaReviewBatchLookupResult> {
        const { accessToken, storeUid, reviews } = params;
        const maxPages = params.maxPages ?? LIMITS.MAX_SALLA_REVIEW_LOOKUP_PAGES;

        if (reviews.length === 0) {
            return {
                matches: new Map(),
                unresolvedReviewIds: [],
                pagesScanned: 0,
                totalPages: 0,
                totalRemote: 0,
                reachedMaxPages: false,
            };
        }

        // Split targets into those with a productId (fast product-scoped path)
        // and those without (legacy fallback — should be ~empty for Salla rows
        // because the webhook always captures productId).
        const withProduct: SallaReviewLookupTarget[] = [];
        const withoutProduct: SallaReviewLookupTarget[] = [];
        for (const review of reviews) {
            const pid = review.productId ? String(review.productId).trim() : '';
            if (pid) {
                withProduct.push(review);
            } else {
                withoutProduct.push(review);
            }
        }

        const matches = new Map<string, SallaReviewLookupMatch>();
        let pagesScanned = 0;
        let totalPages = 0;
        let totalRemote = 0;
        let reachedMaxPages = false;

        if (withProduct.length > 0) {
            const productScan = await this.scanByProduct({
                accessToken,
                storeUid,
                targets: withProduct,
                maxPages,
            });
            for (const [key, value] of productScan.matches) {
                matches.set(key, value);
            }
            pagesScanned += productScan.pagesScanned;
            totalPages = Math.max(totalPages, productScan.totalPages);
            totalRemote += productScan.totalRemote;
            if (productScan.reachedMaxPages) reachedMaxPages = true;
        }

        if (withoutProduct.length > 0) {
            const unfilteredScan = await this.scanUnfiltered({
                accessToken,
                storeUid,
                targets: withoutProduct,
                maxPages,
            });
            for (const [key, value] of unfilteredScan.matches) {
                matches.set(key, value);
            }
            pagesScanned += unfilteredScan.pagesScanned;
            totalPages = Math.max(totalPages, unfilteredScan.totalPages);
            totalRemote += unfilteredScan.totalRemote;
            if (unfilteredScan.reachedMaxPages) reachedMaxPages = true;
        }

        return {
            matches,
            unresolvedReviewIds: reviews
                .filter((review) => !matches.has(review.reviewId))
                .map((review) => review.reviewId),
            pagesScanned,
            totalPages,
            totalRemote,
            reachedMaxPages,
        };
    }

    /**
     * Primary path — scans Salla reviews with `products[]=<productId>`
     * server-side filter, then matches on orderId + type only.
     *
     * This eliminates the cross-product tiebreak bug that existed when
     * scoring ran against the unfiltered store-wide review list.
     */
    private async scanByProduct(params: {
        accessToken: string;
        storeUid: string;
        targets: SallaReviewLookupTarget[];
        maxPages: number;
    }): Promise<InternalScanResult> {
        const { accessToken, storeUid, targets, maxPages } = params;

        // Group by productId, then by orderId within each product.
        const byProduct = new Map<string, Map<string, SallaReviewLookupTarget[]>>();
        for (const target of targets) {
            const pid = String(target.productId);
            const oid = String(target.orderId);
            let orderMap = byProduct.get(pid);
            if (!orderMap) {
                orderMap = new Map();
                byProduct.set(pid, orderMap);
            }
            const list = orderMap.get(oid) ?? [];
            list.push(target);
            orderMap.set(oid, list);
        }

        const matches = new Map<string, SallaReviewLookupMatch>();
        let pagesScanned = 0;
        let totalPages = 0;
        let totalRemote = 0;
        let reachedMaxPages = false;

        for (const [productId, orderMap] of byProduct.entries()) {
            let page = 1;
            let productTotalPages = 1;

            while (page <= maxPages && orderMap.size > 0) {
                const pageData = await this.fetchReviewPage(accessToken, page, productId);
                pagesScanned += 1;

                const pageTotal = toPositiveInteger(pageData.pagination?.total);
                if (pageTotal !== null) {
                    totalRemote = Math.max(totalRemote, pageTotal);
                }

                const reportedTotalPages = toPositiveInteger(pageData.pagination?.totalPages);
                if (reportedTotalPages !== null) {
                    productTotalPages = reportedTotalPages;
                } else if (!pageData.pagination?.links?.next) {
                    productTotalPages = page;
                } else {
                    productTotalPages = Math.max(productTotalPages, page + 1);
                }

                const remoteReviews = pageData.data ?? [];
                for (const remoteReview of remoteReviews) {
                    if (!isProductReviewType(remoteReview.type)) {
                        continue;
                    }

                    const orderKey = String(remoteReview.order_id);
                    const candidates = orderMap.get(orderKey);
                    if (!candidates || candidates.length === 0) {
                        continue;
                    }

                    // products[] filter + order_id + type == "rating" uniquely
                    // identify the review in all normal cases. No scoring.
                    for (const candidate of candidates) {
                        const existing = matches.get(candidate.reviewId);
                        if (existing) {
                            log('warn', `Multiple Salla review candidates for ${candidate.reviewId}`, {
                                scope: 'salla-review-id-lookup',
                                reviewId: candidate.reviewId,
                                storeUid,
                                productId,
                                orderId: candidate.orderId,
                                keeping: existing.sallaReviewId,
                                ignoring: String(remoteReview.id),
                            });
                            continue;
                        }

                        matches.set(candidate.reviewId, {
                            reviewId: candidate.reviewId,
                            sallaReviewId: String(remoteReview.id),
                            pageFound: page,
                            remoteRating: typeof remoteReview.rating === 'number'
                                ? remoteReview.rating
                                : undefined,
                        });
                    }

                    if (candidates.every((candidate) => matches.has(candidate.reviewId))) {
                        orderMap.delete(orderKey);
                    }
                }

                if (orderMap.size === 0) break;
                if (remoteReviews.length === 0 || page >= productTotalPages) break;
                page += 1;
            }

            totalPages = Math.max(totalPages, productTotalPages);

            if (orderMap.size > 0 && page > maxPages) {
                reachedMaxPages = true;
                log('warn', `Stopped Salla product-scoped lookup at max page cap`, {
                    scope: 'salla-review-id-lookup',
                    storeUid,
                    productId,
                    maxPages,
                });
            }
        }

        return {
            matches,
            pagesScanned,
            totalPages,
            totalRemote,
            reachedMaxPages,
        };
    }

    /**
     * Legacy fallback — used only for targets without a `productId`.
     * For Salla, this path is expected to be cold: the webhook always
     * captures `productId` and the Firestore doc id encodes it, so any
     * target we receive without one is an edge case (manual imports, etc).
     *
     * This preserves the pre-2026-04 behavior for backward compatibility.
     */
    private async scanUnfiltered(params: {
        accessToken: string;
        storeUid: string;
        targets: SallaReviewLookupTarget[];
        maxPages: number;
    }): Promise<InternalScanResult> {
        const { accessToken, storeUid, targets, maxPages } = params;

        const pendingByOrder = new Map<string, SallaReviewLookupTarget[]>();
        for (const target of targets) {
            const orderKey = String(target.orderId);
            const existing = pendingByOrder.get(orderKey) ?? [];
            existing.push(target);
            pendingByOrder.set(orderKey, existing);
        }

        const matches = new Map<string, SallaReviewLookupMatch>();
        const bestScores = new Map<string, number>();

        let currentPage = 1;
        let pagesScanned = 0;
        let totalPages = 1;
        let totalRemote = 0;
        let reachedMaxPages = false;

        while (pendingByOrder.size > 0 && currentPage <= maxPages) {
            const pageData = await this.fetchReviewPage(accessToken, currentPage);
            pagesScanned = currentPage;

            const pageTotal = toPositiveInteger(pageData.pagination?.total);
            if (pageTotal !== null) {
                totalRemote = pageTotal;
            }

            const reportedTotalPages = toPositiveInteger(pageData.pagination?.totalPages);
            if (reportedTotalPages !== null) {
                totalPages = reportedTotalPages;
            } else if (!pageData.pagination?.links?.next) {
                totalPages = currentPage;
            } else {
                totalPages = Math.max(totalPages, currentPage + 1);
            }

            const remoteReviews = pageData.data ?? [];
            for (const remoteReview of remoteReviews) {
                const orderKey = String(remoteReview.order_id);
                const candidates = pendingByOrder.get(orderKey);
                if (!candidates || candidates.length === 0) {
                    continue;
                }

                for (const candidate of candidates) {
                    const score = scoreRemoteReviewLegacy(candidate, remoteReview);
                    if (score < 0) {
                        continue;
                    }

                    const prevScore = bestScores.get(candidate.reviewId) ?? -1;
                    if (score > prevScore) {
                        bestScores.set(candidate.reviewId, score);
                        matches.set(candidate.reviewId, {
                            reviewId: candidate.reviewId,
                            sallaReviewId: String(remoteReview.id),
                            pageFound: currentPage,
                            remoteRating: typeof remoteReview.rating === 'number'
                                ? remoteReview.rating
                                : undefined,
                        });
                    }
                }

                if (candidates.every((candidate) => matches.has(candidate.reviewId))) {
                    pendingByOrder.delete(orderKey);
                }
            }

            if (pendingByOrder.size === 0) break;
            if (remoteReviews.length === 0 || currentPage >= totalPages) break;
            currentPage += 1;
        }

        if (pendingByOrder.size > 0 && currentPage > maxPages) {
            reachedMaxPages = true;
            log('warn', `Stopped Salla review lookup (unfiltered) for ${storeUid} at max page cap`, {
                scope: 'salla-review-id-lookup',
                storeUid,
                maxPages,
            });
        }

        return {
            matches,
            pagesScanned,
            totalPages,
            totalRemote,
            reachedMaxPages,
        };
    }

    /**
     * Fetch a single page of Salla reviews. When `productId` is provided the
     * call adds `products[]=<productId>` as a server-side filter.
     */
    private async fetchReviewPage(
        accessToken: string,
        page: number,
        productId?: string
    ): Promise<SallaReviewApiResponse> {
        const url = new URL(SALLA_REVIEWS_API_URL);
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', String(LIMITS.SALLA_REVIEWS_PER_PAGE));
        if (productId) {
            url.searchParams.append('products[]', productId);
        }

        const response = await fetchJsonWithTimeout<SallaReviewApiResponse>(url.toString(), {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            },
            timeoutMs: TIMEOUT.API_REQUEST_LONG,
        });

        if (!response.ok) {
            throw new Error(response.error);
        }

        return response.data;
    }
}

export const sallaReviewIdLookupService = new SallaReviewIdLookupService();
