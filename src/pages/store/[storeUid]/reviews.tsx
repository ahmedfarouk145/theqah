// src/pages/store/[storeUid]/reviews.tsx
import { useEffect, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Head from "next/head";
import Image from "next/image";

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

    if (!storeUid) {
        return { props: { profile: null, error: "missing_store", focusedReviewId: focusedReviewId || null } };
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
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= s ? "#facc15" : "#1e293b"} stroke="none">
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

    // Color palette for avatars based on index
    const avatarColors = [
        "from-emerald-400/40 to-teal-600/40",
        "from-sky-400/40 to-indigo-600/40",
        "from-amber-400/40 to-orange-600/40",
        "from-rose-400/40 to-pink-600/40",
        "from-violet-400/40 to-purple-600/40",
    ];
    const avatarGrad = avatarColors[index % avatarColors.length];

    return (
        <article
            id={`review-${review.id}`}
            style={{ animationDelay: `${Math.min(index * 80, 600)}ms` }}
            className={`review-card-enter group relative rounded-2xl transition-all duration-300 scroll-mt-24 ${
                highlighted
                    ? "bg-emerald-500/[0.08] border border-emerald-400/30 shadow-[0_0_40px_-12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-400/10"
                    : "bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] hover:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)]"
            }`}
        >
            <div className="p-6 sm:p-7">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3.5">
                        {/* Avatar */}
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGrad} flex items-center justify-center text-white/90 text-sm font-bold shrink-0 shadow-lg shadow-black/20`}>
                            {(review.author.displayName || "ع")[0]}
                        </div>
                        <div>
                            <p className="font-semibold text-white/90 text-[15px] leading-tight">
                                {review.author.displayName || "عميل المتجر"}
                            </p>
                            <div className="flex items-center gap-2.5 mt-1.5">
                                <Stars count={review.stars} size={13} />
                                <span className="w-px h-3 bg-white/10" />
                                <time className="text-[12px] text-slate-500">{relDate}</time>
                            </div>
                        </div>
                    </div>

                    {review.trustedBuyer && (
                        <span className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/15 font-medium shrink-0">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            موثق
                        </span>
                    )}
                </div>

                {/* Review text */}
                {review.text && (
                    <p className="text-slate-300/90 text-[14px] leading-[1.9] whitespace-pre-wrap pr-[3.625rem]">{review.text}</p>
                )}

                {/* Images */}
                {review.images && review.images.length > 0 && (
                    <div className="mt-5 flex gap-2.5 flex-wrap pr-[3.625rem]">
                        {review.images.slice(0, 4).map((url) => (
                            <div key={url} className="relative w-[72px] h-[72px] rounded-xl overflow-hidden border border-white/[0.08] shadow-lg shadow-black/20 group/img">
                                <Image src={url} alt="" fill sizes="72px" className="object-cover transition-transform duration-500 group-hover/img:scale-110" unoptimized />
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
        <div className="min-h-screen flex items-center justify-center p-6" dir="rtl" style={{ background: "#060b14", fontFamily: "'Tajawal', sans-serif" }}>
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
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/[0.08] border border-red-500/15 mb-6">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                </div>
                <h1 className="text-xl font-bold text-white mb-3">{msg}</h1>
                <a
                    href="https://theqah.com.sa"
                    className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-lg bg-emerald-500/[0.08] text-emerald-400 border border-emerald-500/15 hover:bg-emerald-500/[0.14] transition-colors text-sm font-medium"
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
    const allReviewsHref = `/store/${encodeURIComponent(store.storeUid)}/reviews`;

    const pageTitle = `تقييمات ${storeName} | مشتري موثق`;
    const pageDesc = `اطلع على ${stats.totalReviews} تقييم موثق لمتجر ${storeName} — متوسط التقييم ${stats.avgStars} من 5 نجوم. جميع التقييمات مدققة من مشتري موثق.`;

    return (
        <div className={`min-h-screen transition-opacity duration-700 ${mounted ? "opacity-100" : "opacity-0"}`} dir="rtl" style={{ background: "#060b14" }}>
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta name="robots" content="index, follow" />
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap"
                    rel="stylesheet"
                />
                <style>{`
                    * { font-family: 'Tajawal', sans-serif; }
                    @keyframes reviewCardEnter {
                        from { opacity: 0; transform: translateY(16px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .review-card-enter {
                        animation: reviewCardEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
                    }
                    @keyframes headerReveal {
                        from { opacity: 0; transform: translateY(-12px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .header-reveal {
                        animation: headerReveal 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both;
                    }
                    @keyframes pulseGlow {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 0.7; }
                    }
                `}</style>
            </Head>

            {/* ── Ambient background ── */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
                {/* Top-right emerald glow */}
                <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full blur-[160px]" style={{ background: "radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 70%)" }} />
                {/* Bottom-left blue glow */}
                <div className="absolute -bottom-48 -left-48 w-[600px] h-[600px] rounded-full blur-[180px]" style={{ background: "radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)" }} />
                {/* Subtle noise overlay */}
                <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")" }} />
            </div>

            {/* ── Header ── */}
            <header className="relative header-reveal">
                <div className="max-w-3xl mx-auto px-6 pt-10 pb-6">
                    {/* Theqah branding */}
                    <a
                        href="https://theqah.com.sa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 mb-10 group"
                    >
                        <Image
                            src="/widgets/logo.png"
                            alt="مشتري موثق"
                            width={44}
                            height={44}
                            className="drop-shadow-[0_0_16px_rgba(16,185,129,0.3)] group-hover:scale-105 transition-transform duration-300"
                        />
                        <span className="text-[17px] font-bold bg-gradient-to-l from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                            مشتري موثق
                        </span>
                    </a>

                    {/* Store name */}
                    <h1 className="text-[2rem] sm:text-[2.5rem] font-[900] text-white leading-[1.2] tracking-tight mb-4">
                        تقييمات {storeName}
                    </h1>

                    {/* Meta row: domain + stats */}
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        {store.domain && (
                            <a
                                href={`https://${store.domain}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-400 hover:text-emerald-400 transition-colors duration-200"
                            >
                                {store.domain} ↗
                            </a>
                        )}
                        {store.domain && <span className="w-px h-4 bg-white/10" />}

                        {/* Compact rating + count */}
                        <div className="flex items-center gap-2">
                            <Stars count={Math.round(stats.avgStars)} size={14} />
                            <span className="text-white/80 font-bold tabular-nums">{stats.avgStars.toFixed(1)}</span>
                            <span className="text-slate-500">·</span>
                            <span className="text-slate-400">{stats.totalReviews} تقييم مدقق</span>
                        </div>
                    </div>
                </div>

                {/* Separator line */}
                <div className="max-w-3xl mx-auto px-6">
                    <div className="h-px bg-gradient-to-l from-transparent via-white/[0.08] to-transparent" />
                </div>
            </header>

            <main className="relative max-w-3xl mx-auto px-6 pt-8 pb-20">
                {focusedReviewId && (
                    <div className="mb-6 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.06] px-5 py-4 backdrop-blur-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm leading-7 text-emerald-100/80">
                                {focusedReviewExists
                                    ? "يتم الآن عرض التقييم المحدد فقط. يمكنك استعراض جميع تقييمات المتجر من الزر التالي."
                                    : "تعذر العثور على التقييم المحدد. تم إخفاء بقية التقييمات ويمكنك استعراض جميع تقييمات المتجر من الزر التالي."}
                            </p>
                            <a
                                href={allReviewsHref}
                                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-white/[0.1] hover:border-white/15"
                            >
                                عرض جميع تقييمات المتجر
                            </a>
                        </div>
                    </div>
                )}

                {/* ── Reviews List ── */}
                {visibleReviews.length === 0 ? (
                    <div className="text-center py-24">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <p className="text-slate-400 text-base">
                            {focusedReviewId ? "لا يمكن عرض التقييم المطلوب حالياً" : "لا توجد تقييمات بعد"}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleReviews.map((r, i) => (
                            <ReviewCard key={r.id} review={r} highlighted={focusedReviewId === r.id} index={i} />
                        ))}
                    </div>
                )}

                {/* ── Footer ── */}
                <footer className="mt-20 pt-8 border-t border-white/[0.04] text-center">
                    <div className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.05]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500/60" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            <polyline points="9 12 11 14 15 10" />
                        </svg>
                        <p className="text-[12px] text-slate-500 leading-none">
                            تقييمات مدققة بواسطة{" "}
                            <a
                                href="https://theqah.com.sa"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-emerald-400/70 hover:text-emerald-400 transition-colors"
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
