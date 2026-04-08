// src/pages/api/cron/sync-app-reviews.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { RepositoryFactory } from "@/server/repositories";

const SALLA_APP_ID = "1180703836";
const SALLA_API_URL = `https://api.salla.dev/marketplace/v1/app/${SALLA_APP_ID}`;

/**
 * Cron job: Sync app reviews from Salla marketplace API
 * Schedule: Once daily at 6 AM
 *
 * Fetches latest_reviews from Salla's public API and saves to Firestore.
 * The landing page reads from Firestore via getStaticProps + ISR.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Invalid cron authorization" });
    }

    try {
        const response = await fetch(SALLA_API_URL, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            return res.status(502).json({ error: "Salla API returned " + response.status });
        }

        const json = await response.json();
        const latestReviews = json?.data?.latest_reviews;

        if (!Array.isArray(latestReviews) || latestReviews.length === 0) {
            return res.status(200).json({ message: "No reviews found in Salla API", synced: 0 });
        }

        const repo = RepositoryFactory.getAppReviewRepository();

        // Delete existing and replace with fresh data
        const existing = await repo.findAllActive();
        for (const r of existing) {
            if (r.id) await repo.delete(r.id);
        }

        let synced = 0;
        for (const r of latestReviews) {
            await repo.create({
                storeName: r.name || "متجر",
                stars: r.rating || 5,
                text: r.comment || "",
                reviewDate: r.date || new Date().toISOString(),
                source: "salla",
            });
            synced++;
        }

        return res.status(200).json({ synced, total: latestReviews.length });
    } catch (error) {
        return res.status(500).json({ error: "Sync failed", details: String(error) });
    }
}
