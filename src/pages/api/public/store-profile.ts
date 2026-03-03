// src/pages/api/public/store-profile.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { ReviewService } from "@/server/services/review.service";
import { StoreService } from "@/server/services/store.service";
import { VerificationService } from "@/server/services";
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
        const verificationService = new VerificationService();

        // Fetch store info + both verified and published reviews in parallel
        const [storeInfo, verifiedResult, publicReviews] = await Promise.all([
            storeService.getStoreInfo(storeUid),
            verificationService.getVerifiedReviews(storeUid),
            reviewService.getPublicReviews(storeUid, { limit: 100, sort: "desc" }),
        ]);

        if (!storeInfo) {
            return res.status(404).json({ error: "STORE_NOT_FOUND" });
        }

        // Merge verified reviews + published reviews, deduplicate by id
        const seenIds = new Set<string>();
        type ReviewOut = {
            id: string;
            productId: string | null;
            stars: number;
            text: string;
            publishedAt: number;
            trustedBuyer: boolean;
            author: { displayName: string };
            images?: string[];
        };
        const allReviews: ReviewOut[] = [];

        // Add verified reviews first (they are the priority)
        for (const r of verifiedResult.reviews) {
            const id = String(r.sallaReviewId || r.orderId || "");
            if (!id || seenIds.has(id)) continue;
            seenIds.add(id);
            allReviews.push({
                id,
                productId: r.productId || null,
                stars: r.stars || 5,
                text: "",
                publishedAt: 0,
                trustedBuyer: true,
                author: { displayName: "عميل موثق" },
            });
        }

        // Add published reviews (may have more details like text)
        for (const r of publicReviews) {
            if (seenIds.has(r.id)) continue;
            seenIds.add(r.id);
            allReviews.push(r);
        }

        // Compute stats
        const totalReviews = allReviews.length;
        const avgStars =
            totalReviews > 0
                ? Math.round((allReviews.reduce((sum, r) => sum + r.stars, 0) / totalReviews) * 10) / 10
                : 0;

        const distribution = [0, 0, 0, 0, 0]; // index 0 = 1-star, index 4 = 5-star
        for (const r of allReviews) {
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
                distribution, // [1-star, 2-star, 3-star, 4-star, 5-star]
            },
            reviews: allReviews,
        });
    } catch (error) {
        handleApiError(res, error);
    }
}
