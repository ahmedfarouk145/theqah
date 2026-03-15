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

function matchesRemoteReview(target: SallaReviewLookupTarget, remote: SallaReviewApiItem): boolean {
    if (!isProductReviewType(remote.type)) {
        return false;
    }

    if (String(remote.order_id) !== String(target.orderId)) {
        return false;
    }

    if (typeof target.stars === 'number' && target.stars > 0 && remote.rating !== target.stars) {
        return false;
    }

    const targetText = normalizeText(target.text);
    const remoteText = normalizeText(remote.content);
    if (targetText && remoteText && targetText !== remoteText) {
        return false;
    }

    return true;
}

export class SallaReviewIdLookupService {
    async findMatchForReview(params: {
        accessToken: string;
        storeUid: string;
        review: SallaReviewLookupTarget;
    }): Promise<SallaReviewLookupMatch | null> {
        const batchResult = await this.findMatchesForStoreReviews({
            accessToken: params.accessToken,
            storeUid: params.storeUid,
            reviews: [params.review],
        });

        return batchResult.matches.get(params.review.reviewId) ?? null;
    }

    async findMatchesForStoreReviews(params: {
        accessToken: string;
        storeUid: string;
        reviews: SallaReviewLookupTarget[];
    }): Promise<SallaReviewBatchLookupResult> {
        const { accessToken, storeUid, reviews } = params;
        const matches = new Map<string, SallaReviewLookupMatch>();
        const pendingByOrder = new Map<string, SallaReviewLookupTarget[]>();

        if (reviews.length === 0) {
            return {
                matches,
                unresolvedReviewIds: [],
                pagesScanned: 0,
                totalPages: 0,
                totalRemote: 0,
            };
        }

        for (const review of reviews) {
            const orderKey = String(review.orderId);
            const existing = pendingByOrder.get(orderKey) ?? [];
            existing.push(review);
            pendingByOrder.set(orderKey, existing);
        }

        let currentPage = 1;
        let pagesScanned = 0;
        let totalPages = 1;
        let totalRemote = 0;

        while (
            pendingByOrder.size > 0 &&
            currentPage <= LIMITS.MAX_SALLA_REVIEW_LOOKUP_PAGES
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
                    if (matches.has(candidate.reviewId)) {
                        continue;
                    }

                    if (!matchesRemoteReview(candidate, remoteReview)) {
                        continue;
                    }

                    matches.set(candidate.reviewId, {
                        reviewId: candidate.reviewId,
                        sallaReviewId: String(remoteReview.id),
                        pageFound: currentPage,
                        remoteRating: typeof remoteReview.rating === 'number' ? remoteReview.rating : undefined,
                    });
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
            currentPage > LIMITS.MAX_SALLA_REVIEW_LOOKUP_PAGES
        ) {
            log('warn', `Stopped Salla review lookup for ${storeUid} at max page cap`, {
                scope: 'salla-review-id-lookup',
                storeUid,
                maxPages: LIMITS.MAX_SALLA_REVIEW_LOOKUP_PAGES,
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
