// src/lib/feeds/buildGoogleAggregatorReviewsXml.ts
//
// Cross-merchant XML serializer for Google's Product Reviews XML
// Schema v2.3. Used by the Approved Third-Party Review Aggregator
// application sample feed — one Theqah-controlled URL containing
// reviews from MANY merchants, which Google's aggregator-approval team
// fetches once during the application review process.
//
// Differs from buildGoogleProductReviewsXml.ts (per-store feed for
// individual merchants to paste into their own GMC):
//   - Aggregator XML carries per-review store metadata inline; we
//     can't assume a single <store> applies to the whole feed.
//   - Each <review> declares its own <product_url> rooted at that
//     merchant's storefront, so Google's review-quality classifier
//     can verify the review-to-merchant relationship per item.
//   - The top-level <aggregator> tag declares Theqah; the per-review
//     <publisher>/<store_name> hint surfaces the originating merchant.
//
// Reference:
//   https://support.google.com/merchants/answer/7045996
//   https://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd

const FEED_SCHEMA_URI =
    "http://www.google.com/shopping/reviews/schema/product/2.3/product_reviews.xsd";
const FEED_VERSION = "2.3";
const AGGREGATOR_NAME = "Mushtary Mowathaq (Theqah)";

export interface AggregatorFeedReview {
    reviewId: string;
    reviewerName: string;
    /** ISO 8601 timestamp when the review was published. */
    publishedAtISO: string;
    /** Star rating 1-5. */
    rating: number;
    /** Review body text (may be empty — we emit verification annotation regardless). */
    text: string;
    /** Triple-Match certificate code, format TQ-XXXXXX. */
    certificateNumber: string;
    /** Originating merchant info — varies per review. */
    storeUid: string;
    storeName: string;
    /** Merchant domain — used to build product_url. May be null. */
    storeDomain: string | null;
    /** Salla/Zid internal product ID — NOT a GTIN. May be empty. */
    productId: string;
    productName: string;
    /** "salla" | "zid" | etc. */
    platform: string;
}

export interface AggregatorFeedInput {
    reviews: AggregatorFeedReview[];
    /** Public Theqah origin used to build review_url anchors. */
    siteOrigin: string;
}

function escXml(s: string): string {
    return (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function trim(s: string, max: number): string {
    const collapsed = (s || "").replace(/\s+/g, " ").trim();
    return collapsed.length > max ? collapsed.slice(0, max - 1) + "…" : collapsed;
}

/**
 * Best-effort product page URL on the merchant's storefront. Salla's
 * URL pattern is `{domain}/p{productId}` which redirects to the canonical
 * slug; same shape works for Zid. Returns null when we lack the inputs.
 */
function buildProductUrl(domain: string | null, productId: string): string | null {
    if (!domain || !productId) return null;
    const base = domain.startsWith("http") ? domain : `https://${domain}`;
    return `${base.replace(/\/$/, "")}/p${productId}`;
}

/**
 * Build the full aggregator-sample feed XML. Returns a single string ready
 * to send as the HTTP body, with leading <?xml ... ?> declaration and a
 * trailing newline.
 *
 * Empty review list still produces a valid (though empty) feed — Google
 * handles this gracefully and won't penalize the aggregator submission;
 * it'll just show "0 reviews fetched" in their console.
 */
export function buildGoogleAggregatorReviewsXml(input: AggregatorFeedInput): string {
    const { reviews, siteOrigin } = input;

    const reviewBlocks = reviews
        .map((r) => {
            const stars = Math.max(1, Math.min(5, r.rating || 5));
            const platformLabel = r.platform === "zid" ? "زد" : "سلة";

            const reviewUrl = `${siteOrigin}/store/${encodeURIComponent(r.storeUid)}/certificate#review-${r.reviewId}`;
            // product_url priority: real product page on merchant domain.
            // Falls back to the certificate-anchor URL so the field is
            // never empty (XSD requires it to be a valid URL).
            const productUrl = buildProductUrl(r.storeDomain, r.productId) || reviewUrl;

            const verifiedTag =
                ` [تم التحقق من هذا التقييم بواسطة نظام مشتري موثق — شراء فعلي مع توصيل عبر منصة ${platformLabel} — شهادة #${r.certificateNumber}]`;
            const contentBase = trim(r.text || "", 1500);
            const finalContent = trim(contentBase + verifiedTag, 1900);

            const title = trim(`تقييم موثق ${stars} نجوم — ${r.storeName}`, 200);
            const reviewerName = trim(r.reviewerName || "عميل موثق", 80);
            const productName = trim(r.productName || `منتج من متجر ${r.storeName}`, 200);

            return `    <review>
      <review_id>${escXml(r.reviewId)}</review_id>
      <reviewer>
        <name>${escXml(reviewerName)}</name>
      </reviewer>
      <review_timestamp>${escXml(r.publishedAtISO)}</review_timestamp>
      <title>${escXml(title)}</title>
      <content>${escXml(finalContent)}</content>
      <review_url type="singleton">${escXml(reviewUrl)}</review_url>
      <ratings>
        <overall min="1" max="5">${stars}</overall>
      </ratings>
      <products>
        <product>
          <product_name>${escXml(productName)}</product_name>
          <product_url>${escXml(productUrl)}</product_url>
        </product>
      </products>
      <collection_method>post_purchase</collection_method>
    </review>`;
        })
        .join("\n");

    const aggregatorBlock = `  <aggregator>
    <name>${escXml(AGGREGATOR_NAME)}</name>
  </aggregator>`;

    const publisherBlock = `  <publisher>
    <name>${escXml(AGGREGATOR_NAME)}</name>
    <favicon>${escXml(`${siteOrigin}/favicon.ico`)}</favicon>
  </publisher>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:noNamespaceSchemaLocation="${FEED_SCHEMA_URI}">
  <version>${FEED_VERSION}</version>
${aggregatorBlock}
${publisherBlock}
  <reviews>
${reviewBlocks}
  </reviews>
</feed>
`;
}
