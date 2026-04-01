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
 * Score how well a remote review matches a target.
 * Returns -1 if definitely not a match, 0+ for potential matches (higher = better).
 * We require order_id + product review type as hard filters.
 * Stars and text are soft criteria used to disambiguate (customers can edit reviews).
 */
function scoreRemoteReview(target: SallaReviewLookupTarget, remote: SallaReviewApiItem): number {
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
        const matches = new Map<string, SallaReviewLookupMatch>();
        const pendingByOrder = new Map<string, SallaReviewLookupTarget[]>();
        const maxPages = params.maxPages ?? LIMITS.MAX_SALLA_REVIEW_LOOKUP_PAGES;

        if (reviews.length === 0) {
            return {
                matches,
                unresolvedReviewIds: [],
                pagesScanned: 0,
                totalPages: 0,
                totalRemote: 0,
                reachedMaxPages: false,
            };
        }

        for (const review of reviews) {
            const orderKey = String(review.orderId);
            const existing = pendingByOrder.get(orderKey) ?? [];
            existing.push(review);
            pendingByOrder.set(orderKey, existing);
        }

        // Track best match per candidate (highest score wins)
        const bestScores = new Map<string, number>();

        let currentPage = 1;
        let pagesScanned = 0;
        let totalPages = 1;
        let totalRemote = 0;

        while (
            pendingByOrder.size > 0 &&
            currentPage <= maxPages
        ) {
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
                    const score = scoreRemoteReview(candidate, remoteReview);
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
                            remoteRating: typeof remoteReview.rating === 'number' ? remoteReview.rating : undefined,
                        });
                    }
                }

                if (candidates.every((candidate) => matches.has(candidate.reviewId))) {
                    pendingByOrder.delete(orderKey);
                }
            }

            if (pendingByOrder.size === 0) {
                break;
            }

            if (remoteReviews.length === 0 || currentPage >= totalPages) {
                break;
            }

            currentPage += 1;
        }

        if (
            pendingByOrder.size > 0 &&
            currentPage > maxPages
        ) {
            log('warn', `Stopped Salla review lookup for ${storeUid} at max page cap`, {
                scope: 'salla-review-id-lookup',
                storeUid,
                maxPages,
            });
        }

        return {
            matches,
            unresolvedReviewIds: reviews
                .filter((review) => !matches.has(review.reviewId))
                .map((review) => review.reviewId),
            pagesScanned,
            totalPages,
            totalRemote,
            reachedMaxPages: pendingByOrder.size > 0 && currentPage > maxPages,
        };
    }

    private async fetchReviewPage(
        accessToken: string,
        page: number
    ): Promise<SallaReviewApiResponse> {
        const url = new URL(SALLA_REVIEWS_API_URL);
        url.searchParams.set('page', String(page));
        url.searchParams.set('per_page', String(LIMITS.SALLA_REVIEWS_PER_PAGE));

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
