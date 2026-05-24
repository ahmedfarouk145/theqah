// src/pages/verification-trust-policy/index.tsx
//
// Public Verification & Trust Policy — Arabic canonical version.
//
// This page exists so Google's Third-Party Review Aggregator team (and
// any other regulator / AI crawler) has a stable, server-rendered URL
// where our verification methodology, legal registrations, and feed
// endpoints live as plain HTML (not JS-injected). It's the URL we cite
// in our Product Ratings + Seller Ratings application.
//
// English version lives at /verification-trust-policy/en — both are
// cross-linked via hreflang so Google clusters them as language
// alternates of the same document, not duplicates.

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import NavbarLanding from "@/components/NavbarLanding";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const PAGE_PATH_AR = "/verification-trust-policy";
const PAGE_PATH_EN = "/verification-trust-policy/en";
const LAST_UPDATED = "2026-05-24";

export default function VerificationTrustPolicyArabicPage() {
    const fullUrlAr = `${SITE_URL}${PAGE_PATH_AR}`;
    const fullUrlEn = `${SITE_URL}${PAGE_PATH_EN}`;
    const metaDescription =
        "Policy explaining how Mushtari Mowathaq verifies reviews using Triple Match, independent platform API data, and certified review records.";

    return (
        <>
            <Head>
                <title>سياسة التحقق والثقة — مشتري موثّق (الثقة)</title>
                <meta name="description" content={metaDescription} />
                <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large" />
                <link rel="canonical" href={fullUrlAr} />
                <link rel="alternate" hrefLang="ar" href={fullUrlAr} />
                <link rel="alternate" hrefLang="en" href={fullUrlEn} />
                <link rel="alternate" hrefLang="x-default" href={fullUrlAr} />

                <meta property="og:type" content="article" />
                <meta property="og:locale" content="ar_SA" />
                <meta property="og:locale:alternate" content="en_US" />
                <meta property="og:title" content="سياسة التحقق والثقة — مشتري موثّق (الثقة)" />
                <meta property="og:description" content={metaDescription} />
                <meta property="og:url" content={fullUrlAr} />
                <meta name="twitter:card" content="summary_large_image" />

                {/* JSON-LD: WebPage describing this policy. Static content,
                    no user input — same pattern as src/pages/faq.tsx and
                    src/pages/index.tsx. */}
                <script
                    type="application/ld+json"
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@type": "WebPage",
                            "@id": fullUrlAr,
                            inLanguage: "ar-SA",
                            url: fullUrlAr,
                            name: "سياسة التحقق والثقة — مشتري موثّق",
                            description: metaDescription,
                            datePublished: LAST_UPDATED,
                            dateModified: LAST_UPDATED,
                            isPartOf: {
                                "@type": "WebSite",
                                "@id": `${SITE_URL}#website`,
                                name: "مشتري موثّق",
                                url: SITE_URL,
                            },
                            publisher: {
                                "@type": "Organization",
                                name: "مشتري موثّق (Theqah)",
                                url: SITE_URL,
                            },
                        }),
                    }}
                />
            </Head>

            <main
                id="main-content"
                dir="rtl"
                lang="ar"
                className="bg-white text-[#0e1e1a] font-sans"
            >
                <NavbarLanding />
                <div className="h-20" />

                {/* Hero with logo + H1 */}
                <section className="bg-gradient-to-b from-green-50 to-white py-12">
                    <div className="max-w-3xl mx-auto px-6 text-center">
                        <Image
                            src="/logo.png"
                            alt="شعار مشتري موثّق"
                            width={88}
                            height={88}
                            priority
                            className="mx-auto"
                        />
                        <h1 className="mt-4 text-3xl md:text-4xl font-extrabold text-green-900 leading-tight">
                            سياسة التحقق والثقة: مشتري موثّق (الثقة)
                        </h1>
                        <p className="mt-4 text-base text-gray-700 leading-relaxed">
                            في مشتري موثّق، نهدف إلى دعم معيار شفاف لمراجعات التجارة الإلكترونية
                            في المنطقة. نساعد على الحد من التلاعب بالتقييمات من خلال التحقق من
                            كل مراجعة اعتمادًا على بيانات عملية يمكن إثباتها بشكل مستقل.
                        </p>

                        {/* Language toggle */}
                        <div className="mt-6 inline-flex rounded-full border border-green-200 bg-white shadow-sm text-sm">
                            <span
                                aria-current="page"
                                className="px-4 py-1.5 rounded-full bg-green-700 text-white font-semibold"
                            >
                                عربي
                            </span>
                            <Link
                                href={PAGE_PATH_EN}
                                hrefLang="en"
                                className="px-4 py-1.5 rounded-full text-green-800 hover:bg-green-50"
                            >
                                English
                            </Link>
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
                            1) بروتوكول Triple Match للتحقق
                        </h2>
                        <p>
                            لا نسمح بإدخال التقييمات يدويًا. تتم معالجة كل مراجعة عبر Triple
                            Match API الخاصة بنا، والتي تسحب بيانات العملية المرتبطة
                            بالمراجعة من واجهة برمجة التطبيقات (API) الخاصة بمنصة التجارة
                            الإلكترونية، وليس من المتجر مباشرة. لا تُنشر المراجعة إلا بعد
                            مطابقتها لثلاث إشارات مستقلة:
                        </p>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>
                                <strong>تأكيد الدفع:</strong> التحقق من اكتمال عملية الشراء بنجاح.
                            </li>
                            <li>
                                <strong>تأكيد الشحن:</strong> التحقق من تسليم الطلب إلى مزود
                                الخدمات اللوجستية.
                            </li>
                            <li>
                                <strong>تأكيد الاستلام:</strong> التحقق من استلام الطلب من قبل
                                العميل النهائي.
                            </li>
                        </ul>
                    </section>

                    {/* 2) Legal Integrity */}
                    <section aria-labelledby="legal-integrity">
                        <h2
                            id="legal-integrity"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            2) النزاهة القانونية والملكية الفكرية وحوكمة البيانات
                        </h2>
                        <p>
                            نلتزم بمعايير عالية من النزاهة القانونية والشفافية التنظيمية. وقد
                            تم توثيق منشأتنا وحلولنا ذات الصلة ضمن الأطر النظامية المعتمدة في
                            المملكة العربية السعودية.
                        </p>
                        <ul className="list-disc pr-6 mt-3 space-y-3">
                            <li>
                                <strong>موثق في المركز السعودي للتنافسية والأعمال:</strong>
                                <br />
                                رقم التوثيق: <span dir="ltr">0000203970</span>
                                <br />
                                الرقم الوطني الموحد للمنشأة: <span dir="ltr">7041568804</span>
                            </li>
                            <li>
                                <strong>الملكية الفكرية:</strong> تم تسجيل منهجية التحقق لدينا لدى
                                الهيئة السعودية للملكية الفكرية (SAIP) تحت رقم الشهادة{" "}
                                <span dir="ltr">25-12-40512974</span>.
                            </li>
                            <li>
                                <strong>حالة البراءة:</strong> تجري حاليًا عملية تسجيل براءة
                                اختراع لتقنيتنا الفريدة تحت الرقم{" "}
                                <span dir="ltr">SA 1020255812</span>.
                            </li>
                            <li>
                                <strong>الامتثال لحوكمة البيانات:</strong> نلتزم بأنظمة حوكمة
                                البيانات المعمول بها، وتم تسجيلنا رسميًا في منصة حوكمة البيانات
                                الوطنية التابعة للهيئة السعودية للبيانات والذكاء الاصطناعي
                                (SDAIA) تحت رقم التسجيل{" "}
                                <span dir="ltr">3260005643</span>.
                            </li>
                        </ul>
                    </section>

                    {/* 3) Independence */}
                    <section aria-labelledby="independence">
                        <h2
                            id="independence"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            3) الاستقلالية ومنع التلاعب
                        </h2>
                        <p>
                            تعمل مشتري موثّق كجهة مستقلة لتوثيق التقييمات. نحتفظ بسجل موثق
                            ومستقل للتقييمات التي تم التحقق منها، بينما يظل التاجر مسؤولًا عن
                            متجره وإعداداته الخاصة.
                        </p>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>قد يتمكن التاجر من إخفاء أو حذف التقييمات داخل واجهة متجره.</li>
                            <li>
                                لا يؤثر ذلك على شهادة توثيق التقييمات ولا على السجل الموثق داخل
                                مشتري موثّق.
                            </li>
                            <li>
                                الشهادة تمثل مرجعًا مستقلًا وموثقًا للتقييمات المعتمدة، وتظهر
                                أسفل كل منتج داخل المتجر عبر رابط خاص بشهادة المتجر.
                            </li>
                            <li>نحن لا نملك صلاحية الدخول إلى لوحة إدارة المتجر ولا نتحكم بها.</li>
                            <li>
                                كل تقييم مرتبط برقم شهادة فريد مثل{" "}
                                <span dir="ltr">#TQ-XXXXXX</span> يتيح التحقق من صحته بشكل مستقل
                                من خلال منصتنا.
                            </li>
                        </ul>
                    </section>

                    {/* 4) Marketplace Integration */}
                    <section aria-labelledby="marketplace">
                        <h2
                            id="marketplace"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            4) تكامل المنصة
                        </h2>
                        <p>
                            تتكامل منصتنا مع أنظمة التجارة الإلكترونية المدعومة، بما في ذلك
                            سلة حاليًا، لدعم تدفق البيانات والتحقق من المعاملات وفق سياسات
                            حماية البيانات المعتمدة لدى شركائنا.
                        </p>
                    </section>

                    {/* 5) Official Feeds */}
                    <section aria-labelledby="official-feeds">
                        <h2
                            id="official-feeds"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            5) خلاصات التقييمات الرسمية
                        </h2>
                        <p>
                            تتوفر خلاصات التقييمات الرسمية لدينا عبر روابط HTTPS مباشرة ويتم
                            تحديثها تلقائيًا:
                        </p>
                        <ul className="list-disc pr-6 mt-3 space-y-2" dir="ltr">
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
                            يتم التحقق من جميع التقييمات عبر بروتوكول Triple Match، ولا تُنشر
                            أي مراجعة إلا بعد اكتمال التحقق من الدفع والشحن والاستلام. ولا
                            يستطيع التجار إضافة التقييمات يدويًا أو تعديلها داخل السجل الموثق
                            لدينا.
                        </p>
                    </section>
                </article>

                {/* Page footer */}
                <footer className="border-t border-green-100 bg-green-50/60 py-8">
                    <div className="max-w-3xl mx-auto px-6 text-sm text-gray-700 space-y-2">
                        <p>
                            <strong>آخر تحديث:</strong>{" "}
                            <span dir="ltr">{LAST_UPDATED}</span>
                        </p>
                        <p>
                            <strong>للتواصل:</strong>{" "}
                            <a
                                className="text-green-700 underline hover:text-green-900"
                                href="mailto:reviews@theqah.com.sa"
                            >
                                reviews@theqah.com.sa
                            </a>
                        </p>
                        <p className="space-x-2 space-x-reverse">
                            <Link className="text-green-700 underline hover:text-green-900" href="/terms">
                                الشروط
                            </Link>
                            <span aria-hidden>·</span>
                            <Link
                                className="text-green-700 underline hover:text-green-900"
                                href="/privacy-policy"
                            >
                                سياسة الخصوصية
                            </Link>
                            <span aria-hidden>·</span>
                            <Link
                                className="text-green-700 underline hover:text-green-900"
                                href={PAGE_PATH_EN}
                                hrefLang="en"
                            >
                                English version
                            </Link>
                        </p>
                    </div>
                </footer>
            </main>
        </>
    );
}
