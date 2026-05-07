// src/pages/scanner.tsx
//
// Public AI-readiness scanner — moved off the home page into its own
// indexable route so it can rank for search queries like
// "هل متجري ظاهر في ChatGPT" / "AI store readiness check".
//
// SEO design choices:
//  - Self-contained <Head> with title/description/OG/Twitter — page is
//    crawled and indexed independent of the home page.
//  - Three Schema.org graphs in one ld+json block (WebPage anchored to
//    the WebApplication tool itself, plus the parent Organization and
//    a BreadcrumbList back to the home). All hardcoded — no user input
//    flows into the schema, so no XSS surface.
//  - canonical points to /scanner; OG/Twitter cards reference the same.

import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import ScannerSection from '@/components/ScannerSection';
import { URLS } from '@/config/constants';

const PAGE_URL = `${URLS.CANONICAL_ORIGIN}/scanner`;
const PAGE_TITLE = 'افحص جاهزية متجرك للذكاء الاصطناعي مجاناً | مشتري موثق';
const PAGE_DESCRIPTION =
    'أداة مجانية لفحص متجرك على ٥ أبعاد: موثوقية التقييمات، الثقة التجارية، البيانات المنظمة، قابلية القراءة الآلية، ووضوح المحتوى. اعرف هل ستجد محركات الذكاء الاصطناعي مثل ChatGPT و Perplexity و Google AI Overviews متجرك.';
const OG_IMAGE = `${URLS.CANONICAL_ORIGIN}/widgets/logo.png?v=3`;

const STRUCTURED_DATA = [
    {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        '@id': `${PAGE_URL}#webpage`,
        name: PAGE_TITLE,
        url: PAGE_URL,
        description: PAGE_DESCRIPTION,
        inLanguage: 'ar',
        isPartOf: {
            '@type': 'WebSite',
            name: 'مشتري موثق',
            url: URLS.CANONICAL_ORIGIN,
        },
        primaryImageOfPage: {
            '@type': 'ImageObject',
            url: OG_IMAGE,
        },
        mainEntity: {
            '@type': 'WebApplication',
            '@id': `${PAGE_URL}#tool`,
            name: 'فاحص جاهزية المتجر للذكاء الاصطناعي',
            url: PAGE_URL,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Any (web-based)',
            offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'SAR',
                availability: 'https://schema.org/InStock',
            },
            featureList: [
                'فحص موثوقية التقييمات',
                'فحص الثقة التجارية',
                'فحص قابلية القراءة الآلية (robots.txt و llms.txt)',
                'فحص البيانات المنظمة Schema.org',
                'فحص وضوح المحتوى للذكاء الاصطناعي',
                'تقرير تفصيلي بالعربية',
                'إرسال التقرير عبر البريد الإلكتروني',
            ],
            inLanguage: 'ar',
        },
    },
    {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': `${URLS.CANONICAL_ORIGIN}#organization`,
        name: 'مشتري موثق',
        alternateName: 'Theqah',
        url: URLS.CANONICAL_ORIGIN,
        logo: OG_IMAGE,
        sameAs: [
            'https://x.com/theqahapp',
            'https://www.instagram.com/theqahapp',
            'https://www.tiktok.com/@theqahapp',
            'https://youtube.com/@theqahapp',
        ],
    },
    {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
            {
                '@type': 'ListItem',
                position: 1,
                name: 'الرئيسية',
                item: URLS.CANONICAL_ORIGIN,
            },
            {
                '@type': 'ListItem',
                position: 2,
                name: 'فاحص جاهزية المتجر',
                item: PAGE_URL,
            },
        ],
    },
];

// Hardcoded JSON — no user input flows here, so the standard
// dangerouslySetInnerHTML pattern for JSON-LD is XSS-safe. The same
// pattern is used in src/pages/index.tsx for the home schema.
const STRUCTURED_DATA_JSON = JSON.stringify(STRUCTURED_DATA).replace(/</g, '\\u003c');

export default function ScannerPage() {
    return (
        <>
            <Head>
                <title>{PAGE_TITLE}</title>
                <meta name="description" content={PAGE_DESCRIPTION} />
                <meta name="robots" content="index, follow" />
                <link rel="canonical" href={PAGE_URL} />

                {/* Open Graph */}
                <meta property="og:type" content="website" />
                <meta property="og:url" content={PAGE_URL} />
                <meta property="og:title" content={PAGE_TITLE} />
                <meta property="og:description" content={PAGE_DESCRIPTION} />
                <meta property="og:image" content={OG_IMAGE} />
                <meta property="og:locale" content="ar_SA" />
                <meta property="og:site_name" content="مشتري موثق" />

                {/* Twitter */}
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={PAGE_TITLE} />
                <meta name="twitter:description" content={PAGE_DESCRIPTION} />
                <meta name="twitter:image" content={OG_IMAGE} />
            </Head>

            {/* Structured data — JSON.stringify of a hardcoded const,
                no user input → safe injection. */}
            <script
                type="application/ld+json"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: STRUCTURED_DATA_JSON }}
            />

            <main dir="rtl" className="min-h-screen bg-white">
                {/* Top bar — logo + back to home */}
                <header className="border-b border-slate-200 bg-white">
                    <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
                        <Link href="/" className="flex items-center gap-2 group">
                            <Image
                                src="/logo.png"
                                alt="مشتري موثق"
                                width={36}
                                height={36}
                                className="rounded-md"
                            />
                            <span className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                                مشتري موثق
                            </span>
                        </Link>
                        <Link
                            href="/"
                            className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
                        >
                            ← الرئيسية
                        </Link>
                    </div>
                </header>

                {/* Scanner — same component used previously on the home page */}
                <ScannerSection />

                {/* Mini-footer */}
                <footer className="border-t border-slate-200 py-8 px-4 bg-slate-50 text-center">
                    <div className="text-sm text-slate-600">
                        أداة مجانية مقدمة من{' '}
                        <Link href="/" className="font-bold text-emerald-700 hover:underline">
                            مشتري موثق
                        </Link>
                    </div>
                </footer>
            </main>
        </>
    );
}
