// src/pages/feeds/google-merchant-reviews-sample.xml.tsx
//
// Cross-merchant XML sample feed for Google's Seller Ratings application
// (the second half of the Approved Third-Party Review Aggregator program).
//
// What this fixes vs. /feeds/google-aggregator-sample.xml:
//   - That feed (product_reviews.xsd) requires per-review productId +
//     productUrl. It filters out our ~3,114 legacy backfill reviews that
//     lack those fields → ends up at ~few hundred reviews max.
//   - THIS feed (merchant_reviews.xsd) has NO product requirement — just
//     merchant_id + merchant_name + merchant_url. Every verified review
//     flows through, including all backfill rows. Captures the full
//     ~3,500 corpus that Google's reviewers want to see for Seller
//     Ratings approval.
//
// Submission flow per Gemini's guidance:
//   1. Open Google Ads / Google Partners support ticket as an
//      "Independent Third-Party Review Aggregator" applicant.
//   2. Attach BOTH URLs:
//        - /feeds/google-aggregator-sample.xml   → Product Ratings path
//        - /feeds/google-merchant-reviews-sample.xml → Seller Ratings path
//   3. Cite the Triple Match verification methodology + the 3,500 review
//      volume as the trust signals.

import type { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import {
    buildGoogleMerchantReviewsXml,
    type MerchantFeedReview,
} from "@/lib/feeds/buildGoogleMerchantReviewsXml";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

/**
 * Target sample size — Google's aggregator team expects a representative
 * volume of reviews. Our 3,500 figure satisfies the "shows real activity"
 * threshold by a wide margin. Cap at 5,000 to bound payload.
 */
const MERCHANT_SAMPLE_LIMIT = 5000;

export const config = {
    maxDuration: 60,
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let xml = "";
    try {
        const items = await buildReviewFeedData(MERCHANT_SAMPLE_LIMIT);

        // NO filtering on product fields — merchant_reviews.xsd doesn't
        // require productId/productUrl, so backfill rows flow through
        // unchanged. The only "filter" applied is implicit: buildReviewFeedData
        // already restricts to verified+approved reviews.
        const merchantReviews: MerchantFeedReview[] = items.map((r) => ({
            reviewId: r.reviewId,
            reviewerName: r.authorName,
            publishedAtISO: r.datePublishedISO,
            rating: r.rating,
            text: r.content,
            certificateNumber: r.certificateNumber,
            storeUid: r.storeUid,
            storeName: r.storeName,
            storeUrl: r.storeUrl,
            platform: r.platform,
        }));

        console.info(
            `[feeds/google-merchant-reviews-sample] fetched=${items.length} ` +
            `emitted=${merchantReviews.length}`,
        );

        xml = buildGoogleMerchantReviewsXml({
            reviews: merchantReviews,
            siteOrigin: SITE_URL,
        });
    } catch (err) {
        console.error("[feeds/google-merchant-reviews-sample] build failed:", err);
        // Fail-open with an empty-but-valid feed — same reasoning as the
        // product-reviews feed: a 5xx during Google's application review
        // is interpreted as "unreliable aggregator" and delays approval.
        xml = buildGoogleMerchantReviewsXml({
            reviews: [],
            siteOrigin: SITE_URL,
        });
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=604800",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.write(xml);
    res.end();

    return { props: {} };
};

export default function GoogleMerchantReviewsSampleFeedPage() {
    return null;
}
