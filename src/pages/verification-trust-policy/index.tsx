// src/pages/verification-trust-policy/index.tsx
//
// Public Verification & Trust Policy — Arabic canonical version.
//
// This page is the stable, server-rendered URL we cite to Google's
// Third-Party Review Aggregator team, AI crawlers, and any regulator
// that needs to verify our verification methodology, legal registrations,
// and feed endpoints. Everything below is plain HTML rendered by the
// server — no JS required to read the policy.
//
// English version lives at /verification-trust-policy/en.

import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import NavbarLanding from "@/components/NavbarLanding";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;
const PAGE_PATH_AR = "/verification-trust-policy";
const PAGE_PATH_EN = "/verification-trust-policy/en";
const LAST_UPDATED = "2026-05-25";

// Section headings — exposed in the Article JSON-LD as `articleSection[]`
// so AI crawlers can answer "does this policy cover X?" without parsing
// the DOM. Keep in sync with the H2 text below.
const ARTICLE_SECTIONS_AR = [
    "بروتوكول Triple Match للتحقق",
    "النزاهة القانونية والملكية الفكرية وحوكمة البيانات",
    "الاستقلالية ومنع التلاعب",
    "شارة التوثيق في التقييم",
    "شهادة توثيق التقييمات",
    "تكامل المنصة",
    "خلاصات التقييمات الرسمية",
    "سياسة الحذف والتعديل والإشراف العادل",
    "أحكام ختامية",
];

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

                {/* Schema.org @graph: WebPage + Article + Organization wired
                    together. Lets crawlers extract our legal identifiers
                    (SAIP, SDAIA, SBC, patent) as structured PropertyValue
                    data rather than parsing them out of body text. */}
                <script
                    type="application/ld+json"
                    id="ld-json-policy-ar"
                >{JSON.stringify({
                    "@context": "https://schema.org",
                    "@graph": [
                        {
                            "@type": "WebPage",
                            "@id": fullUrlAr,
                            inLanguage: "ar-SA",
                            url: fullUrlAr,
                            name: "سياسة التحقق والثقة - مشتري موثق",
                            description: metaDescription,
                            datePublished: LAST_UPDATED,
                            dateModified: LAST_UPDATED,
                            isPartOf: { "@id": `${SITE_URL}#website` },
                            about: { "@id": `${SITE_URL}#organization` },
                            mainEntity: { "@id": `${fullUrlAr}#article` },
                            inLanguageAlternates: [
                                { "@type": "WebPage", "@id": fullUrlEn, inLanguage: "en" },
                            ],
                        },
                        {
                            "@type": "Article",
                            "@id": `${fullUrlAr}#article`,
                            headline: "سياسة التحقق والثقة - مشتري موثق",
                            description: metaDescription,
                            inLanguage: "ar-SA",
                            datePublished: LAST_UPDATED,
                            dateModified: LAST_UPDATED,
                            articleSection: ARTICLE_SECTIONS_AR,
                            mainEntityOfPage: { "@id": fullUrlAr },
                            author: { "@id": `${SITE_URL}#organization` },
                            publisher: { "@id": `${SITE_URL}#organization` },
                        },
                        {
                            "@type": "Organization",
                            "@id": `${SITE_URL}#organization`,
                            name: "Mushtari Mowathaq (Theqah)",
                            alternateName: ["مشتري موثق", "Theqah", "Moshtary Moathaq"],
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
                            في مشتري موثّق، نلتزم بتقديم إطار مستقل وشفاف لتوثيق مراجعات
                            التجارة الإلكترونية، والحد من التلاعب بها، عبر التحقق من كل
                            مراجعة بناءً على بيانات عملية قابلة للإثبات بشكل مستقل.
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
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>لا نسمح بإدخال التقييمات يدويًا.</li>
                            <li>
                                تتم معالجة كل مراجعة عبر واجهة Triple Match API الخاصة بنا،
                                والتي تسحب بيانات العملية المرتبطة بالمراجعة من واجهة برمجة
                                التطبيقات الخاصة بمنصة التجارة الإلكترونية، وليس من المتجر
                                مباشرة.
                            </li>
                            <li>
                                لا تُنشر المراجعة إلا بعد مطابقتها لثلاث إشارات مستقلة:
                                <ul className="list-disc pr-6 mt-2 space-y-1">
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
                        <ul className="list-disc pr-6 mt-3 space-y-3">
                            <li>نلتزم بمعايير عالية من النزاهة القانونية والشفافية التنظيمية.</li>
                            <li>
                                وقد تم توثيق منشأتنا وحلولنا ذات الصلة ضمن الأطر النظامية
                                المعتمدة في المملكة العربية السعودية:
                                <ul className="list-disc pr-6 mt-2 space-y-2">
                                    <li>
                                        <strong>المركز السعودي للأعمال:</strong> سجل موثق برقم{" "}
                                        <span dir="ltr">(0000203970)</span>، والرقم الوطني الموحد
                                        للمنشأة <span dir="ltr">(7041568804)</span>.
                                    </li>
                                    <li>
                                        <strong>الملكية الفكرية:</strong>
                                        <ul className="list-disc pr-6 mt-1 space-y-1">
                                            <li>
                                                تم تسجيل منهجية التحقق لدينا لدى الهيئة السعودية للملكية
                                                الفكرية (SAIP) تحت رقم الشهادة{" "}
                                                <span dir="ltr">(25-12-40512974)</span>.
                                            </li>
                                            <li>
                                                تجري حاليًا عملية تسجيل براءة اختراع لتقنيتنا الفريدة تحت
                                                الرقم <span dir="ltr">(SA 1020255812)</span>.
                                            </li>
                                        </ul>
                                    </li>
                                    <li>
                                        <strong>الامتثال لحوكمة البيانات:</strong> نلتزم بأنظمة حوكمة
                                        البيانات المعمول بها، ومسجلون رسميًا في منصة حوكمة البيانات
                                        الوطنية التابعة للهيئة السعودية للبيانات والذكاء الاصطناعي
                                        (SDAIA) تحت رقم <span dir="ltr">(3260005643)</span>.
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
                            3) الاستقلالية ومنع التلاعب
                        </h2>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>تعمل منصة &ldquo;مشتري موثّق&rdquo; كجهة مستقلة لتوثيق التقييمات.</li>
                            <li>
                                نحتفظ بسجل موثق ومستقل للتقييمات التي تم التحقق منها، بينما
                                يظل التاجر مسؤولًا عن متجره وإعداداته الخاصة.
                            </li>
                            <li>
                                لا يؤثر إخفاء التقييمات أو حذفها داخل واجهة متجر التاجر على
                                شهادة توثيق التقييمات أو على السجل الموثق داخل منصتنا.
                            </li>
                            <li>تمثل الشهادة مرجعًا مستقلًا وموثقًا للتقييمات المعتمدة.</li>
                            <li>نحن لا نملك صلاحية الدخول إلى لوحة إدارة المتجر ولا نتحكم بها.</li>
                            <li>
                                كل تقييم مرتبط برقم شهادة فريد، مثل:{" "}
                                <span dir="ltr">#TQ-XXXXXX</span>، يتيح التحقق من صحته بشكل
                                مستقل من خلال منصتنا.
                            </li>
                        </ul>
                    </section>

                    {/* 4) Review Verification Badge */}
                    <section aria-labelledby="verification-badge">
                        <h2
                            id="verification-badge"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            4) شارة التوثيق في التقييم
                        </h2>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>
                                تظهر بجانب كل تقييم موثق شارة &ldquo;مشتري موثّق&rdquo; لتمييزه عن باقي
                                التقييمات، وتكون هذه الشارة مرئية للزوار في كل تقييم موثق
                                داخل صفحة المتجر.
                            </li>
                            <li>
                                عند النقر على الشارة، ينتقل الزائر إلى صفحة شهادة توثيق
                                التقييمات الخاصة بالمتجر داخل منصة مشتري موثّق، ولا يتطلب
                                الانتقال أي تسجيل دخول أو أي مصادقة.
                            </li>
                            <li>تستعرض الصفحة فقط الشهادة والتقييم المراد التحقق من صحته.</li>
                            <li>
                                إذا كان التقييم موجودًا في سجل التوثيق داخل منصة مشتري موثّق،
                                فإنه يُعد تقييمًا موثقًا.
                            </li>
                            <li>
                                إذا قاد النقر على الشارة إلى صفحة فارغة، أو لم تستجب، أو لم
                                تعرض سجل التوثيق المرتبط بالتقييم، فيُعد ذلك مؤشرًا على أن
                                المتجر غير مشترك أو أن التقييم غير موثق.
                            </li>
                            <li>
                                تهدف هذه الآلية إلى تمكين العميل من التحقق المباشر من حالة
                                الاشتراك والتوثيق، ومنع التلاعب أو الاستخدام غير الصحيح
                                للشارة أو الشهادة مستقبلًا، وحماية سلامة السجل الموثق.
                            </li>
                        </ul>
                    </section>

                    {/* 5) Review Certification */}
                    <section aria-labelledby="review-certification">
                        <h2
                            id="review-certification"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            5) شهادة توثيق التقييمات
                        </h2>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>
                                شهادة توثيق التقييمات هي علامة بارزة وكبيرة نسبيًا تُعرض أسفل
                                كل منتج في المتجر.
                            </li>
                            <li>تحوي شهادة التوثيق شعار مشتري موثّق.</li>
                            <li>يظهر أسفل الشعار اسم المتجر المشترك.</li>
                            <li>
                                تظهر عبارة: &ldquo;جميع تقييمات هذا المتجر مدققة من مشتري موثّق
                                &lsquo;طرف ثالث&rsquo; لضمان المصداقية&rdquo;.
                            </li>
                            <li>يظهر رقم الشهادة بشكل واضح أسفل الشهادة.</li>
                            <li>
                                عند النقر عليها، ينتقل المستخدم إلى صفحة شهادة توثيق التقييمات
                                الخاصة بالمتجر داخل منصة مشتري موثّق، ولا يتطلب الانتقال أي
                                تسجيل دخول أو أي مصادقة.
                            </li>
                            <li>
                                تعرض صفحة الشهادة بيانات المتجر كاملة، بما في ذلك عدد التقييمات
                                الموثقة ورابط المتجر.
                            </li>
                            <li>
                                ثم تُعرض الشهادة، ثم جميع تقييمات المتجر الموثقة وبيانات التحقق
                                ذات الصلة.
                            </li>
                            <li>
                                لا تُستخدم الشهادة كعنصر تجميلي، بل كسجل توثيق مستقل يمكن
                                الوصول إليه بالنقر على الشارة مباشرة.
                            </li>
                            <li>تكون شهادة توثيق التقييمات مرئية للزوار وقابلة للوصول بشكل مستقل.</li>
                            <li>
                                إذا كانت شهادة توثيق التقييمات تقود إلى صفحة توثيق فعالة
                                ومطابقة داخل منصة مشتري موثّق، وتعرض السجل المرتبط بالمتجر،
                                فإنه يُعد المتجر مشتركًا وموثقًا.
                            </li>
                            <li>
                                إذا كانت شهادة توثيق التقييمات تقود إلى صفحة فارغة، أو لم
                                تستجب، أو لم تعرض سجل التوثيق المرتبط بالمتجر، فيُعد ذلك مؤشرًا
                                على أن المتجر غير مشترك أو غير موثق.
                            </li>
                            <li>
                                تهدف هذه الآلية إلى تمكين العميل من التحقق المباشر من حالة
                                الاشتراك والتوثيق، ومنع التلاعب أو الاستخدام غير الصحيح للشارة
                                أو الشهادة مستقبلًا.
                            </li>
                        </ul>
                    </section>

                    {/* 6) Marketplace Integration */}
                    <section aria-labelledby="marketplace">
                        <h2
                            id="marketplace"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            6) تكامل المنصة
                        </h2>
                        <p>
                            تتكامل منصتنا مع أنظمة التجارة الإلكترونية المدعومة لدعم تدفق
                            البيانات والتحقق من المعاملات، وذلك وفق سياسات حماية البيانات
                            المعتمدة لدى شركائنا.
                        </p>
                    </section>

                    {/* 7) Official Feeds */}
                    <section aria-labelledby="official-feeds">
                        <h2
                            id="official-feeds"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            7) خلاصات التقييمات الرسمية
                        </h2>
                        <p>
                            تتوفر خلاصات التقييمات الرسمية لدينا عبر روابط آمنة (HTTPS)
                            مباشرة، ويتم تحديثها تلقائيًا:
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
                            يتم التحقق من جميع التقييمات عبر بروتوكول Triple Match، ولا
                            تُنشر أي مراجعة إلا بعد اكتمال التحقق من الدفع والشحن
                            والاستلام. ولا يستطيع التجار إضافة التقييمات يدويًا أو تعديلها
                            داخل السجل الموثق لدينا.
                        </p>
                    </section>

                    {/* 8) Deletion / Moderation Policy */}
                    <section aria-labelledby="moderation">
                        <h2
                            id="moderation"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            8) سياسة الحذف والتعديل والإشراف العادل
                        </h2>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>
                                نلتزم بسياسة شفافة وعادلة فيما يخص حذف أو تعديل التقييمات، بما
                                يحافظ على استقلالية التقييمات وسلامة السجل الموثق.
                            </li>
                            <li>
                                العميل هو الطرف الوحيد الذي يملك حق تعديل أو حذف تقييمه من
                                خلال حسابه الأساسي في منصة التجارة الإلكترونية التي تمت عبرها
                                عملية الشراء.
                            </li>
                            <li>
                                التاجر لا يملك أي صلاحية مباشرة لحذف أو تعديل التقييمات داخل
                                سجل مشتري موثّق أو صفحة الشهادة المستقلة.
                            </li>
                            <li>
                                إذا رغب التاجر في الاعتراض على تقييم، فيجوز له تقديم بلاغ رسمي
                                فقط إذا كان التقييم يخالف سياسة المحتوى.
                            </li>
                            <li>
                                تتم مراجعة البلاغ بشكل مستقل وعادل، ويتم اتخاذ قرار نهائي
                                خلال مدة أقصاها 3 إلى 5 أيام عمل.
                            </li>
                            <li>
                                خلال فترة التحقيق، يظل التقييم ظاهرًا في خلاصات البيانات حتى
                                يتم اتخاذ قرار نهائي لضمان الشفافية.
                            </li>
                            <li>
                                إذا ثبتت المخالفة، يتم حذف التقييم نهائيًا وفق سياسة المحتوى
                                المعلنة لدينا.
                            </li>
                            <li>
                                تتم مزامنة أي تعديل أو حذف يقوم به العميل في منصة الشراء
                                الأصلية تلقائيًا لتحديث صفحة الشهادة وخلاصات البيانات الرسمية.
                            </li>
                            <li>
                                إخفاء التقييم داخل واجهة المتجر لا يعني حذفه من السجل الموثق
                                داخل منصة مشتري موثّق.
                            </li>
                            <li>
                                لا تُحذف التقييمات أو تُزال من الخلاصة لمجرد طلب التاجر، أو
                                بناءً على تحكمه في واجهة متجره.
                            </li>
                        </ul>
                    </section>

                    {/* 9) Final Provisions */}
                    <section aria-labelledby="final-provisions">
                        <h2
                            id="final-provisions"
                            className="text-2xl font-bold text-green-800 mb-3"
                        >
                            9) أحكام ختامية
                        </h2>
                        <ul className="list-disc pr-6 mt-3 space-y-2">
                            <li>
                                تحتفظ منصة &ldquo;مشتري موثّق&rdquo; بحق تحديث هذه السياسة عند الحاجة
                                بما يتوافق مع المتطلبات التنظيمية والتشغيلية المعمول بها.
                            </li>
                            <li>
                                تسري هذه السياسة على جميع التقييمات الموثقة عبر المنصة، وعلى
                                جميع صفحات الشهادة والخلاصات والواجهات المرتبطة بها.
                            </li>
                            <li>
                                يُعد استخدام خدماتنا موافقة على الالتزام بهذه السياسة وبأي
                                تحديثات لاحقة تصدر عنها.
                            </li>
                        </ul>
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
