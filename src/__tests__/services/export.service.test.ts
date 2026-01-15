/**
 * ExportService Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportService } from '@/server/services/export.service';

// Mock Firebase Admin
const mockGet = vi.fn();
const mockWhere = vi.fn().mockReturnThis();

vi.mock('@/lib/firebaseAdmin', () => ({
    dbAdmin: () => ({
        collection: vi.fn().mockReturnValue({
            where: mockWhere,
            get: mockGet,
            doc: vi.fn().mockReturnValue({
                get: vi.fn(),
            }),
            orderBy: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
        }),
    }),
}));

describe('ExportService', () => {
    let exportService: ExportService;

    beforeEach(() => {
        exportService = new ExportService();
        vi.clearAllMocks();
    });

    describe('generateCsv', () => {
        it('should generate valid CSV with headers', () => {
            const rows = [
                {
                    id: 'review-1',
                    storeUid: 'store-123',
                    productId: 'prod-1',
                    orderId: 'order-1',
                    buyerVerified: true,
                    stars: 5,
                    text: 'Great product!',
                    images: ['img1.jpg', 'img2.jpg'],
                    createdAt: 1700000000000,
                    published: true,
                    status: 'published',
                },
            ];

            const csv = exportService.generateCsv(rows);

            // Should have BOM for Excel
            expect(csv.startsWith('\ufeff')).toBe(true);

            // Should have headers
            expect(csv).toContain('id,storeUid,productId,orderId,buyerVerified');

            // Should have data
            expect(csv).toContain('review-1');
            expect(csv).toContain('Great product!');
            expect(csv).toContain('true');
        });

        it('should escape special characters in CSV', () => {
            const rows = [
                {
                    id: 'review-1',
                    storeUid: 'store-123',
                    productId: null,
                    orderId: null,
                    buyerVerified: false,
                    stars: 4,
                    text: 'Text with "quotes" and, commas',
                    images: [],
                    createdAt: 1700000000000,
                    published: true,
                    status: 'published',
                },
            ];

            const csv = exportService.generateCsv(rows);

            // Should escape quotes by doubling them
            expect(csv).toContain('""quotes""');
        });

        it('should handle empty rows', () => {
            const csv = exportService.generateCsv([]);

            // Should still have header row
            expect(csv).toContain('id,storeUid');
            // Should only have header line
            const lines = csv.split('\n');
            expect(lines.length).toBe(1);
        });

        it('should join multiple images with pipe separator', () => {
            const rows = [
                {
                    id: 'review-1',
                    storeUid: 'store-123',
                    productId: null,
                    orderId: null,
                    buyerVerified: true,
                    stars: 5,
                    text: 'Multi-image review',
                    images: ['img1.jpg', 'img2.jpg', 'img3.jpg'],
                    createdAt: 1700000000000,
                    published: true,
                    status: 'published',
                },
            ];

            const csv = exportService.generateCsv(rows);

            expect(csv).toContain('img1.jpg | img2.jpg | img3.jpg');
        });
    });

    describe('getReviewsForExport', () => {
        it('should filter by store UID', async () => {
            mockGet.mockResolvedValue({
                docs: [
                    {
                        id: 'review-1',
                        data: () => ({
                            storeUid: 'store-123',
                            stars: 5,
                            text: 'Great!',
                            createdAt: Date.now(),
                        }),
                    },
                ],
            });

            const reviews = await exportService.getReviewsForExport('store-123');

            expect(mockWhere).toHaveBeenCalledWith('storeUid', '==', 'store-123');
            expect(reviews).toHaveLength(1);
        });

        it('should filter by star rating range', async () => {
            mockGet.mockResolvedValue({
                docs: [
                    {
                        id: 'review-1',
                        data: () => ({ stars: 3, createdAt: Date.now() }),
                    },
                    {
                        id: 'review-2',
                        data: () => ({ stars: 5, createdAt: Date.now() }),
                    },
                ],
            });

            const reviews = await exportService.getReviewsForExport('store-123', {
                minStars: 4,
                maxStars: 5,
            });

            expect(reviews).toHaveLength(1);
            expect(reviews[0].stars).toBe(5);
        });

        it('should sort by createdAt descending', async () => {
            const now = Date.now();
            mockGet.mockResolvedValue({
                docs: [
                    {
                        id: 'review-old',
                        data: () => ({ stars: 5, createdAt: now - 10000 }),
                    },
                    {
                        id: 'review-new',
                        data: () => ({ stars: 5, createdAt: now }),
                    },
                ],
            });

            const reviews = await exportService.getReviewsForExport('store-123');

            expect(reviews[0].id).toBe('review-new');
            expect(reviews[1].id).toBe('review-old');
        });
    });
});
