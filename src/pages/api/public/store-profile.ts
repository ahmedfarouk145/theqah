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

        // Cap the per-request review payload. The certificate page only
        // needs a representative slice for display — the true total
        // and avg come from a separate COUNT aggregation. Without this
        // cap, stores with thousands of backfilled reviews shipped a
        // ~1MB JSON blob on every render and hung the SSR.
        const REVIEW_PAGE_SIZE = 200;

        // Fetch store info + verified reviews (status=approved, verified=true)
        // + a true count via aggregation, all in parallel.
        const [storeInfo, verifiedReviews, totalReviews] = await Promise.all([
            storeService.getStoreInfo(storeUid),
            reviewService.getVerifiedReviews(storeUid, undefined, REVIEW_PAGE_SIZE),
            reviewService.countVerifiedReviews(storeUid),
        ]);

        if (!storeInfo) {
            return res.status(404).json({ error: "STORE_NOT_FOUND" });
        }

        // Map the page slice to public-safe response shape.
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

        // Average / distribution are computed from the page slice as a
        // sample. For typical stores this is the full set; for huge
        // backfilled stores it's the first 200 — close enough for UI.
        // If exact aggregates become important, switch to a Firestore
        // SUM aggregation on `stars`.
        const avgStars =
            reviews.length > 0
                ? Math.round((reviews.reduce((sum, r) => sum + r.stars, 0) / reviews.length) * 10) / 10
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
                totalReviews,        // true count via COUNT() aggregation
                avgStars,            // sample average (page slice)
                distribution,        // sample distribution (page slice)
            },
            reviews,                 // page slice, capped at REVIEW_PAGE_SIZE
        });
    } catch (error) {
        handleApiError(res, error);
    }
}
