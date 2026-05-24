// src/pages/feeds/seller-ratings.xml.tsx
//
// Clean public URL for our Seller Ratings (merchant_reviews) feed.
// Serves the same XML payload as
// /feeds/google-merchant-reviews-sample.xml. The /verification-trust-policy
// page cites THIS URL externally; the legacy path stays live so any
// existing pointers keep working.

import type { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import {
    buildGoogleMerchantReviewsXml,
    type MerchantFeedReview,
} from "@/lib/feeds/buildGoogleMerchantReviewsXml";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const MERCHANT_SAMPLE_LIMIT = 5000;

export const config = {
    maxDuration: 60,
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let xml = "";
    try {
        const items = await buildReviewFeedData(MERCHANT_SAMPLE_LIMIT);

        // NO filtering on product fields — merchant_reviews.xsd doesn't
        // require productId/productUrl, so backfill rows flow through too.
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
            `[feeds/seller-ratings] fetched=${items.length} ` +
            `emitted=${merchantReviews.length}`,
        );

        xml = buildGoogleMerchantReviewsXml({
            reviews: merchantReviews,
            siteOrigin: SITE_URL,
        });
    } catch (err) {
        console.error("[feeds/seller-ratings] build failed:", err);
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

export default function SellerRatingsFeedPage() {
    return null;
}
