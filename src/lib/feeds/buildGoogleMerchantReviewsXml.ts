// src/lib/feeds/buildGoogleMerchantReviewsXml.ts
//
// Google Merchant Reviews XML serializer — for Google's Seller Ratings
// pathway. This is the OTHER half of Google's Approved Third-Party Review
// Aggregator program, distinct from product_reviews:
//
//   - product_reviews.xsd → requires per-review <products><product>
//     entries with product_url, product_name, ideally GTIN/SKU. Powers
//     gold stars under product images in Google Shopping.
//   - merchant_reviews.xsd → only requires per-review merchant context.
//     No product info per review. Powers gold stars next to the
//     merchant's brand in Google Search Ads.
//
// Why we need BOTH:
//   - Product Ratings feed (already built at /feeds/google-aggregator-sample.xml)
//     can't include our ~3,114 legacy backfill reviews — they lack the
//     productId+productUrl Google requires.
//   - Merchant Reviews feed (this one) HAS NO product requirement, so
//     every verified review on the platform — backfill or new — flows
//     through unchanged. Captures the full 3,500+ corpus for Seller
//     Ratings without dropping a single row.
//
// Reference:
//   https://support.google.com/merchants/answer/7124319
//   https://www.google.com/shopping/reviews/schema/merchant/2.3/merchant_reviews.xsd

const FEED_SCHEMA_URI =
    "http://www.google.com/shopping/reviews/schema/merchant/2.3/merchant_reviews.xsd";
const FEED_VERSION = "2.3";
const AGGREGATOR_NAME = "Mushtary Mowathaq (Theqah)";

export interface MerchantFeedReview {
    reviewId: string;
    reviewerName: string;
    /** ISO 8601 timestamp when the review was published. */
    publishedAtISO: string;
    /** Star rating 1-5. */
    rating: number;
    /** Review body text. Empty is allowed — we emit the verification
     *  annotation regardless. */
    text: string;
    /** Triple-Match certificate code, format TQ-XXXXXX. */
    certificateNumber: string;
    /** Originating merchant. Required for the merchant_reviews schema. */
    storeUid: string;
    storeName: string;
    /** Merchant's full storefront URL — required by merchant_reviews schema. */
    storeUrl: string | null;
    platform: string;
}

export interface MerchantFeedInput {
    reviews: MerchantFeedReview[];
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
 * Generic platform URLs we explicitly REJECT as merchant_url values.
 *
 * Why: some legacy stores in Firestore have `domain: "salla.sa"` instead
 * of their actual custom storefront. If we ship those as <merchant_url>,
 * Google reads the reviews as if they belong to Salla-the-platform rather
 * than the specific merchant — and the gold stars would attach to
 * salla.sa, not the merchant's brand. (Gemini caught this on the first
 * draft of the merchant feed.)
 *
 * For these cases we fall through to the merchant-specific Theqah cert
 * page URL, which IS a real, store-scoped URL on a domain we own — Google
 * accepts that as a valid merchant_url.
 */
const GENERIC_PLATFORM_HOSTS = new Set([
    "salla.sa",
    "www.salla.sa",
    "salla.com",
    "www.salla.com",
    "zid.store",
    "www.zid.store",
    "zid.sa",
    "www.zid.sa",
]);

function isGenericPlatformUrl(url: string | null): boolean {
    if (!url) return false;
    try {
        const u = new URL(url);
        // Reject when the host IS the platform itself (no merchant subdomain)
        // and the path is empty or just "/".
        if (GENERIC_PLATFORM_HOSTS.has(u.host.toLowerCase())) {
            const trimmedPath = u.pathname.replace(/\/+$/, "");
            return trimmedPath === "" || trimmedPath === "/";
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Build merchant_reviews.xsd-compliant XML. Returns a single string ready
 * to send as the HTTP body, with leading <?xml ... ?> declaration.
 *
 * Per-review structure follows the v2.3 schema. The <merchant_id> +
 * <merchant_name> + <merchant_url> fields replace the <products> block
 * that product_reviews uses — every other field is the same shape.
 */
export function buildGoogleMerchantReviewsXml(input: MerchantFeedInput): string {
    const { reviews, siteOrigin } = input;

    const reviewBlocks = reviews
        .map((r) => {
            const stars = Math.max(1, Math.min(5, r.rating || 5));
            const platformLabel = r.platform === "zid" ? "زد" : "سلة";

            const reviewUrl = `${siteOrigin}/store/${encodeURIComponent(r.storeUid)}/certificate#review-${r.reviewId}`;

            // Merchant URL: prefer the merchant's own storefront. Reject
            // generic platform URLs like "https://salla.sa" — those would
            // make Google attribute the stars to the platform, not the
            // merchant. Fall back to the merchant-specific Theqah cert
            // page URL which IS a real, store-scoped URL.
            const merchantUrl = (r.storeUrl && !isGenericPlatformUrl(r.storeUrl))
                ? r.storeUrl
                : `${siteOrigin}/store/${encodeURIComponent(r.storeUid)}/certificate`;

            const verifiedTag =
                ` [تم التحقق من هذا التقييم بواسطة نظام مشتري موثق — شراء فعلي مع توصيل عبر منصة ${platformLabel} — شهادة #${r.certificateNumber}]`;
            const contentBase = trim(r.text || "", 1500);
            const finalContent = trim(contentBase + verifiedTag, 1900);

            const title = trim(`تقييم موثق ${stars} نجوم — ${r.storeName}`, 200);
            const reviewerName = trim(r.reviewerName || "عميل موثق", 80);
            const merchantName = trim(r.storeName || "متجر", 200);

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
      <merchant_id>${escXml(r.storeUid)}</merchant_id>
      <merchant_name>${escXml(merchantName)}</merchant_name>
      <merchant_url>${escXml(merchantUrl)}</merchant_url>
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
