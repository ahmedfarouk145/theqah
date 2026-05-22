// src/pages/api/feeds/google-product-reviews/[storeUid]/feed.xml.ts
//
// Per-merchant Google Merchant Center product-reviews XML feed.
// (Phase 2 of google_reviews_integration_guide.pdf.)
//
// The merchant pastes the URL of this endpoint into their own GMC account
// under "Marketing > Product reviews", and Google fetches it on a daily
// schedule. Reviews flow through to Google Shopping ads + the free
// Shopping tab, where gold star ratings appear next to the merchant's
// products.
//
// Public, no auth — Google's crawler must be able to fetch it without
// credentials. The underlying data (verified reviews) is already public
// on the certificate page, so opening this endpoint adds no new data
// exposure. Rate-limited via the existing public rate-limit helper to
// keep abuse manageable.
//
// URL structure: this file resolves to
//   /api/feeds/google-product-reviews/{storeUid}/feed.xml
// Using a `[storeUid]/` directory + `feed.xml.ts` instead of the flatter
// `[storeUid].xml.ts` pattern because the latter confuses the Pages
// Router (it can't reliably split `salla:123.xml` into the dynamic part
// vs. the file extension). The subdirectory form is unambiguous.

import type { NextApiRequest, NextApiResponse } from "next";
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import { StoreService } from "@/server/services/store.service";
import { ReviewService } from "@/server/services/review.service";
import { buildGoogleProductReviewsXml } from "@/lib/feeds/buildGoogleProductReviewsXml";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

/** djb2-base36 — identical to certCode() in reviews.tsx / widget.js. */
function certCode(storeUid: string): string {
    if (!storeUid) return "";
    let hash = 5381;
    for (let i = 0; i < storeUid.length; i++) {
        hash = ((hash * 33) ^ storeUid.charCodeAt(i)) >>> 0;
    }
    return "TQ-" + (hash.toString(36).toUpperCase() + "000000").slice(0, 6);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // CORS preflight — Google's crawler doesn't need it, but tooling like
    // GMC's "fetch as Google" preview in the merchant console does.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    if (req.method === "OPTIONS") {
        res.status(200).end();
        return;
    }
    if (req.method !== "GET") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }

    // Rate-limit to discourage scraping the entire merchant base by
    // enumerating storeUids. The data is public but we don't want to be
    // the cheap mirror for every competitor's review-aggregation play.
    const limited = await rateLimitPublic(req, res, {
        ...RateLimitPresets.PUBLIC_MODERATE,
        identifier: "feed-gmc-product-reviews",
    });
    if (limited) return;

    // Dynamic segment is the storeUid alone — no `.xml` suffix to strip,
    // since `feed.xml` lives in its own static segment.
    const rawParam = req.query.storeUid;
    const param = Array.isArray(rawParam) ? rawParam[0] : (rawParam || "");
    const storeUid = String(param).trim();

    if (!storeUid) {
        res.status(400).json({ error: "missing_storeUid" });
        return;
    }

    try {
        const storeService = new StoreService();
        const reviewService = new ReviewService();

        // Verify the store exists. We don't gate by subscription here —
        // GMC fetches even after a trial ends, and a one-day gap in the
        // feed during a billing issue shouldn't cause Google to drop the
        // merchant's reviews entirely. (We DO drop them from the sitemap
        // once unsubscribed — different surface, different consequence.)
        const storeInfo = await storeService.getStoreInfo(storeUid);
        if (!storeInfo) {
            res.status(404).json({ error: "store_not_found" });
            return;
        }

        // Cap at 1000 reviews per feed — Google's spec accepts up to a
        // few thousand but the larger the feed the slower the fetch,
        // and a daily refresh of the most recent 1000 is plenty for a
        // single-merchant catalog. If a merchant ever exceeds this we
        // can paginate the feed later.
        const reviews = await reviewService.getVerifiedReviews(storeUid, undefined, 1000, 0);

        const xml = buildGoogleProductReviewsXml({
            store: {
                storeUid: storeInfo.storeUid,
                name: storeInfo.name || "متجر",
                domain: storeInfo.domain,
                platform: storeInfo.platform,
            },
            certificateNumber: certCode(storeUid),
            reviews: reviews.map((r) => ({
                reviewId: String(r.id || r.reviewId || ""),
                reviewerName: r.author?.displayName || "عميل موثق",
                publishedAtISO: new Date(r.publishedAt || Date.now()).toISOString(),
                text: r.text || "",
                rating: r.stars || 5,
                productId: String(r.productId || ""),
                productName: r.productName || "",
            })),
            siteOrigin: SITE_URL,
        });

        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        // 1h fresh + 12h stale-while-revalidate. Google fetches daily;
        // the wide stale window means a transient Firestore latency
        // never serves Google a 5xx (which would cost us index status).
        res.setHeader(
            "Cache-Control",
            "public, s-maxage=3600, stale-while-revalidate=43200",
        );
        res.status(200).send(xml);
    } catch (err) {
        console.error("[gmc-feed] build failed", { storeUid, err });
        // Fail-open with a minimal valid feed rather than 500. Google
        // deprioritizes URLs that return errors, and a transient
        // backend hiccup shouldn't cost us indexing posture.
        const fallback = buildGoogleProductReviewsXml({
            store: { storeUid, name: "متجر", domain: null, platform: "salla" },
            certificateNumber: certCode(storeUid),
            reviews: [],
            siteOrigin: SITE_URL,
        });
        res.setHeader("Content-Type", "application/xml; charset=utf-8");
        res.setHeader("Cache-Control", "public, s-maxage=60");
        res.status(200).send(fallback);
    }
}
