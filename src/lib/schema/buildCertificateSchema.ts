// src/lib/schema/buildCertificateSchema.ts
//
// Builds the JSON-LD @graph injected into every store certificate page so
// Google / Bing / LLM crawlers (ChatGPT, Perplexity, Gemini) can recognize
// these reviews as independently verified by Mushtari Mowathaq — not just
// raw merchant-supplied testimonials.
//
// IMPORTANT: avgRating and reviewCount MUST come from VERIFIED reviews only
// (Triple Match: payment + shipping + delivery). The /api/public/store-profile
// endpoint already restricts its `stats` to verified reviews, so passing
// `profile.stats` directly here is safe.

import { URLS } from "@/config/constants";

const BASE = URLS.CANONICAL_ORIGIN;

export interface CertSchemaStore {
    storeUid: string;
    name: string;
    /** Full https URL of the store (e.g. "https://example.sa"). May be null. */
    url: string | null;
}

export interface CertSchemaReview {
    authorName: string;
    rating: number;
    text: string;
    /** ISO 8601 date string. */
    dateISO: string;
}

export interface CertSchemaInput {
    store: CertSchemaStore;
    /** Pre-computed verified-only aggregates. */
    stats: {
        avgRating: number;
        reviewCount: number;
    };
    certificate: {
        /** Format: TQ-XXXXXX */
        number: string;
        /** ISO 8601, last time any verified review was published. */
        lastUpdateISO: string;
    };
    /** Most recent verified reviews (≤20). */
    reviews: CertSchemaReview[];
}

export function buildCertificateSchema(input: CertSchemaInput) {
    const { store, stats, certificate, reviews } = input;

    const certUrl = `${BASE}/store/${encodeURIComponent(store.storeUid)}/certificate`;
    const storeUrl = store.url || certUrl;
    const storeNodeId = `${storeUrl}#store`;
    const orgId = `${BASE}/#organization`;

    const description =
        `${stats.reviewCount} تقييم موثق لمتجر ${store.name} عبر Triple Match — ` +
        `(دفع + شحن + استلام) · مشتري موثق`;

    return {
        "@context": "https://schema.org",
        "@graph": [
            // 1. Issuing organization (constant across all certificates)
            {
                "@type": "Organization",
                "@id": orgId,
                name: "مشتري موثق",
                alternateName: ["Mushtari Mowathaq", "theqah"],
                url: BASE,
                logo: `${BASE}/widgets/logo.png`,
                sameAs: ["https://twitter.com/theqahapp"],
                description:
                    "Independent third-party buyer review verification for Saudi e-commerce. " +
                    "Triple Match protocol: payment + shipping + delivery confirmation.",
                areaServed: "SA",
                knowsAbout: [
                    "Verified Buyer Reviews",
                    "E-commerce Trust Verification",
                    "Salla Marketplace API",
                    "Zid Marketplace API",
                ],
            },

            // 2. The certificate page itself
            {
                "@type": "WebPage",
                "@id": certUrl,
                name: `شهادة توثيق التقييمات — ${store.name}`,
                url: certUrl,
                description,
                publisher: { "@id": orgId },
                about: { "@id": storeNodeId },
                dateModified: certificate.lastUpdateISO,
                inLanguage: "ar-SA",
            },

            // 3. The merchant + AggregateRating (verified-only)
            {
                "@type": "OnlineBusiness",
                "@id": storeNodeId,
                name: store.name,
                url: storeUrl,
                aggregateRating: {
                    "@type": "AggregateRating",
                    ratingValue: stats.avgRating.toFixed(1),
                    reviewCount: stats.reviewCount,
                    bestRating: "5",
                    worstRating: "1",
                },
                additionalProperty: {
                    "@type": "PropertyValue",
                    name: "verificationCertificate",
                    value: certUrl,
                },
            },

            // 4. Individual verified reviews (most recent, capped at 20)
            ...reviews.slice(0, 20).map((r) => ({
                "@type": "Review",
                itemReviewed: { "@id": storeNodeId },
                author: { "@type": "Person", name: r.authorName },
                reviewRating: {
                    "@type": "Rating",
                    ratingValue: String(r.rating),
                    bestRating: "5",
                    worstRating: "1",
                },
                datePublished: r.dateISO,
                reviewBody: r.text || "تقييم بدون نص",
                additionalProperty: [
                    {
                        "@type": "PropertyValue",
                        name: "verificationStatus",
                        value: "verified",
                    },
                    {
                        "@type": "PropertyValue",
                        name: "verificationMethod",
                        value:
                            "Triple Match — Payment confirmed + Shipping confirmed + Delivery confirmed",
                    },
                    {
                        "@type": "PropertyValue",
                        name: "verifiedBy",
                        value: "مشتري موثق — theqah.com.sa",
                    },
                    {
                        "@type": "PropertyValue",
                        name: "certificateNumber",
                        value: certificate.number,
                    },
                ],
            })),
        ],
    };
}
