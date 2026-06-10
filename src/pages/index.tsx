// src/pages/index.tsx
import { useState, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { InferGetStaticPropsType, GetStaticProps } from 'next';

import NavbarLanding from '@/components/NavbarLanding';
import { URLS } from '@/config/constants';

function YouTubeFacade({ videoId, title }: { videoId: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  const handleClick = useCallback(() => setLoaded(true), []);

  if (loaded) {
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
        className="w-full"
        style={{ height: '580px' }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        title={title}
      />
    );
  }

  return (
    <button
      onClick={handleClick}
      className="relative w-full bg-black cursor-pointer group"
      style={{ height: '580px' }}
      aria-label={`تشغيل فيديو: ${title}`}
    >
      {/* YouTube thumbnail */}
      <img
        src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`}
        alt={title}
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
      />
      {/* Play button overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-lg group-hover:bg-red-700 transition-colors">
          <svg className="w-7 h-7 text-white mr-[-2px]" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </button>
  );
}

const FeedbackWidget = dynamic(() => import('@/components/FeedbackWidget'), {
  ssr: false,
  loading: () => null,
});

interface AppReviewItem {
  storeName: string;
  stars: number;
  text: string;
  /** Store logo (Salla CDN URL) — populated by the daily cron from Salla's marketplace API. */
  avatar?: string | null;
  /** Public URL of the reviewing store — resolved at sync time by matching the
   *  reviewer's merchant name against installed stores in Firestore. */
  storeUrl?: string | null;
  /** Short bold headline shown above the review body (Judge.me-style). Not
   *  stored in Firestore — applied at render time from REVIEW_TITLES below. */
  title?: string | null;
}

/** Human-edited title for each known reviewer. Keyed by a substring of the
 *  storeName so we match flexibly even when Salla returns slight variations
 *  (e.g. "بصريات السقاف saggafoptics"). Update this map directly when you want
 *  to change a headline. */
const REVIEW_TITLES: Array<{ match: string; title: string }> = [
  { match: 'saggafoptics', title: 'يعزز الظهور على جوجل' },
  { match: 'بصريات السقاف', title: 'يعزز الظهور على جوجل' },
  { match: 'ذكرى', title: 'يستحق خمس نجوم' },
  { match: 'StuffRBLX', title: 'تدقيق صارم ورفع المبيعات' },
  { match: 'N5BH', title: 'يبني ثقة مع العملاء' },
  { match: 'نخبه', title: 'يبني ثقة مع العملاء' },
  { match: 'NGLR', title: 'الأفضل على الإطلاق' },
  { match: 'القهوة الشدوية', title: 'دعم فني راقي ومبيعات' },
  { match: 'الهدف التكتيكي', title: 'ثقة ومبيعات وتقييمات موثقة' },
];

function findReviewTitle(storeName: string): string | null {
  const n = storeName?.toLowerCase() || '';
  for (const entry of REVIEW_TITLES) {
    if (n.includes(entry.match.toLowerCase())) return entry.title;
  }
  return null;
}

interface TopReviewItem {
  text: string;
  stars: number;
  authorName: string;
  storeName: string;
  storeUrl: string | null;
  /** Product the customer bought — shown as a small subtitle under the name. */
  productName?: string | null;
}

/** Fallback URL when a review has no matched storeUrl — sends users to the
 *  Salla marketplace page where the original review lives. */
const SALLA_APP_PAGE = 'https://apps.salla.sa/ar/app/1180703836';

// Hardcoded reviews for the 3 older stores that Salla's marketplace API
// doesn't return (it caps `latest_reviews` at the 4 most recent). These are
// merged with the API-sourced reviews in getStaticProps to display all 7.
// Avatars come straight from each store's Salla logo CDN URL.
const FALLBACK_REVIEWS: AppReviewItem[] = [
  {
    stars: 5,
    text: 'من افضل التطبيقات بلا شك ولا يردني فيه ولا شك ماشاء الله تبارك الله انصح فيه',
    storeName: 'STORE NGLR',
    avatar: 'https://cdn.salla.sa/Ovbya/4TN3pa5rrHPClqwpxxD7RXoqHFN5ffIoLqhZoewH.png',
    storeUrl: 'https://nglr7.com',
    title: 'الأفضل على الإطلاق',
  },
  {
    stars: 5,
    text: 'التطبيق ممتاز بعد التثبيت والاشتراك في الخدمة فرق معي في المبيعات وزادت ثقة العملاء والتعامل راقي في الدعم الفني.',
    storeName: 'بيت القهوة الشدوية',
    avatar: 'https://cdn.salla.sa/obngz/UN2uXGARdYCouUlSvmaPCf9XHHny0zpCJqWPYX3y.png',
    storeUrl: 'https://shdacoffee.com',
    title: 'دعم فني راقي ومبيعات',
  },
  {
    stars: 5,
    text: 'التطبيق يساعد العميل علي عملية الثقة بتقيم العملاء ويرفع المبيعات',
    storeName: 'متجر الهدف التكتيكي',
    avatar: 'https://cdn.salla.sa/zYqZg/tBIOHGwv374tlRRkLD8y9LfHIo4ncB5E13kN4A4o.png',
    storeUrl: 'https://tactical-ksa.com',
    title: 'ثقة ومبيعات وتقييمات موثقة',
  },
];

export const getStaticProps: GetStaticProps<{ appReviews: AppReviewItem[]; verifiedReviewsCount: number; topReviews: TopReviewItem[] }> = async () => {
  // Salla's marketplace API caps `latest_reviews` at 4 even though the store has 7.
  // We MERGE the live Salla data with the 3 older reviews kept in FALLBACK_REVIEWS,
  // de-duplicating by storeName so a manual entry can't double-show if it ever
  // appears in `latest_reviews` again.
  //
  // We call the repository directly (not the public API endpoint) to avoid Next.js's
  // server-side fetch cache, which was holding a stale snapshot across dev restarts.
  let sallaReviews: AppReviewItem[] = [];
  let verifiedReviewsCount = 0;
  let topReviews: TopReviewItem[] = [];
  // Names of queries that threw. If any query failed we throw at the end so
  // ISR keeps serving the last good page instead of caching zeroed stats for
  // the next 6 hours (which is what happened during the Firestore outage).
  const queryFailures: string[] = [];

  const { RepositoryFactory } = await import('@/server/repositories');
  const { resolveStoreDisplayName, resolveStoreDomainValue } = await import('@/server/services/admin.service');
  const appReviewRepo = RepositoryFactory.getAppReviewRepository();
  const reviewRepo = RepositoryFactory.getReviewRepository();
  const storeRepo = RepositoryFactory.getStoreRepository();

  // Split into independent try/catches so one broken query doesn't zero out the others.
  try {
    const rows = await appReviewRepo.findAllActive();
    sallaReviews = rows.map((r) => ({
      storeName: r.storeName,
      stars: r.stars,
      text: r.text,
      avatar: r.avatar ?? null,
      storeUrl: r.storeUrl ?? null,
      title: findReviewTitle(r.storeName),
    }));
  } catch (e) {
    console.error('[getStaticProps] appReviewRepo.findAllActive failed:', e);
    queryFailures.push('appReviewRepo.findAllActive');
  }

  try {
    verifiedReviewsCount = await reviewRepo.countAllVerified();
  } catch (e) {
    console.error('[getStaticProps] reviewRepo.countAllVerified failed:', e);
    queryFailures.push('reviewRepo.countAllVerified');
  }

  try {
    // Show the best 10 reviews overall: up to 2 per store (so 5 different
    // stores can each contribute 2 cards). Strict cap prevents any one store
    // from dominating the small slot.
    const topRaw = await reviewRepo.findTopReviews(10, 2);
    const uniqueStoreUids = [...new Set(topRaw.map((r) => r.storeUid))];
    const storeRecords = await Promise.all(uniqueStoreUids.map((uid) => storeRepo.findById(uid)));
    const storeMap = new Map<string, { storeName: string; storeUrl: string | null }>();
    storeRecords.forEach((store, i) => {
      const uid = uniqueStoreUids[i];
      if (!store) return;
      const data = store as unknown as Record<string, unknown>;
      const name = resolveStoreDisplayName(data) || 'متجر';
      const domain = resolveStoreDomainValue(data);
      const url = domain ? (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`) : null;
      storeMap.set(uid, { storeName: name, storeUrl: url });
    });
    topReviews = topRaw.map((r) => {
      const meta = storeMap.get(r.storeUid);
      return {
        text: r.text,
        stars: r.stars,
        authorName: r.author?.displayName?.trim() || 'عميل',
        storeName: meta?.storeName || 'متجر',
        storeUrl: meta?.storeUrl || null,
        productName: r.productName?.trim() || null,
      };
    });
  } catch (e) {
    console.error('[getStaticProps] reviewRepo.findTopReviews failed:', e);
    queryFailures.push('reviewRepo.findTopReviews');
  }

  // Fail the regeneration rather than cache a page with zeroed stats.
  // On ISR revalidation Next.js keeps the previous good HTML when
  // getStaticProps throws; only a first-ever build would hard-fail.
  if (queryFailures.length > 0) {
    throw new Error(
      `[getStaticProps] Firestore queries failed (${queryFailures.join(', ')}) — ` +
      'aborting regeneration so the last good page keeps being served'
    );
  }

  const seenNames = new Set(sallaReviews.map((r) => r.storeName?.trim().toLowerCase()));
  const extras = FALLBACK_REVIEWS.filter((r) => !seenNames.has(r.storeName?.trim().toLowerCase()));
  const appReviews = [...sallaReviews, ...extras];

  return {
    props: { appReviews, verifiedReviewsCount, topReviews },
    revalidate: 21600, // Re-generate every 6 hours
  };
};

