// src/pages/api/public/store-profile.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { ReviewService } from "@/server/services/review.service";
import { StoreService } from "@/server/services/store.service";
import { handleApiError } from "@/server/core/error-handler";
import { ValidationError } from "@/server/core/errors";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // CORS / preflight
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

    // Rate limiting
    const limited = await rateLimitPublic(req, res, {
        ...RateLimitPresets.PUBLIC_MODERATE,
        identifier: "public-store-profile",
    });
    if (limited) return;

    try {
        const storeUid =
            (typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "") ||
            (typeof req.query.store === "string" ? req.query.store.trim() : "");

        if (!storeUid) {
            throw new ValidationError("Missing storeUid parameter", "storeUid");
        }

        const storeService = new StoreService();
        const reviewService = new ReviewService();

        // Fetch store info + verified reviews (status=approved, verified=true)
        // These are the actual full Review objects with author, text, dates etc.
        const [storeInfo, verifiedReviews] = await Promise.all([
            storeService.getStoreInfo(storeUid),
            reviewService.getVerifiedReviews(storeUid),
        ]);

        if (!storeInfo) {
            return res.status(404).json({ error: "STORE_NOT_FOUND" });
        }

        // Map full Review objects to public-safe response format
        const reviews = verifiedReviews.map((r) => ({
            id: r.id || r.reviewId || "",
            productId: r.productId || null,
            stars: r.stars || 0,
            text: r.text || "",
            publishedAt: r.publishedAt || r.createdAt || 0,
            trustedBuyer: !!r.trustedBuyer || !!r.verified,
            author: {
                displayName: r.author?.displayName || "عميل المتجر",
            },
        }));

        // Compute stats
        const totalReviews = reviews.length;
        const avgStars =
            totalReviews > 0
                ? Math.round((reviews.reduce((sum, r) => sum + r.stars, 0) / totalReviews) * 10) / 10
                : 0;

        const distribution = [0, 0, 0, 0, 0]; // index 0 = 1-star, index 4 = 5-star
        for (const r of reviews) {
            const idx = Math.max(0, Math.min(4, Math.round(r.stars) - 1));
            distribution[idx]++;
        }

        res.setHeader("Cache-Control", "public, max-age=120, s-maxage=600");
        return res.status(200).json({
            store: {
                storeUid: storeInfo.storeUid,
                name: storeInfo.name,
                domain: storeInfo.domain,
                platform: storeInfo.platform,
            },
            stats: {
                totalReviews,
                avgStars,
                distribution,
            },
            reviews,
        });
    } catch (error) {
        handleApiError(res, error);
    }
}
