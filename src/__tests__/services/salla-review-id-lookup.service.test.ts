import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    SallaReviewIdLookupService,
    type SallaReviewLookupTarget,
} from '@/backend/server/services/salla-review-id-lookup.service';

describe('SallaReviewIdLookupService', () => {
    let service: SallaReviewIdLookupService;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        service = new SallaReviewIdLookupService();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    it('paginates until it finds a matching product review', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'x-1', order_id: 'other', rating: 5, type: 'rating', content: '' },
                    ],
                    pagination: { total: 2, totalPages: 2, currentPage: 1, perPage: 60 },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'match-2', order_id: 'order-77', rating: 5, type: 'rating', content: 'great' },
                    ],
                    pagination: { total: 2, totalPages: 2, currentPage: 2, perPage: 60 },
                }),
            });

        const match = await service.findMatchForReview({
            accessToken: 'token',
            storeUid: 'salla:123',
            review: {
                reviewId: 'review-1',
                orderId: 'order-77',
                stars: 5,
                text: 'great',
            },
        });

        expect(match).toEqual({
            reviewId: 'review-1',
            sallaReviewId: 'match-2',
            pageFound: 2,
            remoteRating: 5,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops early once all store reviews are matched', async () => {
        const reviews: SallaReviewLookupTarget[] = [
            { reviewId: 'review-a', orderId: 'order-a', stars: 5, text: 'alpha' },
            { reviewId: 'review-b', orderId: 'order-b', stars: 4, text: 'beta' },
        ];

        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'remote-a', order_id: 'order-a', rating: 5, type: 'rating', content: 'alpha' },
                    ],
                    pagination: { total: 3, totalPages: 5, currentPage: 1, perPage: 60 },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'remote-b', order_id: 'order-b', rating: 4, type: 'rating', content: 'beta' },
                    ],
                    pagination: { total: 3, totalPages: 5, currentPage: 2, perPage: 60 },
                }),
            });

        const result = await service.findMatchesForStoreReviews({
            accessToken: 'token',
            storeUid: 'salla:123',
            reviews,
        });

        expect(result.pagesScanned).toBe(2);
        expect(result.totalPages).toBe(5);
        expect(result.reachedMaxPages).toBe(false);
        expect(result.unresolvedReviewIds).toEqual([]);
        expect(Array.from(result.matches.values())).toEqual([
            { reviewId: 'review-a', sallaReviewId: 'remote-a', pageFound: 1, remoteRating: 5 },
            { reviewId: 'review-b', sallaReviewId: 'remote-b', pageFound: 2, remoteRating: 4 },
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('ignores non-product review types when matching', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    { id: 'ask-1', order_id: 'order-77', rating: 5, type: 'ask', content: 'great' },
                ],
                pagination: { total: 1, totalPages: 1, currentPage: 1, perPage: 60 },
            }),
        });

        const result = await service.findMatchesForStoreReviews({
            accessToken: 'token',
            storeUid: 'salla:123',
            reviews: [
                { reviewId: 'review-1', orderId: 'order-77', stars: 5, text: 'great' },
            ],
        });

        expect(result.matches.size).toBe(0);
        expect(result.unresolvedReviewIds).toEqual(['review-1']);
    });

    it('respects maxPages when used for recent-review lookups', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'x-1', order_id: 'other', rating: 5, type: 'rating', content: '' },
                    ],
                    pagination: { total: 2, totalPages: 2, currentPage: 1, perPage: 60 },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'match-2', order_id: 'order-77', rating: 5, type: 'rating', content: 'great' },
                    ],
                    pagination: { total: 2, totalPages: 2, currentPage: 2, perPage: 60 },
                }),
            });

        const match = await service.findMatchForReview({
            accessToken: 'token',
            storeUid: 'salla:123',
            review: {
                reviewId: 'review-1',
                orderId: 'order-77',
                stars: 5,
                text: 'great',
            },
            maxPages: 1,
        });

        expect(match).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('reports when the lookup stops at a max page cap', async () => {
        fetchMock
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'x-1', order_id: 'other', rating: 5, type: 'rating', content: '' },
                    ],
                    pagination: { total: 100, totalPages: 50, currentPage: 1, perPage: 60 },
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    data: [
                        { id: 'x-2', order_id: 'other-2', rating: 5, type: 'rating', content: '' },
                    ],
                    pagination: { total: 100, totalPages: 50, currentPage: 2, perPage: 60 },
                }),
            });

        const result = await service.findMatchesForStoreReviews({
            accessToken: 'token',
            storeUid: 'salla:123',
            maxPages: 2,
            reviews: [
                { reviewId: 'review-1', orderId: 'order-77', stars: 5, text: 'great' },
            ],
        });

        expect(result.matches.size).toBe(0);
        expect(result.unresolvedReviewIds).toEqual(['review-1']);
        expect(result.reachedMaxPages).toBe(true);
        expect(result.pagesScanned).toBe(2);
    });
});
