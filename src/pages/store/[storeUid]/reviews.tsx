// src/pages/store/[storeUid]/reviews.tsx
import { useEffect, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Image from "next/image";
import { URLS } from "@/config/constants";

/* ── Types ── */
interface ReviewItem {
    id: string;
    productId: string | null;
    stars: number;
    text: string;
    publishedAt: number;
    trustedBuyer: boolean;
    author: { displayName: string };
    images?: string[];
}

interface StoreProfile {
    store: {
        storeUid: string;
        name: string | null;
        domain: string | null;
        platform: string;
    };
    stats: {
        totalReviews: number;
        avgStars: number;
        distribution: number[]; // [1★, 2★, 3★, 4★, 5★]
    };
    reviews: ReviewItem[];
}

type PageProps = {
    profile: StoreProfile | null;
    error: string | null;
    focusedReviewId: string | null;
};

/* ── Server-side data fetching ── */
export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
    const storeUid = typeof ctx.params?.storeUid === "string" ? ctx.params.storeUid.trim() : "";
    const focusedReviewId = typeof ctx.query.review === "string" ? ctx.query.review.trim() : "";
    const trackingRef = typeof ctx.query.ref === "string" ? ctx.query.ref.trim() : "";

    if (!storeUid) {
        return { props: { profile: null, error: "missing_store", focusedReviewId: focusedReviewId || null } };
    }

    if (trackingRef) {
        const params = new URLSearchParams();
        if (focusedReviewId) params.set("review", focusedReviewId);

        return {
            redirect: {
                destination: `/store/${encodeURIComponent(storeUid)}/reviews${params.size > 0 ? `?${params.toString()}` : ""}`,
                permanent: false,
            },
        };
    }

    try {
        const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || `http://localhost:${process.env.PORT || 3000}`;
        const url = `${base}/api/public/store-profile?storeUid=${encodeURIComponent(storeUid)}`;
        const res = await fetch(url, { headers: { "x-internal": "1" } });

        if (!res.ok) {
            return { props: { profile: null, error: res.status === 404 ? "not_found" : "fetch_error", focusedReviewId: focusedReviewId || null } };
        }

        const profile: StoreProfile = await res.json();

        // Cache for 10 minutes
        ctx.res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=60");

        return { props: { profile, error: null, focusedReviewId: focusedReviewId || null } };
    } catch {
        return { props: { profile: null, error: "fetch_error", focusedReviewId: focusedReviewId || null } };
    }
};

/* ── Components ── */

function Stars({ count, size = 18 }: { count: number; size?: number }) {
    const s = Math.max(0, Math.min(5, Math.round(count)));
    return (
        <span className="inline-flex gap-0.5" aria-label={`${s} من 5 نجوم`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= s ? "#f59e0b" : "#e2e8f0"} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            ))}
        </span>
    );
}

