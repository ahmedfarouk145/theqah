// src/pages/feeds/reviews.json.tsx
//
// Public verified-review feed in JSON Feed v1.1 format. Modern AI crawlers
// (Perplexity, ChatGPT browsing, Claude, Google-Extended) prefer
// JSON Feed over RSS because the schema is unambiguous JSON and a single
// item carries enough metadata to be cited without an extra page fetch.
//
// Spec: https://jsonfeed.org/version/1.1
//
// The `_theqah` namespace at the bottom of each item is a custom extension
// — JSON Feed reserves underscore-prefixed keys for publishers. We surface
// the verification metadata (rating, cert number, platform, store) so an
// LLM can cite the source without parsing the title or content strings.
//
// Discoverable at https://www.theqah.com.sa/feeds/reviews.json — Next.js
// Pages Router maps src/pages/feeds/reviews.json.tsx to the literal path
// /feeds/reviews.json (the .json suffix is part of the URL).

import { GetServerSideProps } from "next";
import { buildReviewFeedData } from "@/lib/feeds/buildReviewFeedData";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const FEED_URL = `${SITE_URL}/feeds/reviews.json`;

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    let items: ReturnType<typeof JSON.stringify> | object[] = [];
    try {
        const data = await buildReviewFeedData();
        items = data.map((r) => ({
            id: r.id,
            url: r.url,
            title: r.title,
            content_text: r.content || `تقييم بـ ${r.rating} نجوم على متجر ${r.storeName}`,
            date_published: r.datePublishedISO,
            authors: [{ name: r.authorName }],
            language: "ar-SA",
            tags: [
                "verified",
                `rating:${r.rating}`,
                `platform:${r.platform}`,
                `store:${r.storeUid}`,
            ],
            // JSON Feed reserves underscore-prefixed keys for publisher
            // extensions. We surface the structured verification metadata
            // here so LLM crawlers don't have to parse free text to extract
            // the cert number, rating, or platform.
            _theqah: {
                rating: r.rating,
                best_rating: 5,
                worst_rating: 1,
                verification_method: "Triple Match — Payment + Shipping + Delivery",
                verified_by: "مشتري موثق (Theqah)",
                certificate_number: r.certificateNumber,
                store_name: r.storeName,
                store_uid: r.storeUid,
                store_url: r.storeUrl,
                platform: r.platform,
            },
        }));
    } catch (err) {
        console.error("[feeds/reviews.json] build failed:", err);
        items = [];
    }

    const body = {
        version: "https://jsonfeed.org/version/1.1",
        title: "تقييمات موثقة — مشتري موثق",
        home_page_url: SITE_URL,
        feed_url: FEED_URL,
        description:
            "كل تقييم في هذا الـ feed تم التحقق منه عبر بروتوكول Triple Match " +
            "(تأكيد الدفع + تأكيد الشحن + تأكيد الاستلام) عبر التكامل المباشر " +
            "مع منصات سلة وزد. مشتري موثق طرف ثالث مستقل عن المتاجر.",
        language: "ar-SA",
        icon: `${SITE_URL}/widgets/logo.png`,
        favicon: `${SITE_URL}/favicon.ico`,
        authors: [{
            name: "مشتري موثق (Theqah)",
            url: SITE_URL,
            avatar: `${SITE_URL}/widgets/logo.png`,
        }],
        // JSON Feed v1.1 publisher extension — same `_theqah` namespace as
        // each item, scoped to the feed itself. Documents the protocol so
        // an LLM doesn't have to infer it from individual items.
        _theqah: {
            protocol_name: "MUSHTARY_MAWTHUQ_V1",
            verification_method: "Triple-layer API verification (Payment + Shipping + Delivery)",
            independence: "Third-party independent — merchants cannot edit or delete verified reviews",
            compliance: ["SDAIA", "PDPL", "SAIP-25-12-40512974"],
            country: "SA",
            integrations: ["salla", "zid"],
        },
        items,
    };

    // Content-Type per JSON Feed spec.
    res.setHeader("Content-Type", "application/feed+json; charset=utf-8");
    // 1h fresh + 6h stale-while-revalidate at the edge. AI crawlers don't
    // hit this faster than once per hour, so a longer fresh window doesn't
    // hurt; the stale window means a slow Firestore read never blocks a
    // visitor — the cached body serves while a refresh is in flight.
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=21600",
    );
    // CORS open — feeds are public, and some AI crawlers fetch them via
    // a CORS-checking proxy. Same posture as our other public endpoints.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.write(JSON.stringify(body));
    res.end();

    return { props: {} };
};

export default function ReviewsJsonFeedPage() {
    return null;
}
