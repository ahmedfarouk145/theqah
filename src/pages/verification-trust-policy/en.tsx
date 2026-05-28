// src/pages/verification-trust-policy/en.tsx
//
// English alternate of the Verification & Trust Policy.
// Arabic canonical lives at /verification-trust-policy.
//
// Structure mirrors the AR version 1:1 so Google clusters them as
// hreflang language alternates rather than as competing pages.

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import NavbarLanding from "@/components/NavbarLanding";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const PAGE_PATH_AR = "/verification-trust-policy";
const PAGE_PATH_EN = "/verification-trust-policy/en";
const LAST_UPDATED = "2026-05-25";

// Section headings — exposed in the Article JSON-LD as `articleSection[]`.
// Keep in sync with the H2 text below.
const ARTICLE_SECTIONS_EN = [
    "Triple Match Verification Protocol",
    "Legal Integrity, Intellectual Property, and Data Governance",
    "Independence and Anti-Manipulation",
    "Review Verification Badge",
    "Review Certification",
    "Platform Integration",
    "Official Review Feeds",
    "Deletion, Editing, and Fair Moderation Policy",
    "Final Provisions",
];

export default function VerificationTrustPolicyEnglishPage() {
    const fullUrlAr = `${SITE_URL}${PAGE_PATH_AR}`;
    const fullUrlEn = `${SITE_URL}${PAGE_PATH_EN}`;
    const metaDescription =
        "Policy explaining how Mushtari Mowathaq verifies reviews using Triple Match, independent platform API data, and certified review records.";

    return (
        <>
            <Head>
                <title>Verification &amp; Trust Policy — Mushtari Mowathaq (Theqah)</title>
                <meta name="description" content={metaDescription} />
                <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
                <link rel="canonical" href={fullUrlEn} />
                <link rel="alternate" hrefLang="ar" href={fullUrlAr} />
                <link rel="alternate" hrefLang="en" href={fullUrlEn} />
                <link rel="alternate" hrefLang="x-default" href={fullUrlAr} />

                <meta property="og:type" content="article" />
                <meta property="og:locale" content="en_US" />
                <meta property="og:locale:alternate" content="ar_SA" />
                <meta property="og:title" content="Verification & Trust Policy — Mushtari Mowathaq (Theqah)" />
                <meta property="og:description" content={metaDescription} />
                <meta property="og:url" content={fullUrlEn} />
                <meta name="twitter:card" content="summary_large_image" />

                {/* Schema.org @graph: WebPage + Article + Organization wired
                    together so AI crawlers extract our legal identifiers
                    (SAIP, SDAIA, SBC, patent) as structured PropertyValue
                    data rather than parsing them out of body text. */}
                <script
                    type="application/ld+json"
                    id="ld-json-policy-en"
                >{JSON.stringify({
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "WebPage",
                            "@id": fullUrlEn,
                            inLanguage: "en",
                            url: fullUrlEn,
                            name: "Verification and Trust Policy - Mushtari Mowathaq (Theqah)",
                            description: metaDescription,
                            datePublished: LAST_UPDATED,
                            dateModified: LAST_UPDATED,
                            isPartOf: { "@id": `${SITE_URL}#website` },
                            about: { "@id": `${SITE_URL}#organization` },
                            mainEntity: { "@id": `${fullUrlEn}#article` },
                            inLanguageAlternates: [
                                { "@type": "WebPage", "@id": fullUrlAr, inLanguage: "ar-SA" },
                            ],
                        },
                        {
                            "@type": "Article",
                            "@id": `${fullUrlEn}#article`,
                            headline: "Verification and Trust Policy - Mushtari Mowathaq (Theqah)",
                            description: metaDescription,
                            inLanguage: "en",
                            datePublished: LAST_UPDATED,
                            dateModified: LAST_UPDATED,
                            articleSection: ARTICLE_SECTIONS_EN,
                            mainEntityOfPage: { "@id": fullUrlEn },
                            author: { "@id": `${SITE_URL}#organization` },
                            publisher: { "@id": `${SITE_URL}#organization` },
                        },
                        {
                            "@type": "Organization",
                            "@id": `${SITE_URL}#organization`,
                            name: "Mushtari Mowathaq (Theqah)",
                            alternateName: ["Moshtary Moathaq", "Theqah"],
                            url: SITE_URL,
                            logo: `${SITE_URL}/logo.png`,
                            email: "reviews@theqah.com.sa",
                            areaServed: { "@type": "Country", name: "Saudi Arabia" },
                            identifier: [
                                {
                                    "@type": "PropertyValue",
                                    propertyID: "Saudi Business Center Registration",
                                    value: "0000203970",
                                },
                                {
                                    "@type": "PropertyValue",
                                    propertyID: "Unified National Entity Number",
                                    value: "7041568804",
                                },
                                {
                                    "@type": "PropertyValue",
                                    propertyID: "Saudi Authority for Intellectual Property (SAIP) Certificate",
                                    value: "25-12-40512974",
                                },
                                {
                                    "@type": "PropertyValue",
                                    propertyID: "Saudi Data and AI Authority (SDAIA) National Data Governance Registration",
                                    value: "3260005643",
                                },
                                {
                                    "@type": "PropertyValue",
                                    propertyID: "Patent Application (Saudi Arabia)",
                                    value: "SA 1020255812",
                                },
                            ],
                        },
                        {
                            "@type": "WebSite",
                            "@id": `${SITE_URL}#website`,
                            name: "Mushtari Mowathaq",
                            url: SITE_URL,
                            publisher: { "@id": `${SITE_URL}#organization` },
                        },
                    ],
                })}</script>
            </Head>

            <main
                id="main-content"
                dir="ltr"
                lang="en"
                className="bg-white text-[#0e1e1a] font-sans"
            >
                <NavbarLanding />
                <div className="h-20" />

                {/* Hero with logo + H1 */}
                <section className="bg-gradient-to-b from-green-50 to-white py-12">
                    <div className="max-w-3xl mx-auto px-6 text-center">
                        <Image
                            src="/logo.png"
                            alt="Mushtari Mowathaq logo"
                            width={88}
                            height={88}
                            priority
                            className="mx-auto"
                        />
                        <h1 className="mt-4 text-3xl md:text-4xl font-extrabold text-green-900 leading-tight">
                            Trust and Verification Policy: Mushtari Mowathaq (Theqah)
                        </h1>
                        <p className="mt-4 text-base text-gray-700 leading-relaxed">
                            At Mushtari Mowathaq, we are committed to providing an
                            independent and transparent framework for documenting e-commerce
                            reviews and reducing review manipulation by verifying each review
                            against independently verifiable transaction data.
                        </p>

                        {/* Language toggle */}
                        <div className="mt-6 inline-flex rounded-full border border-green-200 bg-white shadow-sm text-sm">
                            <Link
                                href={PAGE_PATH_AR}
                                hrefLang="ar"
                                className="px-4 py-1.5 rounded-full text-green-800 hover:bg-green-50"
                            >
                                عربي
                            </Link>
                            <span
                                aria-current="page"
                                className="px-4 py-1.5 rounded-full bg-green-700 text-white font-semibold"
                            >
                                English
                            </span>
                        </div>
                    </div>
                </section>

                <article className="max-w-3xl mx-auto px-6 py-12 space-y-10 leading-relaxed text-[15.5px]">
                    {/* 1) Triple Match */}
                    <section aria-labelledby="triple-match">
                        <h2
                            id="triple-match"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            1) Triple Match Verification Protocol
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>We do not allow manual entry of reviews.</li>
                            <li>
                                Each review is processed through our Triple Match API, which
                                retrieves transaction-related data from the e-commerce
                                platform&apos;s API, not from the merchant&apos;s store directly.
                            </li>
                            <li>
                                A review is published only after matching three independent
                                signals:
                                <ul className="list-disc pl-6 mt-2 space-y-1">
                                    <li>
                                        <strong>Payment confirmation:</strong> verification that the
                                        purchase was completed successfully.
                                    </li>
                                    <li>
                                        <strong>Shipping confirmation:</strong> verification that the
                                        order was handed over to the logistics provider.
                                    </li>
                                    <li>
                                        <strong>Receipt confirmation:</strong> verification that the
                                        order was received by the end customer.
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </section>

                    {/* 2) Legal Integrity */}
                    <section aria-labelledby="legal-integrity">
                        <h2
                            id="legal-integrity"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            2) Legal Integrity, Intellectual Property, and Data Governance
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-3">
                            <li>
                                We adhere to high standards of legal integrity and regulatory
                                transparency.
                            </li>
                            <li>
                                Our entity and related solutions have been documented within
                                the applicable regulatory frameworks in the Kingdom of Saudi
                                Arabia:
                                <ul className="list-disc pl-6 mt-2 space-y-2">
                                    <li>
                                        <strong>Saudi Business Center:</strong> registered under No.
                                        (0000203970), with Unified National Number (7041568804).
                                    </li>
                                    <li>
                                        <strong>Intellectual Property:</strong>
                                        <ul className="list-disc pl-6 mt-1 space-y-1">
                                            <li>
                                                Our verification methodology has been registered with the
                                                Saudi Authority for Intellectual Property (SAIP) under
                                                certificate No. (25-12-40512974).
                                            </li>
                                            <li>
                                                The registration process for our unique technology is
                                                currently underway under No. (SA 1020255812).
                                            </li>
                                        </ul>
                                    </li>
                                    <li>
                                        <strong>Data Governance Compliance:</strong> we comply with
                                        the applicable data governance regulations and are officially
                                        registered on the National Data Governance Platform affiliated
                                        with the Saudi Data and Artificial Intelligence Authority
                                        (SDAIA) under No. (3260005643).
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </section>

                    {/* 3) Independence */}
                    <section aria-labelledby="independence">
                        <h2
                            id="independence"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            3) Independence and Anti-Manipulation
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                Mushtari Mowathaq operates as an independent review verification
                                entity.
                            </li>
                            <li>
                                We maintain a documented and independent record of verified
                                reviews, while the merchant remains responsible for their own
                                store and settings.
                            </li>
                            <li>
                                Any hiding or deletion of reviews within the merchant&apos;s
                                storefront does not affect the review certification or the
                                documented record within our platform.
                            </li>
                            <li>
                                The certificate serves as an independent and documented
                                reference for approved reviews.
                            </li>
                            <li>
                                We do not have access to or control over the merchant&apos;s
                                admin panel.
                            </li>
                            <li>
                                Each review is linked to a unique certificate number, such as
                                #TQ-XXXXXX, enabling independent verification through our
                                platform.
                            </li>
                        </ul>
                    </section>

                    {/* 4) Review Verification Badge */}
                    <section aria-labelledby="verification-badge">
                        <h2
                            id="verification-badge"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            4) Review Verification Badge
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                A &ldquo;Mushtari Mowathaq&rdquo; badge appears next to each verified
                                review to distinguish it from other reviews, and the badge is
                                visible to visitors on each verified review within the store
                                page.
                            </li>
                            <li>
                                When the badge is clicked, the visitor is directed to the
                                review certification page for that merchant within the Mushtari
                                Mowathaq platform, and no login or authentication is required.
                            </li>
                            <li>
                                The page displays only the certificate and the review intended
                                for verification.
                            </li>
                            <li>
                                If the review exists in the verification record within Mushtari
                                Mowathaq, it is considered verified.
                            </li>
                            <li>
                                If clicking the badge leads to an empty page, does not respond,
                                or does not display the verification record associated with the
                                review, this is an indication that the store is not subscribed
                                or that the review is not verified.
                            </li>
                            <li>
                                This mechanism is intended to enable customers to directly
                                verify subscription and verification status, prevent
                                manipulation or improper use of the badge or certificate in the
                                future, and preserve the integrity of the verified record.
                            </li>
                        </ul>
                    </section>

                    {/* 5) Review Certification */}
                    <section aria-labelledby="review-certification">
                        <h2
                            id="review-certification"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            5) Review Certification
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                The Review Certification is a prominent, relatively large mark
                                displayed below each product in the store.
                            </li>
                            <li>The certification includes the Mushtari Mowathaq logo.</li>
                            <li>The merchant store name appears below the logo.</li>
                            <li>
                                The following statement appears: &ldquo;All reviews for this store
                                are audited by Mushtari Mowathaq, a third party, to ensure
                                authenticity.&rdquo;
                            </li>
                            <li>
                                The certificate number is clearly displayed below the certificate.
                            </li>
                            <li>
                                When clicked, the user is redirected to the merchant&apos;s
                                review certification page within the Mushtari Mowathaq platform,
                                and no login or authentication is required.
                            </li>
                            <li>
                                The certification page displays the merchant&apos;s full details,
                                including the number of verified reviews and the store link.
                            </li>
                            <li>
                                The certificate is then shown, followed by all verified reviews
                                and the related verification details.
                            </li>
                            <li>
                                The certification is not used as a decorative element; rather,
                                it serves as an independent verification record accessible
                                through the badge or dedicated link.
                            </li>
                            <li>
                                The Review Certification is visible to visitors and
                                independently accessible.
                            </li>
                            <li>
                                If the Review Certification leads to a functional and matching
                                verification page within Mushtari Mowathaq and displays the
                                merchant&apos;s associated record, the store is considered
                                subscribed and verified.
                            </li>
                            <li>
                                If the Review Certification leads to an empty page, does not
                                respond, or does not display the merchant&apos;s associated
                                verification record, this is an indication that the store is not
                                subscribed or not verified.
                            </li>
                            <li>
                                This mechanism is intended to enable customers to directly
                                verify subscription and verification status and prevent
                                manipulation or improper use of the badge or certificate in the
                                future.
                            </li>
                        </ul>
                    </section>

                    {/* 6) Platform Integration */}
                    <section aria-labelledby="marketplace">
                        <h2
                            id="marketplace"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            6) Platform Integration
                        </h2>
                        <p>
                            Our platform integrates with supported e-commerce systems to
                            facilitate transaction data flow and verification, subject to the
                            data protection policies agreed with our partners.
                        </p>
                    </section>

                    {/* 7) Official Feeds */}
                    <section aria-labelledby="official-feeds">
                        <h2
                            id="official-feeds"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            7) Official Review Feeds
                        </h2>
                        <p>
                            Our official review feeds are available via secure direct HTTPS
                            links and are updated automatically:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                <strong>Seller Ratings:</strong>{" "}
                                <a
                                    href={`${SITE_URL}/feeds/seller-ratings.xml`}
                                    className="text-green-700 underline hover:text-green-900 break-all"
                                >
                                    {SITE_URL}/feeds/seller-ratings.xml
                                </a>
                            </li>
                            <li>
                                <strong>Product Ratings:</strong>{" "}
                                <a
                                    href={`${SITE_URL}/feeds/product-ratings.xml`}
                                    className="text-green-700 underline hover:text-green-900 break-all"
                                >
                                    {SITE_URL}/feeds/product-ratings.xml
                                </a>
                            </li>
                        </ul>
                        <p className="mt-3">
                            All reviews are verified through the Triple Match protocol, and
                            no review is published until payment, shipping, and receipt have
                            all been confirmed. Merchants cannot manually add or modify
                            reviews within our documented record.
                        </p>
                    </section>

                    {/* 8) Deletion / Moderation Policy */}
                    <section aria-labelledby="moderation">
                        <h2
                            id="moderation"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            8) Deletion, Editing, and Fair Moderation Policy
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                We maintain a transparent and fair policy regarding review
                                deletion and editing to preserve review independence and the
                                integrity of the documented record.
                            </li>
                            <li>
                                The customer is the only party entitled to edit or delete their
                                review through their primary account on the e-commerce platform
                                where the purchase was made.
                            </li>
                            <li>
                                The merchant has no direct authority to delete or edit reviews
                                within the Mushtari Mowathaq record or the independent
                                certification page.
                            </li>
                            <li>
                                If the merchant wishes to dispute a review, they may submit an
                                official report only if the review violates the content policy.
                            </li>
                            <li>
                                Each report is reviewed independently and fairly, and a final
                                decision is issued within 3 to 5 business days.
                            </li>
                            <li>
                                During the review period, the review remains visible in the
                                data feeds until a final decision is made to ensure transparency.
                            </li>
                            <li>
                                If a violation is confirmed, the review will be permanently
                                removed in accordance with our published content policy.
                            </li>
                            <li>
                                Any edit or deletion performed by the customer on the original
                                purchasing platform is automatically synchronized to update the
                                certification page and official feeds.
                            </li>
                            <li>
                                Hiding a review within the store interface does not mean it has
                                been removed from the documented record within Mushtari
                                Mowathaq.
                            </li>
                            <li>
                                Reviews are not removed from the feed merely at the merchant&apos;s
                                request or based on controls within their storefront.
                            </li>
                        </ul>
                    </section>

                    {/* 9) Final Provisions */}
                    <section aria-labelledby="final-provisions">
                        <h2
                            id="final-provisions"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            9) Final Provisions
                        </h2>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                Mushtari Mowathaq reserves the right to update this policy
                                whenever necessary to comply with applicable regulatory and
                                operational requirements.
                            </li>
                            <li>
                                This policy applies to all reviews verified through the
                                platform, and to all related certification pages, feeds, and
                                interfaces.
                            </li>
                            <li>
                                Use of our services constitutes acceptance of this policy and
                                any subsequent updates.
                            </li>
                        </ul>
                    </section>
                </article>

                {/* Page footer */}
                <footer className="border-t border-green-100 bg-green-50/60 py-8">
                    <div className="max-w-3xl mx-auto px-6 text-sm text-gray-700 space-y-2">
                        <p>
                            <strong>Last updated:</strong> {LAST_UPDATED}
                        </p>
                        <p>
                            <strong>Contact:</strong>{" "}
                            <a
                                className="text-green-700 underline hover:text-green-900"
                                href="mailto:reviews@theqah.com.sa"
                            >
                                reviews@theqah.com.sa
                            </a>
                        </p>
                        <p className="space-x-2">
                            <Link className="text-green-700 underline hover:text-green-900" href="/terms">
                                Terms
                            </Link>
                            <span aria-hidden>·</span>
                            <Link
                                className="text-green-700 underline hover:text-green-900"
                                href="/privacy-policy"
                            >
                                Privacy Policy
                            </Link>
                            <span aria-hidden>·</span>
                            <Link
                                className="text-green-700 underline hover:text-green-900"
                                href={PAGE_PATH_AR}
                                hrefLang="ar"
                            >
                                النسخة العربية
                            </Link>
                        </p>
                    </div>
                </footer>
            </main>
        </>
    );
}
