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
const LAST_UPDATED = "2026-05-24";

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

                <script
                    type="application/ld+json"
                    id="ld-json-policy-en"
                >{JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "WebPage",
                    "@id": fullUrlEn,
                    inLanguage: "en",
                    url: fullUrlEn,
                    name: "Verification and Trust Policy - Mushtari Mowathaq (Theqah)",
                    description: metaDescription,
                    datePublished: LAST_UPDATED,
                    dateModified: LAST_UPDATED,
                    isPartOf: {
                        "@type": "WebSite",
                        "@id": `${SITE_URL}#website`,
                        name: "Mushtari Mowathaq",
                        url: SITE_URL,
                    },
                    publisher: {
                        "@type": "Organization",
                        name: "Mushtari Mowathaq (Theqah)",
                        url: SITE_URL,
                    },
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
                            Verification &amp; Trust Policy: Mushtari Mowathaq (Theqah)
                        </h1>
                        <p className="mt-4 text-base text-gray-700 leading-relaxed">
                            At Mushtari Mowathaq, our mission is to support a transparent
                            standard for e-commerce reviews in the region. We help reduce
                            review manipulation by verifying each review against transaction
                            data that can be independently confirmed.
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
                            1) The Triple Match Verification Protocol
                        </h2>
                        <p>
                            We do not allow manual review entry. Every review is processed
                            through our proprietary Triple Match API, which retrieves the
                            transaction data linked to the review from the e-commerce
                            platform&apos;s API, not directly from the merchant&apos;s store.
                            A review is published only after matching three independent
                            signals:
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                <strong>Payment Confirmation:</strong> Verification that the
                                purchase transaction was completed successfully.
                            </li>
                            <li>
                                <strong>Shipping Confirmation:</strong> Verification that the
                                order was handed over to the logistics provider.
                            </li>
                            <li>
                                <strong>Delivery Confirmation:</strong> Verification that the
                                order was received by the end customer.
                            </li>
                        </ul>
                    </section>

                    {/* 2) Legal Integrity */}
                    <section aria-labelledby="legal-integrity">
                        <h2
                            id="legal-integrity"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            2) Legal Integrity, Intellectual Property &amp; Data Governance
                        </h2>
                        <p>
                            We maintain high standards of legal integrity and regulatory
                            transparency. Our entity and related solutions are documented
                            within the applicable regulatory frameworks in Saudi Arabia.
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-3">
                            <li>
                                <strong>Verified with the Saudi Center for Competitiveness and
                                Business:</strong>
                                <br />
                                Verification number: 0000203970
                                <br />
                                Unified National Entity Number: 7041568804
                            </li>
                            <li>
                                <strong>Intellectual Property:</strong> Our verification
                                methodology is registered with the Saudi Authority for
                                Intellectual Property (SAIP) under certificate number
                                25-12-40512974.
                            </li>
                            <li>
                                <strong>Patent Status:</strong> Our unique technology is
                                currently under patent registration with application number
                                SA 1020255812.
                            </li>
                            <li>
                                <strong>Data Governance Compliance:</strong> We comply with
                                applicable data governance requirements, and we are officially
                                registered on the National Data Governance Platform operated by
                                the Saudi Data &amp; AI Authority (SDAIA) under registration
                                number 3260005643.
                            </li>
                        </ul>
                    </section>

                    {/* 3) Independence */}
                    <section aria-labelledby="independence">
                        <h2
                            id="independence"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            3) Independence &amp; Anti-Manipulation
                        </h2>
                        <p>
                            Mushtari Mowathaq acts as an independent review verification
                            entity. We maintain a certified and independent record of verified
                            reviews, while the merchant remains responsible for their own
                            store settings and storefront experience.
                        </p>
                        <ul className="list-disc pl-6 mt-3 space-y-2">
                            <li>
                                Merchants may be able to hide or delete reviews within their
                                own storefront interface.
                            </li>
                            <li>
                                This does not affect the review certification or the certified
                                record maintained by Mushtari Mowathaq.
                            </li>
                            <li>
                                The certificate serves as an independent, verified reference
                                for authenticated reviews and appears below each product in the
                                store via a dedicated store certificate link.
                            </li>
                            <li>
                                We do not have access to or control over the merchant&apos;s
                                admin panel.
                            </li>
                            <li>
                                Each review is linked to a unique certificate ID, such as
                                #TQ-XXXXXX, allowing independent verification through our
                                platform.
                            </li>
                        </ul>
                    </section>

                    {/* 4) Marketplace Integration */}
                    <section aria-labelledby="marketplace">
                        <h2
                            id="marketplace"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            4) Marketplace Integration
                        </h2>
                        <p>
                            Our platform integrates with supported e-commerce ecosystems,
                            including Salla currently, to ensure secure data flow and
                            transactional verification in line with partner platform policies.
                        </p>
                    </section>

                    {/* 5) Official Feeds */}
                    <section aria-labelledby="official-feeds">
                        <h2
                            id="official-feeds"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            5) Official Review Feeds
                        </h2>
                        <p>
                            Our official review feeds are publicly accessible through direct
                            HTTPS links and are updated automatically:
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
                            All reviews are verified through the Triple Match protocol and
                            are published only after payment, shipping, and delivery have
                            been independently confirmed. Merchants cannot manually add or
                            alter reviews in our certified record.
                        </p>
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
