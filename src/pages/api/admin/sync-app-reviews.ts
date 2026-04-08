// src/pages/api/admin/sync-app-reviews.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAdmin } from '@/utils/verifyAdmin';
import { RepositoryFactory } from '@/server/repositories';

/**
 * POST /api/admin/sync-app-reviews
 * Manually sync app reviews from Salla app store.
 * Body: { reviews: [{ storeName, stars, text, reviewDate }] }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const admin = await verifyAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reviews } = req.body;
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ error: 'reviews array is required' });
    }

    try {
        const repo = RepositoryFactory.getAppReviewRepository();

        // Clear existing reviews and replace with new ones
        const existing = await repo.findAllActive();
        for (const r of existing) {
            if (r.id) await repo.delete(r.id);
        }

        const saved = [];
        for (const r of reviews) {
            const created = await repo.create({
                storeName: r.storeName || 'متجر',
                stars: r.stars || 5,
                text: r.text || '',
                reviewDate: r.reviewDate || new Date().toISOString(),
                source: 'salla',
            });
            saved.push(created);
        }

        return res.status(200).json({ synced: saved.length });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to sync reviews', details: String(error) });
    }
}
