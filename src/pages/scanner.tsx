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
    // HowTo — eligible for rich results in Google search and answer
    // boxes in AI search. Three concrete steps a user takes.
    {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: 'كيف تفحص جاهزية متجرك للذكاء الاصطناعي',
        description: 'فحص متجرك في ٣ خطوات سهلة على ٥ أبعاد لقياس مدى ظهوره في محركات الذكاء الاصطناعي.',
        totalTime: 'PT40S',
        step: [
            {
                '@type': 'HowToStep',
                position: 1,
                name: 'أدخل رابط متجرك',
                text: 'الصق رابط متجرك في الحقل (https://example.com).',
            },
            {
                '@type': 'HowToStep',
                position: 2,
                name: 'انتظر الفحص',
                text: 'تستغرق العملية حوالي ٤٠ ثانية. نفحص متجرك على ١٥ نقطة.',
            },
            {
                '@type': 'HowToStep',
                position: 3,
                name: 'احصل على التقرير',
                text: 'ستحصل على درجة من ١٠٠ + تفاصيل التقييم + تنبيهات وتوصيات. أضف بريدك لإرسال نسخة عبر الإيميل.',
            },
        ],
    },
    // FAQPage — answers AI-search and voice queries directly. Each
    // Question/Answer pair is eligible for the FAQ rich result.
    {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: [
            {
                '@type': 'Question',
                name: 'هل تظهر متاجر سلة وزد في ChatGPT و Perplexity؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'يعتمد ذلك على بنية البيانات في متجرك. محركات الذكاء الاصطناعي تعطي أولوية للمواقع التي تمتلك ملف llms.txt و Schema.org و تقييمات موثّقة. أداتنا تفحص هذه العناصر بدقة وتعطيك درجة من ١٠٠.',
                },
            },
            {
                '@type': 'Question',
                name: 'كم يستغرق الفحص؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'حوالي ٤٠ ثانية. نفحص متجرك على ١٥ نقطة موزعة على ٥ فئات: موثوقية التقييمات، الثقة التجارية، قابلية القراءة الآلية، البيانات المنظمة، ووضوح المحتوى.',
                },
            },
            {
                '@type': 'Question',
                name: 'هل الأداة مجانية؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'نعم، الفحص مجاني تمامًا ولا يتطلب تسجيلًا. يمكنك إضافة بريدك الإلكتروني اختياريًا لإرسال نسخة من التقرير.',
                },
            },
            {
                '@type': 'Question',
                name: 'ما الفرق بين متجر مشترك في مشتري موثق ومتجر غير مشترك؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'المتاجر المشتركة في مشتري موثق تحصل على درجة كاملة في "موثوقية التقييمات" لأن تقييماتها موثّقة عبر بروتوكول التحقق الثلاثي (دفع + شحن + تسليم). المتاجر غير المشتركة تظهر تنبيه يخبر عملاءها أن التقييمات غير موثّقة من جهة مستقلة.',
                },
            },
            {
                '@type': 'Question',
                name: 'ما هو ملف llms.txt ولماذا هو مهم؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'ملف llms.txt هو معيار جديد يخبر محركات الذكاء الاصطناعي بمحتوى موقعك المهم. وجوده يرفع فرص ظهور متجرك في إجابات ChatGPT و Perplexity و Google AI Overviews.',
                },
            },
            {
                '@type': 'Question',
                name: 'هل يحفظ الموقع نسخة من بيانات متجري؟',
                acceptedAnswer: {
                    '@type': 'Answer',
                    text: 'نحفظ فقط النتائج المهيكلة (الدرجات والتنبيهات) للتحليل والإحصاء. لا نخزّن HTML الكامل لمتجرك أو بيانات عملائك.',
                },
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

                {/* "What we check" — long-form crawlable content. Each
                    dimension is an H3 with a short explainer paragraph
                    so the page is substantive enough to rank for
                    AI-store readiness queries instead of being a
                    one-shot tool with no body content. */}
                <section className="bg-white py-16 px-4 border-t border-slate-200">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-3 text-center">
                            ماذا نفحص في متجرك؟
                        </h2>
                        <p className="text-slate-600 text-center mb-10">
                            ٥ أبعاد رئيسية موزّعة على ١٥ نقطة فحص — تغطي كل ما تنظر إليه محركات الذكاء الاصطناعي
                            عند تقييم متجرك.
                        </p>

                        <div className="space-y-6">
                            <article className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                                <h3 className="font-bold text-slate-900 mb-2">
                                    ١. موثوقية التقييمات <span className="text-xs text-slate-500">(٢٥٪)</span>
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    نتحقق من وجود تقييمات Schema.org بصيغة منظمة، أسماء المُقيّمين، تواريخ النشر،
                                    والتقييم الإجمالي (aggregateRating). نتحقق أيضًا من شارة &quot;مشتري موثق&quot;
                                    وبروتوكول التحقق الثلاثي (دفع + شحن + تسليم).
                                </p>
                            </article>

                            <article className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                                <h3 className="font-bold text-slate-900 mb-2">
                                    ٢. الثقة التجارية <span className="text-xs text-slate-500">(٢٥٪)</span>
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    وجود بيانات Organization أو LocalBusiness في Schema.org، صفحة &quot;من نحن&quot;،
                                    معلومات تواصل واضحة (هاتف/إيميل/واتساب)، وسياسة إرجاع. هذه عناصر
                                    تستخدمها محركات البحث للحكم على هوية المتجر وموثوقيته.
                                </p>
                            </article>

                            <article className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                                <h3 className="font-bold text-slate-900 mb-2">
                                    ٣. قابلية القراءة الآلية <span className="text-xs text-slate-500">(٢٠٪)</span>
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    وجود ملفي <code className="bg-slate-100 px-1 rounded text-emerald-700">robots.txt</code> و{' '}
                                    <code className="bg-slate-100 px-1 rounded text-emerald-700">llms.txt</code>،
                                    Canonical Tag صحيح، و Sitemap. ملف llms.txt الجديد يوجّه محركات الذكاء
                                    الاصطناعي مثل ChatGPT و Perplexity إلى المحتوى المهم في متجرك.
                                </p>
                            </article>

                            <article className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                                <h3 className="font-bold text-slate-900 mb-2">
                                    ٤. البيانات المنظمة <span className="text-xs text-slate-500">(١٥٪)</span>
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    وجود بيانات Schema.org من نوع Product، Organization، FAQPage، BreadcrumbList،
                                    و WebSite. كلما كانت البيانات أكثر وضوحًا، فهمت محركات الذكاء الاصطناعي متجرك
                                    بدقّة أكبر.
                                </p>
                            </article>

                            <article className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                                <h3 className="font-bold text-slate-900 mb-2">
                                    ٥. وضوح المحتوى <span className="text-xs text-slate-500">(١٥٪)</span>
                                </h3>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    هيكل العناوين (H1، H2، H3)، meta description، Open Graph tags
                                    (og:title، og:description، og:image)، ووجود قسم أسئلة شائعة. هذه عناصر تساعد
                                    الذكاء الاصطناعي على فهم محتوى متجرك بسرعة.
                                </p>
                            </article>
                        </div>
                    </div>
                </section>

                {/* FAQ — visible markup mirrors the FAQPage Schema.org
                    block so Google's FAQ rich result has both the
                    structured data AND the visible text it expects. */}
                <section className="bg-slate-50 py-16 px-4 border-t border-slate-200">
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-8 text-center">
                            أسئلة شائعة
                        </h2>

                        <div className="space-y-4">
                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>هل تظهر متاجر سلة وزد في ChatGPT و Perplexity؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    يعتمد ذلك على بنية البيانات في متجرك. محركات الذكاء الاصطناعي تعطي أولوية للمواقع
                                    التي تمتلك ملف llms.txt و Schema.org و تقييمات موثّقة. أداتنا تفحص هذه العناصر
                                    بدقة وتعطيك درجة من ١٠٠.
                                </p>
                            </details>

                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>كم يستغرق الفحص؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    حوالي ٤٠ ثانية. نفحص متجرك على ١٥ نقطة موزعة على ٥ فئات: موثوقية التقييمات،
                                    الثقة التجارية، قابلية القراءة الآلية، البيانات المنظمة، ووضوح المحتوى.
                                </p>
                            </details>

                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>هل الأداة مجانية؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    نعم، الفحص مجاني تمامًا ولا يتطلب تسجيلًا. يمكنك إضافة بريدك الإلكتروني اختياريًا
                                    لإرسال نسخة من التقرير.
                                </p>
                            </details>

                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>ما الفرق بين متجر مشترك في مشتري موثق ومتجر غير مشترك؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    المتاجر المشتركة في مشتري موثق تحصل على درجة كاملة في &quot;موثوقية التقييمات&quot;
                                    لأن تقييماتها موثّقة عبر بروتوكول التحقق الثلاثي (دفع + شحن + تسليم). المتاجر غير
                                    المشتركة تظهر تنبيه يخبر عملاءها أن التقييمات غير موثّقة من جهة مستقلة.
                                </p>
                            </details>

                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>ما هو ملف llms.txt ولماذا هو مهم؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    ملف llms.txt هو معيار جديد يخبر محركات الذكاء الاصطناعي بمحتوى موقعك المهم. وجوده
                                    يرفع فرص ظهور متجرك في إجابات ChatGPT و Perplexity و Google AI Overviews.
                                </p>
                            </details>

                            <details className="group rounded-xl bg-white border border-slate-200 p-5">
                                <summary className="font-bold text-slate-900 cursor-pointer flex justify-between items-center">
                                    <span>هل يحفظ الموقع نسخة من بيانات متجري؟</span>
                                    <span className="text-emerald-600 group-open:rotate-180 transition-transform">▼</span>
                                </summary>
                                <p className="mt-3 text-sm text-slate-700 leading-relaxed">
                                    نحفظ فقط النتائج المهيكلة (الدرجات والتنبيهات) للتحليل والإحصاء. لا نخزّن HTML
                                    الكامل لمتجرك أو بيانات عملائك.
                                </p>
                            </details>
                        </div>
                    </div>
                </section>

                {/* Footer with internal links — distributes anchor
                    authority to other pages on the site. */}
                <footer className="border-t border-slate-200 py-12 px-4 bg-white">
                    <div className="max-w-3xl mx-auto text-center space-y-6">
                        <div className="flex flex-wrap justify-center items-center gap-4 text-sm text-slate-600">
                            <Link href="/" className="hover:text-emerald-700 hover:underline transition-colors">
                                الرئيسية
                            </Link>
                            <span className="text-slate-300">·</span>
                            <a
                                href="https://apps.salla.sa/ar/app/1180703836"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-emerald-700 hover:underline transition-colors"
                            >
                                تطبيق سلة
                            </a>
                            <span className="text-slate-300">·</span>
                            <Link href="/blog" className="hover:text-emerald-700 hover:underline transition-colors">
                                المدونة
                            </Link>
                            <span className="text-slate-300">·</span>
                            <Link href="/faq" className="hover:text-emerald-700 hover:underline transition-colors">
                                الأسئلة الشائعة
                            </Link>
                            <span className="text-slate-300">·</span>
                            <Link href="/privacy-policy" className="hover:text-emerald-700 hover:underline transition-colors">
                                سياسة الخصوصية
                            </Link>
                        </div>
                        <div className="text-xs text-slate-500">
                            أداة مجانية مقدمة من{' '}
                            <Link href="/" className="font-bold text-emerald-700 hover:underline">
                                مشتري موثق · Theqah
                            </Link>
                        </div>
                    </div>
                </footer>
            </main>
        </>
    );
}
