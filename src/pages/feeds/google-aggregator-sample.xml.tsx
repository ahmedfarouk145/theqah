// src/pages/feeds/google-aggregator-sample.xml.tsx
//
// Cross-merchant XML sample feed for Google's Approved Third-Party Review
// Aggregator application. Google's onboarding team asks applicants to
// supply a single direct URL to an XML file conforming to their Product
// Reviews XML Schema v2.3, containing a representative sample of reviews
// across multiple merchants — typically 3,000-5,000 items.
//
// This is the URL you submit alongside the aggregator application form.
//
// Differences from per-merchant feed (/api/feeds/google-product-reviews/{uid}/feed.xml):
//   - Cross-merchant: aggregates the latest N verified reviews across
//     ALL subscribed stores, not a single one.
//   - Higher item cap: up to 5,000 reviews (default 3500 per Google's
//     stated minimum threshold for aggregator review).
//   - Heavier cache: 1-day fresh + 1-week stale-while-revalidate.
//     Google fetches this maybe a handful of times during their review
//     process, not daily — so we trade freshness for serve-from-edge speed.
//
// Discoverable at https://www.theqah.com.sa/feeds/google-aggregator-sample.xml
// (Next.js Pages Router maps the literal .xml suffix into the URL for
//  static-route files, so this resolves to the path above).

import type { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import {
    buildGoogleAggregatorReviewsXml,
    type AggregatorFeedReview,
} from "@/lib/feeds/buildGoogleAggregatorReviewsXml";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

/**
 * Target output size: 3500 reviews after filtering. Google's aggregator-
 * application docs ask for a "representative sample" with no hard floor,
 * but the team has historically expected at least ~3,000 reviews drawn
 * from multiple merchants.
 *
 * We over-fetch (10,000) because the filter below excludes any review
 * lacking a real merchant product URL — typically the legacy backfilled
 * rows where Salla's API didn't return product info. Google's automated
 * feed validator rejects the entire feed if it finds <product_url>
 * entries that don't resolve to product pages, so filtering aggressively
 * is the right tradeoff (better fewer-but-clean than many-but-rejected).
 */
const AGGREGATOR_TARGET_SIZE = 3500;
const AGGREGATOR_FETCH_LIMIT = 10000;

// Bumped function timeout — fetching 3,500 reviews + bulk store enrichment
// can take ~10-20s on a cold start. Default is 300s on current Vercel
// plans, but being explicit avoids surprises if the platform ever shrinks
// the default for low-traffic endpoints.
export const config = {
    maxDuration: 60,
};

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let xml = "";
    try {
        const items = await buildReviewFeedData(AGGREGATOR_FETCH_LIMIT);

        // Filter: keep only reviews where we can build a REAL product URL
        // on the merchant's storefront. Without productId + storeDomain we
        // fall back to the certificate-page URL, and Google's automated
        // feed validator rejects feeds whose product_url doesn't resolve
        // to an actual product page. Better to ship 800 clean reviews than
        // 3,500 with a backfill-poisoned tail.
        const productPageReady = items.filter(
            (r) => !!r.productId && !!r.storeDomain,
        );

        // Map the shared ReviewFeedItem shape to the aggregator XML's
        // input shape, capped at the target sample size.
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

        // One-line summary in logs so we can spot the filter ratio
        // immediately when the endpoint runs.
        console.info(
            `[feeds/google-aggregator-sample] fetched=${items.length} ` +
            `productPageReady=${productPageReady.length} ` +
            `emitted=${aggregatorReviews.length}`,
        );

        xml = buildGoogleAggregatorReviewsXml({
            reviews: aggregatorReviews,
            siteOrigin: SITE_URL,
        });
    } catch (err) {
        console.error("[feeds/google-aggregator-sample] build failed:", err);
        // Fail-open with an empty-but-valid feed. Returning 5xx here
        // could damage our standing during Google's application review
        // — they fetch this URL once and a flaky response is interpreted
        // as "this aggregator is unreliable," which delays approval.
        xml = buildGoogleAggregatorReviewsXml({
            reviews: [],
            siteOrigin: SITE_URL,
        });
    }

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // 1 day fresh, 1 week stale-while-revalidate. Google's review team
    // fetches this a few times max during onboarding; we don't need
    // sub-hour freshness for that workflow, and a long stale window means
    // a transient Firestore latency never serves them a 5xx.
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=604800",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.write(xml);
    res.end();

    return { props: {} };
};

export default function GoogleAggregatorSampleFeedPage() {
    return null;
}
