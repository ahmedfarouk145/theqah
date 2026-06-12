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

    // Public paginated data — edge-cacheable per (store, page) key.
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");

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

        // Pagination: ?page=N&pageSize=30 (defaults). Page 1 = first 30
        // verified reviews. pageSize is clamped to 100 to bound payload.
        const pageRaw = parseInt(String(req.query.page ?? '1'), 10);
        const pageSizeRaw = parseInt(String(req.query.pageSize ?? '30'), 10);
        const requestedPage = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
        const pageSize = Math.min(100, Math.max(1, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 30));

        // Focus-review support: when a share-link includes `?review=X`,
        // the SSR fetcher passes `focusReview=X` here so we land on the
        // page that actually contains that review. focusReview is only
        // honoured when the requested page is 1 (the default); if the
        // user has explicitly paginated to page 2+, respect that and
        // ignore focusReview. Note: SSR always sends `page=1` even when
        // the user URL has no `?page=` — so we can't gate on "page param
        // missing", we have to gate on the actual page *value* being 1.
        const focusReviewRaw = typeof req.query.focusReview === 'string' ? req.query.focusReview.trim() : '';
        let focusedPage: number | null = null;
        if (focusReviewRaw && requestedPage === 1) {
            try {
                focusedPage = await reviewService.findVerifiedReviewPage(storeUid, focusReviewRaw, pageSize);
            } catch (err) {
                // If the page-lookup fails (missing composite index, doc
                // gone, etc.), fall back to page 1 rather than 500-ing
                // the whole request. The empty-state branch on the
                // component side is a softer failure mode.
                console.error('[store-profile] findVerifiedReviewPage failed:', err);
                focusedPage = null;
            }
        }
        const page = focusedPage ?? requestedPage;
        const offset = (page - 1) * pageSize;

        // Fetch store info + this page's verified reviews + true total
        // via aggregation, all in parallel.
        const [storeInfo, verifiedReviews, totalReviews] = await Promise.all([
            storeService.getStoreInfo(storeUid),
            reviewService.getVerifiedReviews(storeUid, undefined, pageSize, offset),
            reviewService.countVerifiedReviews(storeUid),
        ]);

        if (!storeInfo) {
            return res.status(404).json({ error: "STORE_NOT_FOUND" });
        }

        // Map the page slice to public-safe response shape.
        const reviews = verifiedReviews.map((r) => ({
            id: r.id || r.reviewId || "",
            productId: r.productId || null,
            // productName surfaces here so the certificate page can attach
            // each Review to its specific Product in JSON-LD (enables Google
            // Product Ratings path in addition to Seller Ratings).
            productName: r.productName || null,
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

        const totalPages = totalReviews > 0 ? Math.ceil(totalReviews / pageSize) : 1;

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
            reviews,                 // current page slice
            pagination: {
                page,
                pageSize,
                totalPages,
                hasMore: page < totalPages,
            },
        });
    } catch (error) {
        handleApiError(res, error);
    }
}
