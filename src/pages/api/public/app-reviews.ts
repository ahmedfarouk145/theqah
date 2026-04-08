// src/pages/api/public/app-reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { RepositoryFactory } from "@/server/repositories";

/**
 * GET /api/public/app-reviews
 * Returns app store reviews for the landing page
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "GET") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    try {
        const repo = RepositoryFactory.getAppReviewRepository();
        const reviews = await repo.findAllActive();

        // Cache for 6 hours
        res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");

        return res.status(200).json({
            reviews: reviews.map(r => ({
                storeName: r.storeName,
                stars: r.stars,
                text: r.text,
                reviewDate: r.reviewDate,
            }))
        });
    } catch {
        return res.status(500).json({ error: "Failed to fetch reviews" });
    }
}