export default function LandingPage({ appReviews, verifiedReviewsCount, topReviews }: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <Head>
        <link rel="canonical" href={`${URLS.CANONICAL_ORIGIN}/`} />
        <meta property="og:url" content={`${URLS.CANONICAL_ORIGIN}/`} />
        <meta name="robots" content="index, follow" />
        {/* Master schema bundle: SoftwareApplication + Organization + FAQPage. Hardcoded/trusted, no user input. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'Moshtary Moathaq (مشتري موثق)',
                url: URLS.CANONICAL_ORIGIN,
                operatingSystem: 'Web, Salla, Zid',
                applicationCategory: 'BusinessApplication, eCommerceTrustTool',
                description: 'تطبيق سحابي سعودي لتوثيق تقييمات المتاجر الإلكترونية بنظام Triple Match.',
                offers: {
                  '@type': 'Offer',
                  price: '20',
                  priceCurrency: 'SAR',
                },
                aggregateRating: {
                  '@type': 'AggregateRating',
                  ratingValue: '5',
                  reviewCount: String(appReviews.length),
                },
              },
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'مشتري موثق',
                alternateName: 'Theqah',
                url: URLS.CANONICAL_ORIGIN,
                logo: `${URLS.CANONICAL_ORIGIN}/logo.png`,
                sameAs: [
                  'https://www.tiktok.com/@theqahapp',
                  'https://x.com/theqahapp',
                  'https://www.instagram.com/theqahapp',
                  'https://www.youtube.com/@theqahapp',
                ],
                contactPoint: {
                  '@type': 'ContactPoint',
                  contactType: 'customer support',
                  email: 'Reviews@theqah.com.sa',
                  url: `${URLS.CANONICAL_ORIGIN}/contact`,
                  areaServed: 'SA',
                  availableLanguage: ['Arabic', 'English'],
                },
                hasCredential: [
                  {
                    '@type': 'EducationalOccupationalCredential',
                    name: 'شهادة تسجيل مصنف - الهيئة السعودية للملكية الفكرية',
                    identifier: '25-12-40512974',
                  },
                  {
                    '@type': 'EducationalOccupationalCredential',
                    name: 'شهادة اعتماد حوكمة البيانات الوطنية',
                    identifier: '3260005643',
                  },
                ],
              },
              {
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: [
                  {
                    '@type': 'Question',
                    name: 'ماهو مشتري موثق؟',
                    acceptedAnswer: {
                      '@type': 'Answer',
                      text: 'مشتري موثق منصة سعودية لتوثيق تقييمات المتاجر الإلكترونية بنظام Triple Match، متكاملة مع سلة وزد.',
                    },
                  },
                ],
              },
            ]),
          }}
        />
        {/* HowTo structured data - hardcoded values, no user input */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'HowTo',
              name: 'كيف يعمل مشتري موثق لتوثيق التقييمات؟',
              description: 'خطوات تفعيل منصة مشتري موثق لجمع تقييمات موثقة وزيادة مبيعات متجرك الإلكتروني.',
              totalTime: 'PT5M',
              step: [
                {
                  '@type': 'HowToStep',
                  name: 'فعل التطبيق',
                  text: 'ثبت تطبيق مشتري موثق على متجرك في سلة أو زد بنقرة واحدة.',
                  position: 1,
                },
                {
                  '@type': 'HowToStep',
                  name: 'العميل يقيم كالمعتاد',
                  text: 'يكمل عميلك عملية الشراء ويترك تقييمه بشكل طبيعي.',
                  position: 2,
                },
                {
                  '@type': 'HowToStep',
                  name: 'التوثيق الفوري',
                  text: 'تتحقق المنصة تلقائيًا من صحة التقييم وتوثقه فورًا.',
                  position: 3,
                },
                {
                  '@type': 'HowToStep',
                  name: 'شارة الثقة تظهر',
                  text: 'تظهر شارة التوثيق على المنتج لتعزيز ثقة المشترين وزيادة معدل التحويل.',
                  position: 4,
                },
              ],
            }),
          }}
        />
        {/* BreadcrumbList structured data - hardcoded values, no user input */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                {
                  '@type': 'ListItem',
                  position: 1,
                  name: 'الرئيسية',
                  item: `${URLS.CANONICAL_ORIGIN}/`,
                },
              ],
            }),
          }}
        />
        {/* Auto-discovery hints for feed-aware browsers and AI crawlers.
            JSON Feed listed first because modern consumers (Perplexity,
            ChatGPT browsing) prefer its richer schema; RSS is the
            broad-compat fallback that also unlocks IndexNow submission. */}
        <link
          rel="alternate"
          type="application/feed+json"
          href={`${URLS.CANONICAL_ORIGIN}/feeds/reviews.json`}
          title="تقييمات موثقة — JSON Feed"
        />
        <link
          rel="alternate"
          type="application/rss+xml"
          href={`${URLS.CANONICAL_ORIGIN}/feeds/reviews.rss.xml`}
          title="تقييمات موثقة — RSS"
        />
      </Head>
      <NavbarLanding />
      <div className="h-20" aria-hidden="true" />

      <main className="font-sans text-[#0e1e1a] bg-white" role="main">
        {/* Hero Section */}
        <section className="min-h-[85vh] flex flex-col justify-center items-center text-center px-4 sm:px-6 bg-white relative overflow-hidden">
          <div className="max-w-3xl space-y-6 z-10 animate-slide-up">
            {/* Logo with premium effects */}
            <div className="relative inline-block group animate-float max-w-[80vw]">
              {/* Outer glow ring */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-300/30 via-emerald-400/20 to-green-500/30 rounded-full blur-3xl scale-150 animate-glow-pulse" />

              {/* Inner glow */}
              <div className="absolute inset-0 bg-green-400/30 rounded-full blur-2xl scale-125 animate-glow-pulse" style={{ animationDelay: '0.5s' }} />

              {/* Decorative ring - hidden on very small screens */}
              <div className="absolute -inset-2 sm:-inset-4 border-2 border-green-200/50 rounded-full hidden sm:block" />
              <div className="absolute -inset-4 sm:-inset-8 border border-green-100/30 rounded-full hidden sm:block" />

              {/* Logo - Responsive size */}
              <Image
                src="/logo.png"
                alt="شعار مشتري موثق"
                width={450}
                height={450}
                sizes="(max-width: 640px) 200px, (max-width: 768px) 300px, (max-width: 1024px) 400px, 450px"
                className="mx-auto relative drop-shadow-2xl transition-transform duration-500 group-hover:scale-105 w-[200px] h-[200px] sm:w-[300px] sm:h-[300px] md:w-[400px] md:h-[400px] lg:w-[450px] lg:h-[450px]"
                priority
              />

            </div>

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold leading-tight text-green-900">
              التطبيق الأول لتوثيق التقييمات في سلة
              <br />
              <span className="text-green-700">مشتري موثق</span>
            </h1>

            {/* Subtitle */}
            <p className="text-base sm:text-lg md:text-xl text-gray-700 leading-relaxed max-w-2xl mx-auto">
              اجمع تقييمات موثقة، اعرضها بثقة، وضاعف مبيعاتك — في كل مراحل نمو متجرك.
            </p>

            {/* Rating Widget */}
            <div className="inline-flex items-center gap-3 bg-white rounded-full px-5 py-3 shadow-lg border border-gray-100">
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span key={star} className="text-yellow-400 text-2xl">★</span>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Image src="/logo.png" alt="موثق" width={28} height={28} />
                <span className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </span>
              </div>
            </div>

            {/* AI text */}
            <p className="text-gray-700 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
              حول شك عملائك إلى مبيعات.. وانضم لنخبة المتاجر التي تُهيكل تقييماتها تقنياً لتتصدر ترشيحات الذكاء الاصطناعي.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
              <a
                href="https://apps.salla.sa/ar/app/1180703836"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="group bg-green-700 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-lg font-bold shadow-lg shadow-green-500/20 hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59 7 11l5 5 5-5z" />
                  </svg>
                  حمل التطبيق من متجر سلة
                </button>
              </a>
              {/* Hero CTA: free AI-readiness scanner. Lives on its own
                  indexable route (/scanner) so it can rank for AI-store
                  discovery queries and so the home page stays focused
                  on the install funnel. */}
              <Link href="/scanner">
                <button className="bg-white text-green-700 border-2 border-green-200 px-5 sm:px-8 py-3.5 sm:py-4 rounded-full text-base sm:text-lg font-semibold hover:bg-green-50 hover:border-green-300 transition-all duration-300">
                  افحص قابلية ظهور متجرك للذكاء الاصطناعي
                </button>
              </Link>
            </div>
          </div>
        </section>

        {/* Social-Proof Strip — truthful numbers tied to Salla's public stats */}
        <section className="bg-green-50/60 py-8 sm:py-10 border-y border-green-100" aria-label="إحصائيات الثقة">
          <div className="max-w-5xl mx-auto px-4 sm:px-6">
            <div className="grid grid-cols-3 gap-3 sm:gap-8 text-center">
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl sm:text-3xl">⭐</div>
                <div className="text-xl sm:text-2xl font-extrabold text-green-900">5.0/5</div>
                <div className="text-[11px] sm:text-sm text-gray-600 leading-tight">تقييم التطبيق في سلة</div>
              </div>
              <div className="flex flex-col items-center gap-1 border-x border-green-100">
                <div className="text-2xl sm:text-3xl">🛍️</div>
                <div className="text-xl sm:text-2xl font-extrabold text-green-900">{verifiedReviewsCount.toLocaleString('ar')}</div>
                <div className="text-[11px] sm:text-sm text-gray-600 leading-tight">تقييم موثق تم جمعه</div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="text-2xl sm:text-3xl">✅</div>
                <div className="text-xl sm:text-2xl font-extrabold text-green-900">100%</div>
                <div className="text-[11px] sm:text-sm text-gray-600 leading-tight">نسبة التقييمات الإيجابية</div>
              </div>
            </div>
          </div>
        </section>

        {/* Moving Reviews Bar (Part 2-B: scrolling marquee of store reviews) */}
        <section className="py-16 sm:py-24 bg-white overflow-hidden" aria-label="آراء المتاجر">
          {/* Heading — Judge.me style: large, two-tone, with honest count */}
          <div className="text-center mb-10 sm:mb-14 px-4 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
              <span className="text-green-900">قالوا عن </span>
              <span className="text-green-600">مشتري موثق</span>
            </h2>
          </div>

          {/* dir="ltr" so the marquee-track positions itself at the LEFT edge
              of this wrapper (the parent section is rtl, which would otherwise
              right-align the wider-than-viewport strip and translateX(-50%)
              would push it entirely off-screen left). */}
          <div dir="ltr" className="relative">
            {/* Edge fades so cards don't appear to "pop in" */}
            <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />

            {/* Flex spacing uses margin-inline-end on each card instead of `gap`
                so the strip total width = 14 × (cardWidth + gap). That makes
                translateX(-50%) land seamlessly at the start of the second copy
                — `gap` would leave a half-gap mismatch at the loop point.
                dir="ltr" overrides the document's rtl so the strip lays out
                left-to-right; without this, RTL flex stacks cards to the LEFT
                of the viewport and translateX(-50%) creates empty space on the
                right. Each card re-asserts dir="rtl" so its Arabic text aligns
                correctly. */}
            <div dir="ltr" className="marquee-track flex px-4 sm:px-6" style={{ width: 'max-content' }}>
              {[...appReviews, ...appReviews].map((item, i) => {
                // Every card is clickable: prefer the matched store URL,
                // fall back to the Salla marketplace page so no card is dead.
                const href = item.storeUrl || SALLA_APP_PAGE;
                const isMatched = !!item.storeUrl;
                // For the bottom footer, show the store's hostname in uppercase
                // (Judge.me style). Fall back to a "view on Salla" prompt.
                let footerLabel = 'عرض على متجر سلة ←';
                if (isMatched) {
                  try {
                    footerLabel = new URL(item.storeUrl as string).hostname.replace(/^www\./, '').toUpperCase();
                  } catch {
                    footerLabel = item.storeName.toUpperCase();
                  }
                }

                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`تقييم من ${item.storeName}`}
                    dir="rtl"
                    className="block w-[300px] sm:w-[380px] h-[280px] sm:h-[340px] flex-shrink-0 me-5 sm:me-7 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded-2xl"
                  >
                    <article className="h-full bg-white rounded-2xl border border-gray-100 shadow-sm group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all duration-300 p-6 sm:p-8 flex flex-col">
                      {/* Avatar (Salla CDN) → fallback to bold wordmark when no avatar.
                          Uses native <img> instead of next/image because next/image's
                          IntersectionObserver-based lazy loading misfires inside the
                          translateX marquee animation. */}
                      <div className="mb-4 sm:mb-5 flex items-center gap-3 min-h-[40px] sm:min-h-[48px]">
                        {item.avatar ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.avatar}
                              alt={`شعار ${item.storeName}`}
                              width={48}
                              height={48}
                              loading="lazy"
                              decoding="async"
                              referrerPolicy="no-referrer"
                              className="rounded-full object-cover h-10 w-10 sm:h-12 sm:w-12 shrink-0 ring-1 ring-gray-100 bg-gray-50"
                            />
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 truncate flex-1">
                              {item.storeName}
                            </h3>
                          </>
                        ) : (
                          <h3 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight truncate">
                            {item.storeName}
                          </h3>
                        )}
                      </div>

                      {/* Stars — teal to match Judge.me */}
                      <div className="flex gap-0.5 mb-3 sm:mb-4" aria-label={`${item.stars} من 5 نجوم`}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <span
                            key={s}
                            className={`text-xl sm:text-2xl ${s <= item.stars ? 'text-emerald-500' : 'text-gray-200'}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>

                      {/* Bold headline — Judge.me-style review title */}
                      {item.title && (
                        <h4 className="text-base sm:text-lg font-extrabold text-gray-900 mb-2 leading-snug">
                          {item.title}
                        </h4>
                      )}

                      {/* Review text — grows to fill, line-clamped to keep card height stable.
                          Tighter clamp when a title is present to leave room for it. */}
                      <p className={`text-gray-700 text-[13.5px] sm:text-sm leading-relaxed flex-1 ${item.title ? 'line-clamp-3' : 'line-clamp-4'}`}>
                        {item.text}
                      </p>

                      {/* Footer — hostname (uppercase, wide tracking) or Salla fallback prompt */}
                      <p className={`mt-4 sm:mt-6 text-xs sm:text-sm font-bold tracking-widest uppercase ${isMatched ? 'text-gray-700 group-hover:text-emerald-700' : 'text-emerald-700/80 group-hover:text-emerald-700'} transition-colors`}>
                        {footerLabel}
                      </p>
                    </article>
                  </a>
                );
              })}
            </div>
          </div>

          <style jsx>{`
            @keyframes marquee {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .marquee-track {
              animation: marquee 50s linear infinite;
              will-change: transform;
            }
            .marquee-track:hover {
              animation-play-state: paused;
            }
            @media (prefers-reduced-motion: reduce) {
              .marquee-track {
                animation: none;
              }
            }
          `}</style>
        </section>

        {/* Customer Reviews Marquee — top 20 published, verified, 5-star reviews
            collected through the app, with each card linking to the store that
            collected the review. */}
        {topReviews.length > 0 && (
          <section className="py-10 sm:py-16 bg-green-50/40 overflow-hidden" aria-label="آراء عملاء المتاجر">
            <div className="text-center mb-8 sm:mb-12 px-4 max-w-3xl mx-auto">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
                <span className="text-green-900">قالوا عن </span>
                <span className="text-green-600">عملائنا</span>
              </h2>
              <p className="text-sm sm:text-base text-gray-600 mt-3">
                تقييمات موثقة بنظام Triple Match — من عملاء حقيقيين اشتروا فعلاً
              </p>
            </div>

            <div dir="ltr" className="relative">
              <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-32 bg-gradient-to-l from-green-50/40 to-transparent z-10 pointer-events-none" />
              <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-32 bg-gradient-to-r from-green-50/40 to-transparent z-10 pointer-events-none" />

              <div dir="ltr" className="customer-marquee-track flex px-4 sm:px-6" style={{ width: 'max-content' }}>
                {[...topReviews, ...topReviews].map((item, i) => {
                  const href = item.storeUrl || SALLA_APP_PAGE;
                  const initial = item.authorName?.trim()?.[0] || '?';
                  let domainLabel = 'عرض المتجر ←';
                  if (item.storeUrl) {
                    try {
                      domainLabel = new URL(item.storeUrl).hostname.replace(/^www\./, '').toUpperCase();
                    } catch {
                      domainLabel = item.storeName.toUpperCase();
                    }
                  }
                  return (
                    <a
                      key={i}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`تقييم من ${item.authorName} لمتجر ${item.storeName}`}
                      dir="rtl"
                      className="block w-[280px] sm:w-[340px] h-[260px] sm:h-[300px] flex-shrink-0 me-5 sm:me-6 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 rounded-2xl"
                    >
                      <article className="h-full bg-white rounded-2xl border border-gray-100 shadow-sm group-hover:shadow-lg group-hover:-translate-y-0.5 transition-all duration-300 p-5 sm:p-6 flex flex-col">
                        {/* Customer header — initial avatar + name + product */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 text-white font-bold flex items-center justify-center text-base shadow-sm shrink-0">
                            {initial}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm sm:text-base font-bold text-gray-900 truncate leading-tight">
                              {item.authorName}
                            </h3>
                            {item.productName && (
                              <p className="text-[11px] sm:text-xs text-gray-500 truncate leading-tight mt-0.5">
                                اشترى: {item.productName}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Stars — always 5/5 (enforced by query filter) */}
                        <div className="flex gap-0.5 mb-3" aria-label="5 من 5 نجوم">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span key={s} className="text-lg sm:text-xl text-emerald-500">★</span>
                          ))}
                        </div>

                        {/* Review text */}
                        <p className="text-gray-700 text-[13.5px] sm:text-sm leading-relaxed line-clamp-4 flex-1">
                          {item.text}
                        </p>

                        {/* Footer — store name + domain */}
                        <div className="mt-4 pt-3 border-t border-gray-100">
                          <p className="text-[11px] sm:text-xs text-gray-500 mb-0.5">من متجر</p>
                          <p className="text-xs sm:text-sm font-bold tracking-wider uppercase text-gray-700 group-hover:text-emerald-700 transition-colors truncate">
                            {domainLabel}
                          </p>
                        </div>
                      </article>
                    </a>
                  );
                })}
              </div>
            </div>

            <style jsx>{`
              @keyframes customer-marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-50%); }
              }
              .customer-marquee-track {
                animation: customer-marquee 90s linear infinite;
                will-change: transform;
              }
              .customer-marquee-track:hover {
                animation-play-state: paused;
              }
              @media (prefers-reduced-motion: reduce) {
                .customer-marquee-track {
                  animation: none;
                }
              }
            `}</style>
          </section>
        )}

        {/* Install & Videos Section - moved to top */}
        <section id="install-section" className="py-16 sm:py-24 px-4 sm:px-6 bg-white scroll-mt-24">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <span className="inline-block bg-green-100 text-green-700 text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                ابدأ في أقل من دقيقة
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">
                ثبّت التطبيق في دقيقة، اجمع تقييماتك في الثانية
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                مشتري موثق متاح على متجر سلة بنقرة واحدة — بدون إعدادات معقدة، وبدون خبرة تقنية
              </p>
            </div>

            {/* Videos */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
              {/* Video 1 - What is مشتري موثق */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-green-900 mb-4">ماهو مشتري موثق؟</h3>
                <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-black">
                  <YouTubeFacade videoId="UqvdRG1ogN8" title="ماهو مشتري موثق" />
                </div>
              </div>

              {/* Video 2 - How to connect */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-green-900 mb-4">كيف تربط متجرك؟</h3>
                <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-black">
                  <YouTubeFacade videoId="s6gBXoANREY" title="كيف تربط متجرك مع مشتري موثق" />
                </div>
              </div>

              {/* Video 3 - Real store demo */}
              <div className="text-center">
                <h3 className="text-lg font-bold text-green-900 mb-4">شاهد كيف يعمل على متجر حقيقي</h3>
                <div className="rounded-2xl overflow-hidden shadow-lg border border-gray-100 bg-black">
                  <YouTubeFacade videoId="rFl9wS8s4c0" title="شاهد كيف يعمل مشتري موثق على متجر حقيقي" />
                </div>
                <a
                  href="https://youtube.com/shorts/rFl9wS8s4c0?si=SAqoTt9DifF8GE7H"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-red-600 hover:text-red-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                  شاهد على يوتيوب
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* لماذا مشتري موثق — USP cards (what makes us different) + supporting stats */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12 sm:mb-16">
              <span className="inline-block bg-green-100 text-green-700 text-sm font-bold px-4 py-1.5 rounded-full mb-4">
                لماذا نحن؟
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">
                ما يميّز مشتري موثق عن باقي تطبيقات التقييم
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                ميزات حصرية مبنية للسوق السعودي — لا تجدها في التطبيقات العالمية
              </p>
            </div>

            {/* USP cards — 4 across on desktop, 2×2 on tablet, 1 column on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-7">
              {[
                {
                  emoji: '🛡️',
                  color: 'from-emerald-400 to-teal-600',
                  bgColor: 'bg-emerald-50',
                  title: 'توثيق لا يقبل الشك',
                  desc: 'نظام Triple Match يضمن أن كل تقييم قادم من مشتري حقيقي 100% — لا تقييمات وهمية ولا منافسين خبثاء.',
                  badge: 'حصري',
                },
                {
                  emoji: '🏷️',
                  color: 'from-amber-400 to-orange-500',
                  bgColor: 'bg-amber-50',
                  title: 'شارة "موثق" المرئية',
                  desc: 'تظهر بجانب كل تقييم كدليل بصري فوري يبني ثقة العميل في ثوانٍ — قبل أن يقرأ كلمة واحدة.',
                  badge: 'تحويل أعلى',
                },
                {
                  emoji: '🇸🇦',
                  color: 'from-blue-400 to-indigo-500',
                  bgColor: 'bg-blue-50',
                  title: 'دعم سعودي بشري',
                  desc: 'فريق محلي يفهم سلة وزد ويرد عليك بسرعة باللهجة التي تفهمها — لا روبوتات ولا انتظار طويل.',
                  badge: 'دعم 24/7',
                },
                {
                  emoji: '💰',
                  color: 'from-green-400 to-emerald-500',
                  bgColor: 'bg-green-50',
                  title: 'تسعير عادل وثابت',
                  desc: 'باقة واحدة بسعر ثابت — لا ضرائب على نموك، لا مفاجآت في الفاتورة، ولا تعقيدات.',
                  badge: '20 ر.س/شهر',
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`group relative ${item.bgColor} rounded-2xl p-6 sm:p-7 border border-transparent hover:border-green-200 hover:shadow-xl transition-all duration-500 hover:-translate-y-1`}
                >
                  {/* Emoji with gradient bg */}
                  <div className={`w-14 h-14 bg-gradient-to-br ${item.color} rounded-xl flex items-center justify-center text-2xl mb-5 shadow-md group-hover:scale-110 transition-transform duration-300`}>
                    {item.emoji}
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>

                  {/* Feature badge replaces the old external-study stat */}
                  <div className="mt-5 pt-4 border-t border-gray-200/50">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold bg-gradient-to-l ${item.color} bg-clip-text text-transparent`}>
                      <svg className="w-3 h-3 text-current opacity-70" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                      {item.badge}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Supporting research stats — demoted to a small secondary strip below the USPs */}
            <div className="mt-16 sm:mt-20">
              <div className="text-center mb-6 sm:mb-8">
                <p className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">
                  والأرقام تؤكد ذلك
                </p>
                <h3 className="text-base sm:text-lg text-gray-700 mt-1">
                  تأثير التقييمات الموثقة على المبيعات حسب دراسات عالمية
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
                {[
                  {
                    stat: '+270%',
                    label: 'احتمالية الشراء بعد 5 تقييمات موثقة',
                    source: 'Northwestern Spiegel',
                    sourceUrl: 'https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/',
                  },
                  {
                    stat: '+15%',
                    label: 'زيادة المبيعات مع شارة المشتري الموثق',
                    source: 'AMA',
                    sourceUrl: 'https://www.ama.org/marketing-news/the-power-of-verified-reviews-in-shaping-buying-decisions-and-building-brand-trust/',
                  },
                  {
                    stat: '+380%',
                    label: 'معدل التحويل للمنتجات مرتفعة السعر',
                    source: 'Capital One Shopping',
                    sourceUrl: 'https://capitaloneshopping.com/research/online-reviews-statistics/',
                  },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 sm:p-5 text-center border border-gray-100 hover:border-green-200 transition-colors">
                    <div className="text-2xl sm:text-3xl font-black bg-gradient-to-l from-green-500 to-emerald-600 bg-clip-text text-transparent mb-1">
                      {item.stat}
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 leading-tight mb-2">{item.label}</p>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] italic text-gray-400 hover:text-green-700 hover:underline"
                    >
                      {item.source}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* كيف يعمل */}
        <section className="py-16 sm:py-24 px-4 sm:px-6 bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 sm:mb-14">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-3">
                كيف يعمل مشتري موثق؟
              </h2>
              <p className="text-gray-600">من التثبيت إلى شارة التوثيق — كل ما تحتاجه لتحويل ثقة العملاء إلى مبيعات حقيقية</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
              {[
                {
                  num: '1',
                  emoji: '🔗',
                  title: 'ثبّت التطبيق',
                  desc: 'اربط مشتري موثق بمتجرك في سلة بضغطة زر — لا إعدادات، لا أكواد، لا تعقيد.',
                  color: 'bg-green-500'
                },
                {
                  num: '2',
                  emoji: '⭐',
                  title: 'عميلك يقيّم كالمعتاد',
                  desc: 'يكمل عميلك شراءه ويترك تقييمه عبر روابط سلة الرسمية — بدون أي إزعاج أو خطوات إضافية.',
                  color: 'bg-blue-500'
                },
                {
                  num: '3',
                  emoji: '🔒',
                  title: 'نظام Triple Match يتحقق فوراً',
                  desc: 'نتأكد آلياً من شراء العميل الفعلي واكتمال الطلب لحظة وصول التقييم. لا تقييمات وهمية تمر.',
                  color: 'bg-purple-500'
                },
                {
                  num: '4',
                  emoji: (
                    <div className="relative w-12 h-12">
                      <Image
                        src="/logo.png"
                        alt="شعار مشتري موثق"
                        fill
                        className="object-contain"
                      />
                    </div>
                  ),
                  title: 'تظهر شارة "موثق" تلقائياً',
                  desc: 'بجانب كل تقييم صادق — دليل بصري فوري يعرف منه زوارك أنه تقييم من مشترٍ حقيقي.',
                  color: 'bg-orange-500'
                },
                {
                  num: '5',
                  emoji: (
                    <div className="relative w-12 h-12">
                      <Image
                        src="/logo.png"
                        alt="شهادة توثيق التقييمات"
                        fill
                        className="object-contain"
                      />
                    </div>
                  ),
                  title: 'شهادة توثيق رسمية',
                  desc: 'يعرض الويدجت شهادة توثيق على صفحة منتجك — ترفع المصداقية وتدفع العميل المتردد للشراء.',
                  color: 'bg-teal-500'
                },
              ].map((step, i) => (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-6 sm:p-7 shadow-sm hover:shadow-lg border border-gray-100 hover:border-green-200 transition-all duration-300 relative"
                >
                  {/* Number Badge */}
                  <span className={`absolute -top-3 -right-3 w-8 h-8 ${step.color} text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md`}>
                    {step.num}
                  </span>

                  {/* Emoji */}
                  <div className="text-3xl sm:text-4xl mb-4">{step.emoji}</div>

                  {/* Content */}
                  <h3 className="text-lg sm:text-xl font-bold text-green-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

          </div>
        </section>



        {/* (Removed: legacy testimonials section. The two marquees above —
            "قالوا عن مشتري موثق" and "قالوا عن عملائنا" — now carry the
            social-proof job better than three static cards ever could.) */}

        {/* CTA Section — final push: real number + clear next step */}
        <section className="py-16 sm:py-20 px-4 sm:px-6 bg-gradient-to-br from-green-50 via-emerald-50 to-green-50 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-green-900 mb-4">
              جاهز تنضم لمتاجر بتبيع بثقة؟
            </h2>
            <p className="text-gray-600 mb-8 text-base sm:text-lg">
              {verifiedReviewsCount.toLocaleString('ar')}+ تقييم موثق جمعناه لعملائنا. ثبّت التطبيق الآن، وابدأ تبني ثقة عملائك في دقيقة.
            </p>
            <a
              href="https://apps.salla.sa/ar/app/1180703836"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 bg-green-700 text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full text-base sm:text-lg font-bold shadow-lg shadow-green-500/20 hover:bg-green-800 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18 15v3H6v-3H4v3c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-3h-2zm-1-4-1.41-1.41L13 12.17V4h-2v8.17L8.41 9.59 7 11l5 5 5-5z" />
              </svg>
              ثبّت مشتري موثق من متجر سلة
            </a>
          </div>
        </section>

        {/* Footer */}
        {/* Footer */}
        <footer className="bg-white py-10 pb-28 text-gray-800 border-t border-gray-200">
          <div className="max-w-5xl mx-auto px-4 text-center space-y-6">
            <div className="flex items-center justify-center gap-3">
              <Image src="/logo.png" alt="مشتري موثق" width={45} height={45} loading="lazy" />
              <span className="text-xl font-bold text-green-800">مشتري موثق</span>
            </div>

            <nav className="flex flex-wrap justify-center gap-4 sm:gap-6 text-sm">
              <Link href="/privacy-policy" className="hover:text-green-700 hover:underline transition">سياسة الخصوصية</Link>
              <Link href="/terms" className="hover:text-green-700 hover:underline transition">الشروط والأحكام</Link>
              <Link href="/support" className="hover:text-green-700 hover:underline transition">الدعم والمساعدة</Link>
              <Link href="/faq" className="hover:text-green-700 hover:underline transition">الأسئلة الشائعة</Link>
            </nav>


            <div className="flex justify-center gap-5">
              <a href="https://www.qudwa.org.sa" target="_blank" rel="noopener noreferrer" title="جمعية قدوة" className="opacity-80 hover:opacity-100 transition">
                <Image src="/qudwa-logo.png" alt="جمعية قدوة" width={55} height={55} loading="lazy" />
              </a>
              <a href="https://eauthenticate.saudibusiness.gov.sa/certificate-details/0000203970" target="_blank" rel="noopener noreferrer" title="التحقق الإلكتروني" className="opacity-80 hover:opacity-100 transition">
                <Image src="/eauth-logo.png" alt="التحقق الإلكتروني" width={38} height={38} style={{ width: 'auto', height: 38 }} loading="lazy" />
              </a>
            </div>

            <div className="text-xs text-gray-500 pt-4 border-t border-gray-100">
              <p>© {new Date().getFullYear()} مُشتري موثق. جميع الحقوق محفوظة.</p>
              <a href="https://drive.google.com/file/d/1HTVS6PJeV5p9jOHFWq_8Kc_VC-gpQZVg/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" className="mt-1 block hover:text-green-700 transition-colors">
                النظام مسجل ومحمي قانونيًا لدى الهيئة السعودية للملكية الفكرية
              </a>
              {/* Social Media Icons */}
              <div className="flex justify-center items-center gap-3 mt-4">
                <a href="https://www.tiktok.com/@theqahapp" target="_blank" rel="noopener noreferrer" title="TikTok" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V9.14a8.16 8.16 0 0 0 4.77 1.52V7.21a4.85 4.85 0 0 1-1.01-.52z" /></svg>
                </a>
                <a href="https://x.com/theqahapp" target="_blank" rel="noopener noreferrer" title="X (Twitter)" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
                <a href="https://www.instagram.com/theqahapp" target="_blank" rel="noopener noreferrer" title="Instagram" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" /></svg>
                </a>
                <a href="https://youtube.com/@theqahapp" target="_blank" rel="noopener noreferrer" title="YouTube" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-700 hover:scale-110 transition-all duration-300">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                </a>
              </div>
            </div>
          </div>
        </footer>

      </main>

      <FeedbackWidget />
    </>
  );
}
