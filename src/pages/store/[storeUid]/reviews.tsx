// src/pages/store/[storeUid]/reviews.tsx
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
};

/* ── Server-side data fetching ── */
export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
    const storeUid = typeof ctx.params?.storeUid === "string" ? ctx.params.storeUid.trim() : "";

    if (!storeUid) {
        return { props: { profile: null, error: "missing_store" } };
    }

    try {
        const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() || `http://localhost:${process.env.PORT || 3000}`;
        const url = `${base}/api/public/store-profile?storeUid=${encodeURIComponent(storeUid)}&limit=50`;
        const res = await fetch(url, { headers: { "x-internal": "1" } });

        if (!res.ok) {
            return { props: { profile: null, error: res.status === 404 ? "not_found" : "fetch_error" } };
        }

        const profile: StoreProfile = await res.json();

        // Cache for 10 minutes
        ctx.res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=60");

        return { props: { profile, error: null } };
    } catch {
        return { props: { profile: null, error: "fetch_error" } };
    }
};

/* ── Components ── */

function Stars({ count, size = 18 }: { count: number; size?: number }) {
    const s = Math.max(0, Math.min(5, Math.round(count)));
    return (
        <span className="inline-flex gap-0.5" aria-label={`${s} من 5 نجوم`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= s ? "#facc15" : "#334155"} stroke="none">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
            ))}
        </span>
    );
}

function DistributionBar({ star, count, max }: { star: number; count: number; max: number }) {
    const pct = max > 0 ? (count / max) * 100 : 0;
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="w-8 text-left font-semibold text-yellow-400">{star}★</span>
            <div className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${pct}%`,
                        background: "linear-gradient(90deg, #facc15, #f59e0b)",
                    }}
                />
            </div>
            <span className="w-8 text-right text-slate-400 tabular-nums">{count}</span>
        </div>
    );
}

function ReviewCard({ review }: { review: ReviewItem }) {
    const date = new Date(review.publishedAt);
    const relDate = date.toLocaleDateString("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <article className="group relative bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/[0.07] transition-all duration-300 hover:border-emerald-500/30 hover:shadow-lg hover:shadow-emerald-500/5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/30 to-blue-500/30 flex items-center justify-center text-white/80 text-sm font-bold shrink-0">
                        {(review.author.displayName || "ع")[0]}
                    </div>
                    <div>
                        <p className="font-semibold text-white/90 text-sm leading-tight">
                            {review.author.displayName || "عميل المتجر"}
                        </p>
                        <time className="text-xs text-slate-500 mt-0.5 block">{relDate}</time>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Stars count={review.stars} size={14} />
                    {review.trustedBuyer && (
                        <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                            مشتري موثق
                        </span>
                    )}
                </div>
            </div>

            {/* Text */}
            {review.text && (
                <p className="text-slate-300 text-sm leading-7 whitespace-pre-wrap">{review.text}</p>
            )}

            {/* Images */}
            {review.images && review.images.length > 0 && (
                <div className="mt-4 flex gap-2 flex-wrap">
                    {review.images.slice(0, 4).map((url) => (
                        <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10">
                            <Image src={url} alt="" fill sizes="80px" className="object-cover" unoptimized />
                        </div>
                    ))}
                </div>
            )}
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
        <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#111827] to-[#0a0f1a] flex items-center justify-center p-6" dir="rtl">
            <Head>
                <title>مشتري موثق | خطأ</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>
            <div className="text-center max-w-md">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-3">{msg}</h1>
                <a
                    href="https://theqah.com.sa"
                    className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors text-sm font-medium"
                >
                    الذهاب إلى مشتري موثق
                </a>
            </div>
        </div>
    );
}

/* ── Main Page ── */
export default function StoreReviewsPage({ profile, error }: InferGetServerSidePropsType<typeof getServerSideProps>) {
    if (!profile || error) {
        return <ErrorView error={error || "fetch_error"} />;
    }

    const { store, stats, reviews } = profile;
    const storeName = store.name || "متجر";
    const maxDist = Math.max(...stats.distribution, 1);

    const pageTitle = `تقييمات ${storeName} | مشتري موثق`;
    const pageDesc = `اطلع على ${stats.totalReviews} تقييم موثق لمتجر ${storeName} — متوسط التقييم ${stats.avgStars} من 5 نجوم. جميع التقييمات مدققة من مشتري موثق.`;

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#0a0f1a] via-[#111827] to-[#0a0f1a]" dir="rtl">
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta name="robots" content="index, follow" />
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap"
                    rel="stylesheet"
                />
            </Head>

            {/* ── Header ── */}
            <header className="relative overflow-hidden">
                {/* Glow */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 rounded-full blur-[120px]" />
                </div>

                <div className="relative max-w-4xl mx-auto px-6 pt-10 pb-8">
                    {/* Theqah branding */}
                    <a
                        href="https://theqah.com.sa"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-3 mb-8 group"
                    >
                        <Image
                            src="/widgets/logo.png"
                            alt="مشتري موثق"
                            width={48}
                            height={48}
                            className="drop-shadow-[0_0_12px_rgba(16,185,129,0.4)] group-hover:scale-105 transition-transform"
                        />
                        <span className="text-lg font-bold bg-gradient-to-l from-emerald-400 to-blue-400 bg-clip-text text-transparent">
                            مشتري موثق
                        </span>
                    </a>

                    {/* Store name + badge */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight">
                            تقييمات {storeName}
                        </h1>
                        <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold w-fit">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <polyline points="9 12 11 14 15 10" />
                            </svg>
                            تقييمات مدققة
                        </span>
                    </div>

                    {store.domain && (
                        <a
                            href={`https://${store.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-slate-400 hover:text-emerald-400 transition-colors"
                        >
                            {store.domain} ↗
                        </a>
                    )}
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 pb-16">
                {/* ── Stats Card ── */}
                <div className="bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-2xl p-6 sm:p-8 mb-8">
                    <div className="flex flex-col sm:flex-row gap-8 items-start">
                        {/* Average */}
                        <div className="text-center sm:text-right shrink-0">
                            <div className="text-6xl font-black text-white mb-1 tabular-nums leading-none">
                                {stats.avgStars.toFixed(1)}
                            </div>
                            <Stars count={Math.round(stats.avgStars)} size={20} />
                            <p className="text-sm text-slate-400 mt-2">
                                {stats.totalReviews} تقييم
                            </p>
                        </div>

                        {/* Distribution */}
                        <div className="flex-1 w-full space-y-2">
                            {[5, 4, 3, 2, 1].map((star) => (
                                <DistributionBar
                                    key={star}
                                    star={star}
                                    count={stats.distribution[star - 1] || 0}
                                    max={maxDist}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Reviews List ── */}
                {reviews.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-slate-400 text-lg">لا توجد تقييمات بعد</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {reviews.map((r) => (
                            <ReviewCard key={r.id} review={r} />
                        ))}
                    </div>
                )}

                {/* ── Footer ── */}
                <footer className="mt-16 pt-8 border-t border-white/5 text-center">
                    <p className="text-xs text-slate-500 leading-6">
                        جميع التقييمات مدققة ومتحقق من صحتها بواسطة{" "}
                        <a
                            href="https://theqah.com.sa"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline"
                        >
                            مشتري موثق
                        </a>{" "}
                        — طرف ثالث مستقل لتوثيق التقييمات
                    </p>
                </footer>
            </main>
        </div>
    );
}
