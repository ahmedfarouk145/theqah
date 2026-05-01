import { describe, expect, it } from 'vitest';
import { SallaBackfillService } from '@/backend/server/services/backfill/salla-backfill.service';

describe('SallaBackfillService', () => {
    it('skips testimonial reviews and writes rating reviews as verified', async () => {
        const writes: Array<{ id: string; doc: Record<string, unknown> }> = [];
        const pages = [
            {
                data: [
                    {
                        id: 1, order_id: 100, type: 'rating', rating: 5, content: 'great',
                        product: { id: 10, name: 'P' },
                        customer: { name: 'Ali' },
                        date: { date: '2025-01-01 10:00:00' },
                    },
                    {
                        id: 2, order_id: 101, type: 'testimonial', rating: 5, content: 'love store',
                        product: { id: 0, name: '' },
                        customer: { name: 'Sara' },
                        date: { date: '2025-01-02 10:00:00' },
                    },
                ],
                pagination: { totalPages: 1, links: { next: null } },
            },
        ];

        const svc = new SallaBackfillService({
            fetchPage: async () => pages.shift()!,
            getAccessToken: async () => 'tok',
            getReviewBySallaId: async () => null,
            writeReview: async (id, doc) => { writes.push({ id, doc }); },
            getStoreSubscriptionStart: async () => 0,
        });

        const result = await svc.runOnce({
            storeUid: 'salla:200',
            merchantId: '200',
            startPage: 1,
            maxPages: 5,
            onPageComplete: async () => { },
        });

        expect(writes.length).toBe(1);
        expect(writes[0].doc.source).toBe('salla_backfill');
        expect(writes[0].doc.verified).toBe(true);
        expect(writes[0].doc.verificationMethod).toBe('platform-historical');
        expect(result.written).toBe(1);
        expect(result.skipped).toBe(1);
        expect(result.reachedEnd).toBe(true);
    });

    it('dedupes against existing review docs by sallaReviewId', async () => {
        const writes: Array<{ id: string; doc: Record<string, unknown> }> = [];
        const svc = new SallaBackfillService({
            fetchPage: async () => ({
                data: [
                    {
                        id: 1, order_id: 100, type: 'rating', rating: 5, content: 'great',
                        product: { id: 10, name: 'P' },
                        customer: { name: 'Ali' },
                        date: { date: '2025-01-01 10:00:00' },
                    },
                ],
                pagination: { totalPages: 1, links: { next: null } },
            }),
            getAccessToken: async () => 'tok',
            getReviewBySallaId: async () => ({ reviewId: 'existing' }),
            writeReview: async (id, doc) => { writes.push({ id, doc }); },
            getStoreSubscriptionStart: async () => 0,
        });

        const result = await svc.runOnce({
            storeUid: 'salla:200',
            merchantId: '200',
            startPage: 1,
            maxPages: 5,
            onPageComplete: async () => { },
        });

        expect(writes.length).toBe(0);
        expect(result.skipped).toBe(1);
    });

    it('paginates until reachedEnd or maxPages', async () => {
        const writes: Array<{ id: string; doc: Record<string, unknown> }> = [];
        const calls: number[] = [];
        const svc = new SallaBackfillService({
            fetchPage: async (_token, page) => {
                calls.push(page);
                if (page === 1) {
                    return {
                        data: [{
                            id: 1, order_id: 100, type: 'rating', rating: 5,
                            product: { id: 10, name: 'P' },
                            date: { date: '2025-01-01 10:00:00' },
                        }],
                        pagination: { totalPages: 2, links: { next: 'p2' } },
                    };
                }
                return {
                    data: [{
                        id: 2, order_id: 101, type: 'rating', rating: 5,
                        product: { id: 11, name: 'P2' },
                        date: { date: '2025-01-02 10:00:00' },
                    }],
                    pagination: { totalPages: 2, links: { next: null } },
                };
            },
            getAccessToken: async () => 'tok',
            getReviewBySallaId: async () => null,
            writeReview: async (id, doc) => { writes.push({ id, doc }); },
            getStoreSubscriptionStart: async () => 0,
        });

        const result = await svc.runOnce({
            storeUid: 'salla:200',
            merchantId: '200',
            startPage: 1,
            maxPages: 10,
            onPageComplete: async () => { },
        });

        expect(calls).toEqual([1, 2]);
        expect(writes.length).toBe(2);
        expect(result.reachedEnd).toBe(true);
        expect(result.lastPage).toBe(2);
    });
});
