// src/pages/feeds/product-ratings.xml.tsx
//
// Clean public URL for our Product Ratings feed. Serves the same XML
// payload as /feeds/google-aggregator-sample.xml — that legacy path was
// always meant as an internal name. The /verification-trust-policy page
// (and Google's onboarding ticket) cite THIS URL externally.
//
// We don't redirect because some integrations may already be hitting
// either URL and a 301 introduces an avoidable round-trip during the
// Google review fetch. Two physical URLs serving the same content is
// fine here — the content is identical and cached identically.

import type { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import {
    buildGoogleAggregatorReviewsXml,
    type AggregatorFeedReview,
} from "@/lib/feeds/buildGoogleAggregatorReviewsXml";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const AGGREGATOR_TARGET_SIZE = 3500;
const AGGREGATOR_FETCH_LIMIT = 10000;

export const config = {
    maxDuration: 60,
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let xml = "";
    try {
        const items = await buildReviewFeedData(AGGREGATOR_FETCH_LIMIT);

        // Same filter as google-aggregator-sample: only emit reviews
        // where we can build a real merchant product URL. Google's
        // automated XML validator rejects the entire feed if any
        // <product_url> entry doesn't resolve to a product page.
        const productPageReady = items.filter(
            (r) => !!r.productId && !!r.storeDomain,
        );

        const aggregatorReviews: AggregatorFeedReview[] = productPageReady
            .slice(0, AGGREGATOR_TARGET_SIZE)
            .map((r) => ({
                reviewId: r.reviewId,
                reviewerName: r.authorName,
                publishedAtISO: r.datePublishedISO,
                rating: r.rating,
                text: r.content,
                certificateNumber: r.certificateNumber,
                storeUid: r.storeUid,
                storeName: r.storeName,
                storeDomain: r.storeDomain,
                productId: r.productId,
                productName: r.productName,
                platform: r.platform,
            }));

        console.info(
            `[feeds/product-ratings] fetched=${items.length} ` +
            `productPageReady=${productPageReady.length} ` +
            `emitted=${aggregatorReviews.length}`,
        );

        xml = buildGoogleAggregatorReviewsXml({
            reviews: aggregatorReviews,
            siteOrigin: SITE_URL,
        });
    } catch (err) {
        console.error("[feeds/product-ratings] build failed:", err);
        xml = buildGoogleAggregatorReviewsXml({
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

export default function ProductRatingsFeedPage() {
    return null;
}