function ReviewCard({ review, highlighted = false, index = 0 }: { review: ReviewItem; highlighted?: boolean; index?: number }) {
    const date = new Date(review.publishedAt);
    const relDate = date.toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const avatarColors = [
        "from-emerald-500 to-teal-600",
        "from-sky-500 to-blue-600",
        "from-amber-500 to-orange-600",
        "from-rose-500 to-pink-600",
        "from-violet-500 to-purple-600",
        "from-cyan-500 to-teal-600",
    ];
    const avatarGrad = avatarColors[index % avatarColors.length];

    return (
        <article
            id={`review-${review.id}`}
            style={{ animationDelay: `${Math.min(index * 70, 500)}ms` }}
            className={`review-card-enter group relative transition-all duration-300 scroll-mt-24 ${
                highlighted
                    ? "bg-emerald-50 border-2 border-emerald-200 shadow-lg shadow-emerald-100/50 rounded-2xl"
                    : "border-b border-gray-100 last:border-b-0"
            }`}
        >
            <div className={highlighted ? "p-6" : "py-6"}>
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3.5">
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md`}>
                            {(review.author.displayName || "ع")[0]}
                        </div>
                        <div>
                            <p className="font-semibold text-[#0e1e1a] text-[15px] leading-tight">
                                {review.author.displayName || "عميل المتجر"}
                            </p>
                            <div className="flex items-center gap-2.5 mt-1">
                                <Stars count={review.stars} size={13} />
                                <span className="text-[12px] text-gray-400">·</span>
                                <time className="text-[12px] text-gray-400">{relDate}</time>
                            </div>
                        </div>
                    </div>

                    {review.trustedBuyer && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-semibold shrink-0">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            موثق
                        </span>
                    )}
                </div>

                {/* Review text */}
                {review.text && (
                    <p className="text-gray-600 text-[14px] leading-[1.95] whitespace-pre-wrap pr-[3.375rem]">{review.text}</p>
                )}

                {/* Images */}
                {review.images && review.images.length > 0 && (
                    <div className="mt-4 flex gap-2.5 flex-wrap pr-[3.375rem]">
                        {review.images.slice(0, 4).map((url) => (
                            <div key={url} className="relative w-[68px] h-[68px] rounded-xl overflow-hidden border border-gray-200 shadow-sm group/img">
                                <Image src={url} alt="" fill sizes="68px" className="object-cover transition-transform duration-500 group-hover/img:scale-110" unoptimized />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </article>
    );
}

/* ── Error Page ── */
function ErrorView({ error }: { error: string }) {
    const msg =
        error === "not_found"
            ? "هذا المتجر غير مسجّل في مشتري موثق"
            : error === "missing_store"
                ? "معرّف المتجر مفقود"
                : "حدث خطأ أثناء تحميل البيانات";

    return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6" dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif" }}>
            <Head>
                <title>مشتري موثق | خطأ</title>
                <meta name="robots" content="noindex, nofollow" />
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap"
                    rel="stylesheet"
                />
            </Head>
            <div className="text-center max-w-md">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-50 border border-red-100 mb-6">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                </div>
                <h1 className="text-xl font-bold text-gray-900 mb-3">{msg}</h1>
                <a
                    href={URLS.CANONICAL_ORIGIN}
                    className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors text-sm font-semibold"
                >
                    الذهاب إلى مشتري موثق
                </a>
            </div>
        </div>
    );
}

/* ── Main Page ── */
export default function StoreReviewsPage({ profile, error, focusedReviewId }: InferGetServerSidePropsType<typeof getServerSideProps>) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!focusedReviewId) return;
        const target = document.getElementById(`review-${focusedReviewId}`);
        if (!target) return;

        const rafId = window.requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        return () => window.cancelAnimationFrame(rafId);
    }, [focusedReviewId]);

    if (!profile || error) {
        return <ErrorView error={error || "fetch_error"} />;
    }

    const { store, stats, reviews } = profile;
    const storeName = store.name || "متجر";
    const focusedReviewExists = !!focusedReviewId && reviews.some((review) => review.id === focusedReviewId);
    const showingFocusedOnly = !!focusedReviewId && focusedReviewExists;
    const visibleReviews = showingFocusedOnly
        ? reviews.filter((review) => review.id === focusedReviewId)
        : focusedReviewId
            ? []
            : reviews;

    const pageTitle = `تقييمات ${storeName} | مشتري موثق`;
    const pageDesc = `اطلع على ${stats.totalReviews} تقييم موثق لمتجر ${storeName}. جميع التقييمات مدققة ومتحقق منها بواسطة مشتري موثق.`;
    const canonicalUrl = `${URLS.CANONICAL_ORIGIN}/store/${encodeURIComponent(store.storeUid)}/reviews`;
    const shouldIndexPage = !focusedReviewId;

    return (
        <div className={`min-h-screen bg-white transition-opacity duration-500 ${mounted ? "opacity-100" : "opacity-0"}`} dir="rtl">
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={canonicalUrl} />
                <meta name="robots" content={shouldIndexPage ? "index, follow" : "noindex, follow"} />
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap"
                    rel="stylesheet"
                />
                <style>{`
                    * { font-family: 'Tajawal', sans-serif; }
                    @keyframes reviewCardEnter {
                        from { opacity: 0; transform: translateY(14px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .review-card-enter {
                        animation: reviewCardEnter 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
                    }
                    @keyframes headerReveal {
                        from { opacity: 0; transform: translateY(-10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .header-reveal {
                        animation: headerReveal 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
                    }
                `}</style>
            </Head>

            {/* ── Subtle top accent ── */}
            <div className="h-1 bg-gradient-to-l from-emerald-400 via-teal-500 to-emerald-600" />

            {/* ── Header ── */}
            <header className="relative header-reveal border-b border-gray-100">
                <div className="max-w-2xl mx-auto px-6 pt-8 pb-7">
                    {/* Theqah branding */}
                    <a
                        href={URLS.CANONICAL_ORIGIN}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2.5 mb-8 group"
                    >
                        <Image
                            src="/widgets/logo.png"
                            alt="مشتري موثق"
                            width={36}
                            height={36}
                            className="group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="text-[15px] font-bold text-emerald-700">
                            مشتري موثق
                        </span>
                    </a>

                    {/* Store name */}
                    <h1 className="text-[1.75rem] sm:text-[2.1rem] font-[900] text-[#0e1e1a] leading-[1.25] tracking-tight mb-3">
                        تقييمات {storeName}
                    </h1>

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2.5 text-sm">
                        {store.domain && (
                            <>
                                <a
                                    href={`https://${store.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-400 hover:text-emerald-600 transition-colors duration-200"
                                >
                                    {store.domain} ↗
                                </a>
                                <span className="text-gray-200">|</span>
                            </>
                        )}
                        <span className="text-gray-500">{stats.totalReviews} تقييم مدقق</span>
                    </div>
                </div>
            </header>

            <main className="relative max-w-2xl mx-auto px-6 pt-2 pb-20">
                {/* Focused review notice (text only, no button) */}
                {focusedReviewId && (
                    <div className="my-5 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-3.5">
                        <p className="text-sm leading-7 text-emerald-800">
                            {focusedReviewExists
                                ? "هذا التقييم مدقق و موثق من طرف مشتري موثق"
                                : "تعذر العثور على التقييم المحدد."}
                        </p>
                    </div>
                )}

                {/* ── Reviews List ── */}
                {visibleReviews.length === 0 ? (
                    <div className="text-center py-24">
                        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-300">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <p className="text-gray-400 text-[15px]">
                            {focusedReviewId ? "لا يمكن عرض التقييم المطلوب حالياً" : "لا توجد تقييمات بعد"}
                        </p>
                    </div>
                ) : (
                    <div>
                        {visibleReviews.map((r, i) => (
                            <ReviewCard key={r.id} review={r} highlighted={focusedReviewId === r.id} index={i} />
                        ))}
                    </div>
                )}

                {/* ── Footer ── */}
                <footer className="mt-16 pt-6 border-t border-gray-100 text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 border border-gray-100">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-500" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <polyline points="9 12 11 14 15 10" />
                        </svg>
                        <p className="text-[12px] text-gray-400 leading-none">
                            تقييمات مدققة بواسطة{" "}
                            <a
                                href={URLS.CANONICAL_ORIGIN}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-600 hover:text-emerald-700 transition-colors font-medium"
                            >
                                مشتري موثق
                            </a>
                        </p>
                    </div>
                </footer>
            </main>
        </div>
    );
}
