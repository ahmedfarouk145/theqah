// src/pages/feeds/reviews.rss.xml.tsx
//
// Public verified-review feed in RSS 2.0 format. RSS exists primarily
// because:
//   1. IndexNow accepts RSS feeds as a URL submission mechanism — adding
//      this URL to Bing Webmaster Tools auto-submits every new review.
//   2. Some AI crawlers and feed-aggregator services still default to RSS.
//   3. RSS readers (Feedly, Inoreader) can subscribe humans to the feed.
//
// JSON Feed is the preferred format for new consumers (richer schema, more
// LLM-friendly) — see /feeds/reviews.json. RSS is the broad-compat fallback.
//
// We include a Dublin Core namespace so we can carry the rating + cert
// number without trying to cram them into <description>. AI crawlers that
// understand DC will pick them up; ones that don't fall back to the text
// description below.

import { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const FEED_URL = `${SITE_URL}/feeds/reviews.rss.xml`;

/**
 * XML 1.0 strict escape. Note: we do NOT use CDATA blocks because RSS
 * parsers handle entity-escaped text more consistently across the
 * ecosystem. Empty input returns empty string (never undefined).
 */
function escapeXml(s: string): string {
    return (s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toRfc822(iso: string): string {
    // RSS 2.0 requires RFC 822 dates. Date#toUTCString is the closest
    // Node built-in, and emits exactly the format the spec wants.
    return new Date(iso).toUTCString();
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let itemsXml = "";
    let lastBuildDate = new Date().toUTCString();

    try {
        const items = await buildReviewFeedData();
        if (items.length > 0) {
            lastBuildDate = toRfc822(items[0].datePublishedISO);
        }
        itemsXml = items
            .map((r) => {
                const ratingLine =
                    `تقييم بـ ${r.rating} من 5 نجوم. ` +
                    (r.content
                        ? `«${r.content}» — `
                        : "") +
                    `${r.authorName} · ${r.storeName}. ` +
                    `تم التحقق عبر بروتوكول Triple Match. ` +
                    `شهادة ${r.certificateNumber}.`;
                return `  <item>
    <title>${escapeXml(r.title)}</title>
    <link>${escapeXml(r.url)}</link>
    <guid isPermaLink="true">${escapeXml(r.url)}</guid>
    <pubDate>${toRfc822(r.datePublishedISO)}</pubDate>
    <description>${escapeXml(ratingLine)}</description>
    <dc:creator>${escapeXml(r.authorName)}</dc:creator>
    <dc:subject>${escapeXml(r.storeName)}</dc:subject>
    <theqah:rating>${r.rating}</theqah:rating>
    <theqah:certificateNumber>${escapeXml(r.certificateNumber)}</theqah:certificateNumber>
    <theqah:platform>${escapeXml(r.platform)}</theqah:platform>
    <theqah:storeUid>${escapeXml(r.storeUid)}</theqah:storeUid>
  </item>`;
            })
            .join("\n");
    } catch (err) {
        console.error("[feeds/reviews.rss.xml] build failed:", err);
    }

    // The custom `theqah:` namespace is declared on <rss> so child elements
    // pass validation. RSS validators ignore unknown namespaces but require
    // them to be declared at the document root.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:theqah="https://www.theqah.com.sa/ns/feed/v1">
  <channel>
    <title>تقييمات موثقة — مشتري موثق</title>
    <link>${SITE_URL}</link>
    <description>كل تقييم في هذا الـ feed تم التحقق منه عبر بروتوكول Triple Match (تأكيد الدفع + تأكيد الشحن + تأكيد الاستلام).</description>
    <language>ar-SA</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <generator>Theqah Public Review Feed v1</generator>
    <atom:link href="${FEED_URL}" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_URL}/widgets/logo.png</url>
      <title>مشتري موثق</title>
      <link>${SITE_URL}</link>
    </image>
${itemsXml}
  </channel>
</rss>`;

    res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=21600",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.write(xml);
    res.end();

    return { props: {} };
};

export default function ReviewsRssFeedPage() {
    return null;
}
