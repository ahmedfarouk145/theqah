// src/pages/store/[storeUid]/reviews.tsx
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Script from "next/script";
import { URLS } from "@/config/constants";

/* ── Types ── */
export interface ReviewItem {
    id: string;
    productId: string | null;
    stars: number;
    text: string;
    publishedAt: number;
    trustedBuyer: boolean;
    author: { displayName: string };
    images?: string[];
}

export interface StoreProfile {
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

export type StoreReviewsPageProps = {
    profile: StoreProfile | null;
    error: string | null;
    focusedReviewId: string | null;
    /**
     * When present, this page is the certificate route — it will emit the
     * verified-review JSON-LD graph and the trio of verification meta tags.
     * The reviews route leaves this null so it stays a normal listing.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jsonLd?: any | null;
};

/**
 * Shared fetch used by both `/store/[storeUid]/reviews` and
 * `/store/[storeUid]/certificate`. Returns the raw unfiltered profile —
 * route-specific filtering (e.g. stars >= 4 on the certificate route)
 * must be applied by the caller *before* handing data to the component.
 */
export async function fetchStoreReviewsProps(
    ctx: Parameters<GetServerSideProps<StoreReviewsPageProps>>[0],
    opts: { redirectBase: string }
): Promise<ReturnType<GetServerSideProps<StoreReviewsPageProps>>> {
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
                destination: `/store/${encodeURIComponent(storeUid)}${opts.redirectBase}${params.size > 0 ? `?${params.toString()}` : ""}`,
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
        ctx.res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=60");
        return { props: { profile, error: null, focusedReviewId: focusedReviewId || null } };
    } catch {
        return { props: { profile: null, error: "fetch_error", focusedReviewId: focusedReviewId || null } };
    }
}

export const getServerSideProps: GetServerSideProps<StoreReviewsPageProps> = async (ctx) => {
    return fetchStoreReviewsProps(ctx, { redirectBase: "/reviews" });
};

/* ── Helpers ── */

// Safe serializer for JSON embedded inside an HTML <script type="application/ld+json"> tag.
// Buyer-supplied review text could contain "</script>"; escape '<' as a unicode
// sequence so the parser cannot break out of the script element. Also escape U+2028
// and U+2029 which are valid JSON but invalid in JS string literals (legacy precaution).
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
function serializeJsonLd(data: unknown): string {
    return JSON.stringify(data)
        .replace(/</g, "\\u003c")
        .split(LS).join("\\u2028")
        .split(PS).join("\\u2029");
}

// Deterministic certificate code — same djb2-base36 hash used by theqah-widget.js.
export function certCode(uid: string): string {
    if (!uid) return "";
    let hash = 5381;
    for (let i = 0; i < uid.length; i++) {
        hash = ((hash * 33) ^ uid.charCodeAt(i)) >>> 0;
    }
    return "TQ-" + (hash.toString(36).toUpperCase() + "000000").slice(0, 6);
}

function arDate(ts: number): string {
    return new Date(ts).toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
}

function arMonthYear(ts: number): string {
    return new Date(ts).toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

/* ── Star icon ── */
function Stars({ count, className = "" }: { count: number; className?: string }) {
    const s = Math.max(0, Math.min(5, Math.round(count)));
    return (
        <span className={`stars ${className}`} aria-label={`${s} من 5 نجوم`}>
            {[1, 2, 3, 4, 5].map((i) => (
                <svg key={i} viewBox="0 0 24 24" className={i <= s ? undefined : "off"}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
            ))}
        </span>
    );
}

/* ── Review card ── */
function ReviewCard({ review, highlighted = false }: { review: ReviewItem; highlighted?: boolean }) {
    const isLow = review.stars <= 2;
    const showText = review.text && review.text.trim().length > 0;
    return (
        <article
            id={`review-${review.id}`}
            className={`review ${isLow ? "low" : ""} ${highlighted ? "highlighted" : ""}`}
            data-rating={review.stars}
        >
            <div className="review-top">
                <div className="review-who">
                    <div className="avatar">
                        <Image src="/widgets/logo.png" alt="" width={32} height={32} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div className="who-name">{review.author.displayName || "عميل المتجر"}</div>
                        <div className="who-meta">
                            <span>{arDate(review.publishedAt)}</span>
                            {review.trustedBuyer && (
                                <>
                                    <span className="who-meta-sep" />
                                    <span>مشترٍ حقيقي</span>
                                </>
                            )}
                        </div>
                        <Stars count={review.stars} className="review-stars" />
                    </div>
                </div>
            </div>
            {showText ? (
                <p className="review-text">{review.text}</p>
            ) : (
                <p className="review-text"><span className="review-text-empty">— لم يترك المشتري نصاً مكتوباً —</span></p>
            )}
            {review.images && review.images.length > 0 && (
                <div className="review-imgs">
                    {review.images.slice(0, 4).map((url) => (
                        <div key={url} className="review-img">
                            <Image src={url} alt="" fill sizes="64px" unoptimized />
                        </div>
                    ))}
                </div>
            )}
        </article>
    );
}

/* ── Error view ── */
function ErrorView({ error }: { error: string }) {
    const msg =
        error === "not_found"
            ? "هذا المتجر غير مسجّل في مشتري موثق"
            : error === "missing_store"
                ? "معرّف المتجر مفقود"
                : "حدث خطأ أثناء تحميل البيانات";

    return (
        <div className="err-wrap" dir="rtl">
            <Head>
                <title>مشتري موثق | خطأ</title>
                <meta name="robots" content="noindex, nofollow" />
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@500;700;900&display=swap" rel="stylesheet" />
            </Head>
            <style>{`
                .err-wrap{min-height:100vh;background:#04241a;color:#f5ecd6;display:flex;align-items:center;justify-content:center;padding:24px;font-family:'Tajawal',sans-serif}
                .err-card{text-align:center;max-width:420px;padding:48px 32px;background:#f5ecd6;color:#1d1606;border:1px solid #c89b4a;box-shadow:0 4px 12px rgba(0,0,0,.5),0 30px 80px rgba(0,0,0,.6)}
                .err-title{font-size:20px;font-weight:900;margin:18px 0 24px}
                .err-link{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(180deg,#e0bf6b,#c89b4a);color:#1d1606;padding:10px 20px;font-weight:700;font-size:13px;text-decoration:none;border:1px solid #8b6720}
            `}</style>
            <div className="err-card">
                <Image src="/widgets/logo.png" alt="" width={48} height={48} />
                <h1 className="err-title">{msg}</h1>
                <a href={URLS.CANONICAL_ORIGIN} className="err-link">الذهاب إلى مشتري موثق</a>
            </div>
        </div>
    );
}

/* ── Main ── */
export default function StoreReviewsPage({ profile, error, focusedReviewId, jsonLd }: StoreReviewsPageProps) {
    const [mounted, setMounted] = useState(false);
    const [filter, setFilter] = useState<"all" | "5" | "low">("all");

    useEffect(() => { setMounted(true); }, []);

    // Animate distribution bars after mount
    useEffect(() => {
        if (!mounted) return;
        const t = window.setTimeout(() => {
            document.querySelectorAll<HTMLElement>(".dist-bar-fill[data-w]").forEach((el) => {
                el.style.width = (el.dataset.w || "0") + "%";
            });
        }, 300);
        return () => window.clearTimeout(t);
    }, [mounted]);

    // Animate count
    useEffect(() => {
        if (!mounted) return;
        const els = document.querySelectorAll<HTMLElement>("[data-count]");
        const obs = new IntersectionObserver((entries) => {
            entries.forEach((e) => {
                if (!e.isIntersecting) return;
                const el = e.target as HTMLElement;
                const target = parseInt(el.dataset.count || "0", 10);
                const t0 = performance.now();
                const tick = (now: number) => {
                    const p = Math.min((now - t0) / 1400, 1);
                    el.textContent = String(Math.floor(target * (1 - Math.pow(1 - p, 3))));
                    if (p < 1) requestAnimationFrame(tick);
                    else el.textContent = String(target);
                };
                requestAnimationFrame(tick);
                obs.unobserve(el);
            });
        }, { threshold: 0.3 });
        els.forEach((el) => obs.observe(el));
        return () => obs.disconnect();
    }, [mounted]);

    // Render QR using qrcode-generator (loaded via <Script />)
    useEffect(() => {
        if (!mounted) return;
        if (!profile) return;
        const tryRender = () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as unknown as { qrcode?: any };
            if (typeof w.qrcode !== "function") return false;
            const host = document.getElementById("cert-qr");
            if (!host) return false;
            const certUrl = `${URLS.CANONICAL_ORIGIN}/store/${encodeURIComponent(profile.store.storeUid)}/certificate`;
            const qr = w.qrcode(0, "M");
            qr.addData(certUrl);
            qr.make();
            const img = document.createElement("img");
            img.src = qr.createDataURL(4, 0);
            img.alt = "QR";
            img.width = 72;
            img.height = 72;
            img.style.imageRendering = "pixelated";
            host.replaceChildren(img);
            return true;
        };
        if (tryRender()) return;
        const interval = window.setInterval(() => {
            if (tryRender()) window.clearInterval(interval);
        }, 200);
        return () => window.clearInterval(interval);
    }, [mounted, profile]);

    // Focused review scroll
    useEffect(() => {
        if (!focusedReviewId) return;
        const target = document.getElementById(`review-${focusedReviewId}`);
        if (!target) return;
        const id = window.requestAnimationFrame(() => {
            target.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return () => window.cancelAnimationFrame(id);
    }, [focusedReviewId]);

    const lastUpdate = useMemo(() => {
        if (!profile || profile.reviews.length === 0) return null;
        return Math.max(...profile.reviews.map((r) => r.publishedAt));
    }, [profile]);

    const memberSince = useMemo(() => {
        if (!profile || profile.reviews.length === 0) return null;
        return Math.min(...profile.reviews.map((r) => r.publishedAt));
    }, [profile]);

    if (!profile || error) {
        return <ErrorView error={error || "fetch_error"} />;
    }

    const { store, stats, reviews } = profile;
    const storeName = store.name || "متجر";
    const code = certCode(store.storeUid);

    const focusedReview = focusedReviewId ? reviews.find((r) => r.id === focusedReviewId) : undefined;
    const showingFocusedOnly = !!focusedReview;

    const filteredReviews = showingFocusedOnly
        ? [focusedReview!]
        : focusedReviewId
            ? []
            : reviews.filter((r) => {
                if (filter === "all") return true;
                if (filter === "5") return r.stars === 5;
                if (filter === "low") return r.stars <= 2;
                return true;
            });

    const counts = {
        all: reviews.length,
        five: reviews.filter((r) => r.stars === 5).length,
        low: reviews.filter((r) => r.stars <= 2).length,
    };

    const dist = stats.distribution; // [1★..5★]
    const total = Math.max(1, stats.totalReviews);
    const pct = (n: number) => Math.round((n / total) * 100);

    // Stores where the distribution chart is intentionally suppressed.
    // Match by domain substring or exact storeUid.
    const HIDE_DIST_DOMAINS = ["nglr7.com"];
    const HIDE_DIST_STORE_UIDS: string[] = [];
    const showDist =
        !HIDE_DIST_STORE_UIDS.includes(store.storeUid) &&
        !HIDE_DIST_DOMAINS.some((d) => (store.domain || "").toLowerCase().includes(d));

    const pageTitle = `شهادة توثيق التقييمات — ${storeName} | مشتري موثق`;
    const pageDesc = `سجل رسمي لـ ${stats.totalReviews} تقييم موثق عن متجر ${storeName}، مدققة وفق نظام Triple Matching من مشتري موثق.`;
    // Canonical must point to the route the user is actually on. The certificate
    // route (where `jsonLd` is injected) is a distinct, indexable URL — not a
    // duplicate of /reviews. Pointing both routes at /reviews caused
    // "Duplicate without user-selected canonical" in Search Console.
    const routeSegment = jsonLd ? "certificate" : "reviews";
    const canonicalUrl = `${URLS.CANONICAL_ORIGIN}/store/${encodeURIComponent(store.storeUid)}/${routeSegment}`;
    const shouldIndex = !focusedReviewId;

    return (
        <div className={`v3-root ${mounted ? "is-mounted" : ""}`} dir="rtl">
            <Head>
                <title>{pageTitle}</title>
                <meta name="description" content={pageDesc} />
                <link rel="canonical" href={canonicalUrl} />
                <meta property="og:title" content={pageTitle} />
                <meta property="og:description" content={pageDesc} />
                <meta property="og:type" content="website" />
                <meta property="og:url" content={canonicalUrl} />
                <meta name="robots" content={shouldIndex ? "index, follow" : "noindex, follow"} />
                {jsonLd && (
                    <>
                        {/* AI/crawler hints — explicitly tag this page as an
                            independently-verified review certificate so LLMs
                            (ChatGPT, Perplexity, Gemini) don't dismiss the
                            ratings as merchant-supplied testimonials. */}
                        <meta name="content-type" content="verified-review-certificate" />
                        <meta name="verification-method" content="Triple Match: Payment+Shipping+Delivery via Salla API" />
                        <meta name="verified-by" content="Mushtari Mowathaq — theqah.com.sa" />
                        <script
                            type="application/ld+json"
                            dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
                        />
                    </>
                )}
                {/* eslint-disable-next-line @next/next/no-page-custom-font */}
                <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@500;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap" rel="stylesheet" />
                <style>{V3_CSS}</style>
            </Head>

            <Script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js" strategy="afterInteractive" />

            <nav className="nav">
                <div className="nav-inner">
                    <a href={URLS.CANONICAL_ORIGIN} className="nav-logo" target="_blank" rel="noopener noreferrer">
                        <Image src="/widgets/logo.png" alt="" width={36} height={36} />
                        <span className="nav-logo-text">مشتري موثق</span>
                    </a>
                    <div className="nav-actions">
                        <button
                            className="nav-btn"
                            onClick={() => {
                                if (typeof navigator !== "undefined" && navigator.clipboard) {
                                    navigator.clipboard.writeText(window.location.href);
                                }
                                showToast("تم نسخ الرابط");
                            }}
                        >
                            نسخ الرابط
                        </button>
                        <button className="nav-btn" onClick={() => window.print()}>طباعة</button>
                    </div>
                </div>
            </nav>

            <main className="stage">
                {focusedReviewId && (
                    <div className="focus-notice">
                        <p>{focusedReview ? "هذا التقييم مدقق وموثق من طرف مشتري موثق" : "تعذر العثور على التقييم المحدد."}</p>
                    </div>
                )}

                <div className="cert">
                    <span className="corner tl" /><span className="corner tr" />
                    <span className="corner bl" /><span className="corner br" />

                    <div className="cert-inner">
                        <div className="crest">
                            <div className="crest-arabesque">Verified · موثق</div>

                            <div className="seal-royal">
                                <svg className="seal-text" viewBox="0 0 140 140">
                                    <defs>
                                        <path id="sc" d="M70,70 m-58,0 a58,58 0 1,1 116,0 a58,58 0 1,1 -116,0" />
                                    </defs>
                                    <text>
                                        <textPath href="#sc" startOffset="0">★ مشتري موثق · MUSHTARI MOWATHAQ · شهادة معتمدة · </textPath>
                                    </text>
                                </svg>
                                <div className="seal-medal">
                                    <Image src="/widgets/logo.png" alt="" width={54} height={54} />
                                </div>
                            </div>

                            <h1 className="royal-title">شهادة توثيق التقييمات</h1>
                            <div className="royal-title-en">Verified Buyer Certificate</div>

                            <div className="ornament" />

                            <p className="preamble">
                                جميع التقييمات المدرجة صادرة وفق نظام <strong>Triple Matching</strong> <span className="tm">(دفع + شحن + استلام)</span> لمشتري موثق — لضمان تجربة حقيقية ١٠٠٪ بعيداً عن التزييف.
                            </p>
                        </div>

                        <div className="honoree">
                            <div className="honoree-pre">— صادرة باسم —</div>
                            <div className="honoree-name">{storeName}</div>
                            {store.domain && (
                                <a
                                    href={store.domain.startsWith("http") ? store.domain : `https://${store.domain}`}
                                    className="honoree-url"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {store.domain}
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M7 17L17 7" /><path d="M7 7h10v10" />
                                    </svg>
                                </a>
                            )}
                        </div>

                        <div className={`panel ${stats.avgStars >= 4 ? "panel-3" : "panel-2"}`}>
                            {stats.avgStars >= 4 && (
                                <div className="panel-cell">
                                    <div className="panel-l">المتوسط</div>
                                    <div className="panel-v">
                                        {stats.avgStars.toFixed(1)}<small>/5</small>
                                    </div>
                                    <Stars count={stats.avgStars} className="panel-stars-wrap" />
                                </div>
                            )}
                            <div className="panel-cell">
                                <div className="panel-l">تقييم موثق</div>
                                <div className="panel-v" data-count={stats.totalReviews}>0</div>
                                <div className="panel-l" style={{ marginTop: 8, fontSize: 11 }}>إجمالي السجل</div>
                            </div>
                            <div className="panel-cell">
                                <div className="panel-l">عضو منذ</div>
                                <div className="panel-v" style={{ fontSize: 26 }}>
                                    {memberSince ? arMonthYear(memberSince) : "—"}
                                </div>
                            </div>
                        </div>

                        {showDist && (
                            <div className="dist">
                                <div className="dist-h">— توزيع التقييمات —</div>
                                {[5, 4, 3, 2, 1].map((n) => {
                                    const count = dist[n - 1] || 0;
                                    const w = pct(count);
                                    return (
                                        <div className="dist-row" key={n}>
                                            <div className="dist-num">
                                                {n}
                                                <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                                            </div>
                                            <div className="dist-bar">
                                                <div className={`dist-bar-fill ${n <= 2 ? "low" : ""}`} data-w={String(w)} />
                                            </div>
                                            <div className="dist-c">{count}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="registry">
                            <div>
                                <div className="reg-l">رقم الشهادة · CERTIFICATE №</div>
                                <div className="reg-v ltr">{code}</div>
                            </div>
                            <div>
                                <div className="reg-l">آخر تحديث · LAST UPDATE</div>
                                <div className="reg-v">{lastUpdate ? arDate(lastUpdate) : "—"}</div>
                            </div>
                            <div className="qr" id="cert-qr" />
                        </div>

                        <div className="sig">
                            <div>
                                <div className="sig-line">&nbsp;</div>
                                <div className="sig-name">— مشتري موثق · بروتوكول الثقة</div>
                            </div>
                            <div className="sig-stamp">موثق<br />ومعتمد</div>
                            <div>
                                <div className="sig-line">&nbsp;</div>
                                <div className="sig-name">— التاريخ {lastUpdate ? arDate(lastUpdate) : ""}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="actions">
                    <button
                        className="btn btn-gold"
                        onClick={() => {
                            const url = `${URLS.CANONICAL_ORIGIN}/store/${encodeURIComponent(store.storeUid)}/certificate`;
                            if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(url);
                            showToast("تم نسخ رابط الشهادة");
                        }}
                    >
                        مشاركة الشهادة
                    </button>
                    <button className="btn btn-outline" onClick={() => window.print()}>تحميل PDF</button>
                </div>

                <section className="reviews">
                    <div className="reviews-h">
                        <div className="reviews-t">المراجعات الموثقة</div>
                        <div className="reviews-c">{stats.totalReviews} تقييم</div>
                    </div>

                    {!showingFocusedOnly && (
                        <div className="filters">
                            <button className={`fbtn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>الكل · {counts.all}</button>
                            <button className={`fbtn ${filter === "5" ? "active" : ""}`} onClick={() => setFilter("5")}>5★ · {counts.five}</button>
                            <button className={`fbtn ${filter === "low" ? "active" : ""}`} onClick={() => setFilter("low")}>منخفضة · {counts.low}</button>
                        </div>
                    )}

                    {filteredReviews.length === 0 ? (
                        <div className="empty">
                            <p>{focusedReviewId ? "لا يمكن عرض التقييم المطلوب حالياً" : "لا توجد تقييمات بعد"}</p>
                        </div>
                    ) : (
                        <div className="review-list">
                            {filteredReviews.map((r) => (
                                <ReviewCard key={r.id} review={r} highlighted={focusedReviewId === r.id} />
                            ))}
                        </div>
                    )}
                </section>

                <div className="stage-foot">
                    تقييمات مُدققة بواسطة <a href={URLS.CANONICAL_ORIGIN} target="_blank" rel="noopener noreferrer">مشتري موثق</a>
                </div>
            </main>

            <div className="toast" id="v3-toast"><span id="v3-toast-msg" /></div>
        </div>
    );
}

function showToast(msg: string) {
    const el = document.getElementById("v3-toast");
    const m = document.getElementById("v3-toast-msg");
    if (!el || !m) return;
    m.textContent = msg;
    el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 2200);
}

/* ── CSS — ported verbatim from public/certificate-v3.html ── */
const V3_CSS = `
.v3-root{
  --bg-deep:#04241a;--bg-2:#0a3a29;--bg-3:#102e22;
  --parchment:#f5ecd6;--parchment-2:#fbf6e6;--parchment-3:#ece1c4;
  --ink:#1d1606;--ink-2:#3a2f15;--muted:#6f5e36;
  --gold:#c89b4a;--gold-2:#e0bf6b;--gold-deep:#8b6720;
  --green:#0a6b49;--green-2:#13a371;
  --rule:#d8c997;--rule-2:#b69a52;
  --star:#c89b4a;--danger:#a8412a;
  font-family:'IBM Plex Sans Arabic',sans-serif;
  color:var(--ink);direction:rtl;-webkit-font-smoothing:antialiased;min-height:100vh;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(200,155,74,.18), transparent 50%),
    radial-gradient(ellipse at 80% 100%, rgba(19,163,113,.12), transparent 50%),
    linear-gradient(180deg,#04241a 0%,#0a3a29 100%);
  background-attachment:fixed;
  opacity:0;transition:opacity .4s ease;
}
.v3-root.is-mounted{opacity:1}
.v3-root *{margin:0;padding:0;box-sizing:border-box}
.v3-root::before{
  content:'';position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.18;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23c89b4a' stroke-width='.6'%3E%3Cpath d='M30 6l6 12 12 6-12 6-6 12-6-12-12-6 12-6z'/%3E%3Ccircle cx='30' cy='30' r='10'/%3E%3C/g%3E%3C/svg%3E");
  background-size:60px 60px;
}
.v3-root main,.v3-root nav{position:relative;z-index:1}

.v3-root .nav{
  border-bottom:1px solid rgba(200,155,74,.25);
  background:linear-gradient(180deg,rgba(4,36,26,.92),rgba(4,36,26,.78));
  backdrop-filter:blur(12px);position:sticky;top:0;z-index:50;
}
.v3-root .nav-inner{max-width:1100px;margin:0 auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.v3-root .nav-logo{display:flex;align-items:center;gap:12px;text-decoration:none;color:var(--parchment)}
.v3-root .nav-logo img{width:36px;height:36px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))}
.v3-root .nav-logo-text{font-family:'Tajawal',sans-serif;font-weight:700;font-size:16px;color:var(--gold-2);letter-spacing:.3px}
.v3-root .nav-actions{display:flex;gap:8px}
.v3-root .nav-btn{
  padding:8px 16px;font-size:12px;font-weight:600;color:var(--gold-2);
  background:rgba(200,155,74,.08);border:1px solid rgba(200,155,74,.3);border-radius:0;cursor:pointer;
  font-family:inherit;letter-spacing:.5px;transition:all .2s;
}
.v3-root .nav-btn:hover{background:rgba(200,155,74,.18);border-color:var(--gold)}

.v3-root .stage{max-width:920px;margin:0 auto;padding:48px 24px 64px}

.v3-root .focus-notice{
  margin-bottom:24px;padding:14px 20px;
  background:rgba(200,155,74,.1);border:1px solid var(--gold);color:var(--gold-2);
  font-family:'Tajawal',sans-serif;font-size:14px;font-weight:600;text-align:center;
}

.v3-root .cert{
  position:relative;background:var(--parchment);
  background-image:
    radial-gradient(ellipse at 30% 20%, rgba(200,155,74,.12), transparent 40%),
    radial-gradient(ellipse at 70% 90%, rgba(139,103,32,.08), transparent 50%);
  padding:64px 56px;
  box-shadow:0 0 0 1px var(--gold-deep),0 4px 12px rgba(0,0,0,.5),0 30px 80px rgba(0,0,0,.6);
  animation:fadeUp .7s ease both;
}
.v3-root .cert::before{content:'';position:absolute;inset:18px;border:1px solid var(--gold);pointer-events:none}
.v3-root .cert::after{content:'';position:absolute;inset:24px;border:1px solid rgba(200,155,74,.4);pointer-events:none}
.v3-root .corner{
  position:absolute;width:48px;height:48px;pointer-events:none;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none' stroke='%23c89b4a' stroke-width='1.4'%3E%3Cpath d='M4 24v-8a8 8 0 0 1 8-8h8'/%3E%3Cpath d='M10 24v-6a4 4 0 0 1 4-4h6'/%3E%3Cpath d='M24 4l4 4-4 4-4-4z'/%3E%3C/svg%3E") center/contain no-repeat;
  z-index:2;
}
.v3-root .corner.tl{top:14px;right:14px;transform:scaleX(-1)}
.v3-root .corner.tr{top:14px;left:14px}
.v3-root .corner.bl{bottom:14px;right:14px;transform:rotate(180deg) scaleX(-1)}
.v3-root .corner.br{bottom:14px;left:14px;transform:rotate(180deg)}

.v3-root .cert-inner{position:relative;z-index:1}

.v3-root .crest{display:flex;flex-direction:column;align-items:center;text-align:center;margin-bottom:30px}
.v3-root .crest-arabesque{
  display:flex;align-items:center;gap:12px;color:var(--gold-deep);
  font-family:'Amiri',serif;font-size:14px;letter-spacing:6px;text-transform:uppercase;font-weight:700;
}
.v3-root .crest-arabesque::before,.v3-root .crest-arabesque::after{
  content:'';width:80px;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent);
}

.v3-root .seal-royal{width:140px;height:140px;margin:24px 0 18px;position:relative;display:flex;align-items:center;justify-content:center}
.v3-root .seal-royal::before{
  content:'';position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 30% 25%,var(--gold-2),var(--gold) 60%,var(--gold-deep) 100%);
  box-shadow:inset 0 4px 12px rgba(255,235,180,.5),inset 0 -6px 14px rgba(80,55,15,.5),0 6px 20px rgba(80,55,15,.4);
}
.v3-root .seal-royal::after{content:'';position:absolute;inset:8px;border-radius:50%;border:1.5px dashed rgba(80,55,15,.45)}
.v3-root .seal-text{position:absolute;inset:0;animation:rotate 32s linear infinite;z-index:1}
@keyframes rotate{to{transform:rotate(360deg)}}
.v3-root .seal-text text{font-family:'Amiri',serif;font-size:9px;font-weight:700;fill:rgba(60,40,10,.85);letter-spacing:2px}
.v3-root .seal-medal{
  position:relative;z-index:2;width:78px;height:78px;border-radius:50%;
  background:radial-gradient(circle at 30% 25%,var(--parchment-2),var(--parchment-3));
  display:flex;align-items:center;justify-content:center;
  box-shadow:inset 0 2px 4px rgba(80,55,15,.2),0 1px 2px rgba(0,0,0,.15);
}

.v3-root .royal-title{font-family:'Amiri',serif;font-size:48px;font-weight:700;line-height:1.05;color:var(--ink);text-align:center;letter-spacing:-.5px}
.v3-root .royal-title-en{margin-top:10px;font-family:'Tajawal',sans-serif;font-weight:500;font-size:13px;letter-spacing:6px;text-transform:uppercase;color:var(--gold-deep);text-align:center}

.v3-root .ornament{margin:24px auto;width:240px;height:18px;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 18' fill='none' stroke='%23c89b4a' stroke-width='1'%3E%3Cline x1='0' y1='9' x2='100' y2='9'/%3E%3Cline x1='140' y1='9' x2='240' y2='9'/%3E%3Cpath d='M120 3l4 6-4 6-4-6z' fill='%23c89b4a'/%3E%3Ccircle cx='106' cy='9' r='1.5' fill='%23c89b4a'/%3E%3Ccircle cx='134' cy='9' r='1.5' fill='%23c89b4a'/%3E%3C/svg%3E") center/contain no-repeat}

.v3-root .preamble{text-align:center;font-family:'Amiri',serif;font-size:16px;line-height:1.95;color:var(--ink-2);max-width:580px;margin:0 auto}
.v3-root .preamble strong{font-family:'Tajawal',sans-serif;font-weight:900;color:var(--green);direction:ltr;display:inline-block;letter-spacing:.5px}
.v3-root .preamble .tm{font-family:'Tajawal',sans-serif;font-weight:600;color:var(--gold-deep);font-size:14px;display:inline-block;direction:rtl}

.v3-root .honoree{
  margin-top:40px;text-align:center;padding:28px 24px;
  background:linear-gradient(180deg,transparent,rgba(200,155,74,.07));
  border-top:1px double var(--rule-2);border-bottom:1px double var(--rule-2);
}
.v3-root .honoree-pre{font-family:'Amiri',serif;font-style:italic;font-size:14px;color:var(--muted);letter-spacing:1px}
.v3-root .honoree-name{margin-top:10px;font-family:'Tajawal',sans-serif;font-weight:900;font-size:54px;color:var(--ink);letter-spacing:-1.5px;line-height:1.1}
.v3-root .honoree-url{margin-top:8px;display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--gold-deep);text-decoration:none;direction:ltr;border-bottom:1px solid var(--rule-2);padding-bottom:1px;font-weight:600;letter-spacing:.5px}
.v3-root .honoree-url:hover{color:var(--ink)}
.v3-root .honoree-url svg{width:11px;height:11px}

.v3-root .panel{margin-top:36px;display:grid;gap:0;border:1px solid var(--rule-2);background:rgba(255,250,230,.5)}
.v3-root .panel-3{grid-template-columns:1fr 1fr 1fr}
.v3-root .panel-2{grid-template-columns:1fr 1fr}
.v3-root .panel-cell{padding:24px 18px;text-align:center;border-left:1px solid var(--rule);position:relative}
.v3-root .panel-cell:last-child{border-left:0}
.v3-root .panel-cell::before{content:'';position:absolute;top:8px;left:50%;transform:translateX(-50%);width:24px;height:1px;background:var(--gold)}
.v3-root .panel-l{font-family:'Amiri',serif;font-style:italic;font-size:13px;color:var(--muted);letter-spacing:.5px;margin-bottom:8px}
.v3-root .panel-v{font-family:'Tajawal',sans-serif;font-weight:900;font-size:42px;color:var(--ink);line-height:1;letter-spacing:-1px}
.v3-root .panel-v small{font-size:18px;color:var(--gold-deep);font-weight:700;margin-right:4px}
.v3-root .panel-stars-wrap{display:inline-flex;gap:2px;margin-top:8px}

.v3-root .stars{display:inline-flex;gap:1px}
.v3-root .stars svg{width:14px;height:14px;fill:var(--gold)}
.v3-root .stars svg.off{fill:var(--rule)}
.v3-root .panel-stars-wrap.stars svg{width:14px;height:14px;fill:var(--gold)}

.v3-root .dist{margin-top:32px}
.v3-root .dist-h{text-align:center;font-family:'Amiri',serif;font-style:italic;font-size:15px;color:var(--gold-deep);letter-spacing:1px;margin-bottom:14px}
.v3-root .dist-row{display:grid;grid-template-columns:36px 1fr 36px;gap:14px;align-items:center;padding:6px 0}
.v3-root .dist-num{font-family:'Tajawal',sans-serif;font-weight:700;font-size:14px;color:var(--ink-2);text-align:center;display:flex;align-items:center;gap:3px;justify-content:center}
.v3-root .dist-num svg{width:11px;height:11px;fill:var(--gold)}
.v3-root .dist-bar{height:7px;background:var(--parchment-3);border:1px solid var(--rule);position:relative;overflow:hidden}
.v3-root .dist-bar-fill{position:absolute;top:0;right:0;height:100%;width:0;transition:width 1.4s cubic-bezier(.4,0,.2,1);background:linear-gradient(90deg,var(--gold-2),var(--gold) 60%,var(--gold-deep))}
.v3-root .dist-bar-fill.low{background:linear-gradient(90deg,#c87a5c,var(--danger))}
.v3-root .dist-c{font-family:'Tajawal',sans-serif;font-weight:700;font-size:13px;color:var(--muted);text-align:left;direction:ltr}

.v3-root .registry{margin-top:36px;padding:20px 24px;background:var(--parchment-2);border:1px solid var(--rule-2);display:grid;grid-template-columns:1fr 1fr auto;gap:24px;align-items:center}
.v3-root .reg-l{font-family:'Amiri',serif;font-style:italic;font-size:11px;color:var(--muted);letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}
.v3-root .reg-v{font-family:'Tajawal',sans-serif;font-weight:700;font-size:15px;color:var(--ink)}
.v3-root .reg-v.ltr{font-family:'Courier New',monospace;direction:ltr;letter-spacing:1.5px}
.v3-root .qr{padding:8px;background:#fff;border:1px solid var(--gold-deep);line-height:0;min-width:88px;min-height:88px;display:flex;align-items:center;justify-content:center}
.v3-root .qr img{display:block;width:72px;height:72px;image-rendering:pixelated}

.v3-root .sig{margin-top:36px;display:grid;grid-template-columns:1fr auto 1fr;gap:32px;align-items:flex-end}
.v3-root .sig-line{border-bottom:1px solid var(--ink);padding-bottom:6px}
.v3-root .sig-name{font-family:'Amiri',serif;font-style:italic;font-size:14px;color:var(--muted);margin-top:6px;text-align:center}
.v3-root .sig-stamp{
  width:80px;height:80px;border-radius:50%;border:2px solid var(--green);
  display:flex;align-items:center;justify-content:center;color:var(--green);
  font-family:'Tajawal',sans-serif;font-weight:900;font-size:11px;letter-spacing:1px;
  transform:rotate(-12deg);text-align:center;line-height:1.2;background:rgba(10,107,73,.06);
}

.v3-root .actions{margin-top:32px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.v3-root .btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;font-family:'Tajawal',sans-serif;font-weight:700;font-size:13px;letter-spacing:.5px;border:0;cursor:pointer;transition:all .2s}
.v3-root .btn-gold{background:linear-gradient(180deg,var(--gold-2),var(--gold));color:var(--ink);box-shadow:0 4px 14px rgba(80,55,15,.5),inset 0 1px 0 rgba(255,235,180,.5)}
.v3-root .btn-gold:hover{transform:translateY(-1px);box-shadow:0 8px 20px rgba(80,55,15,.55),inset 0 1px 0 rgba(255,235,180,.5)}
.v3-root .btn-outline{background:transparent;color:var(--gold-2);border:1px solid var(--gold)}
.v3-root .btn-outline:hover{background:rgba(200,155,74,.12);color:var(--gold-2)}

.v3-root .reviews{margin-top:64px;animation:fadeUp .6s .15s ease both}
.v3-root .reviews-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:14px}
.v3-root .reviews-t{font-family:'Amiri',serif;font-weight:700;font-size:30px;color:var(--gold-2);letter-spacing:-.3px;display:flex;align-items:center;gap:14px}
.v3-root .reviews-t::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--gold),transparent);min-width:40px}
.v3-root .reviews-c{font-family:'Tajawal',sans-serif;font-weight:700;font-size:13px;color:var(--gold-deep);background:rgba(200,155,74,.15);border:1px solid var(--gold);padding:4px 14px}

.v3-root .filters{display:flex;gap:0;border:1px solid rgba(200,155,74,.4);align-self:flex-start;margin-bottom:18px}
.v3-root .fbtn{background:transparent;border:0;border-left:1px solid rgba(200,155,74,.3);padding:8px 14px;font-family:'Tajawal',sans-serif;font-weight:600;font-size:11px;letter-spacing:1px;color:rgba(245,236,214,.65);cursor:pointer;transition:all .15s;text-transform:uppercase}
.v3-root .fbtn:last-child{border-left:0}
.v3-root .fbtn:hover{color:var(--gold-2)}
.v3-root .fbtn.active{background:var(--gold);color:var(--ink);font-weight:700}

.v3-root .review-list{display:flex;flex-direction:column;gap:14px}
.v3-root .review{background:var(--parchment);border:1px solid rgba(200,155,74,.4);padding:24px 28px;position:relative;box-shadow:0 4px 16px rgba(0,0,0,.25);scroll-margin-top:96px;animation:fadeUp .5s both}
.v3-root .review::before{content:'';position:absolute;top:0;right:0;width:4px;height:100%;background:linear-gradient(180deg,var(--gold),var(--gold-deep))}
.v3-root .review.low::before{background:linear-gradient(180deg,#c87a5c,var(--danger))}
.v3-root .review.highlighted{box-shadow:0 0 0 2px var(--gold-2),0 8px 24px rgba(200,155,74,.4)}

.v3-root .review-top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:12px}
.v3-root .review-who{display:flex;align-items:center;gap:14px;flex:1;min-width:0}
.v3-root .avatar{
  width:48px;height:48px;border-radius:50%;
  background:radial-gradient(circle at 30% 25%,var(--parchment-2),var(--parchment-3));
  border:1.5px solid var(--gold);display:flex;align-items:center;justify-content:center;
  flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 8px rgba(80,55,15,.25);
  overflow:hidden;
}
.v3-root .avatar img{width:32px;height:32px;object-fit:contain}
.v3-root .who-name{font-family:'Tajawal',sans-serif;font-weight:700;font-size:15px;color:var(--ink);margin-bottom:3px}
.v3-root .who-meta{font-family:'Amiri',serif;font-style:italic;font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.v3-root .who-meta-sep{width:3px;height:3px;background:var(--rule-2);border-radius:50%}
.v3-root .review-stars{margin-top:4px;display:inline-flex;gap:1px}

.v3-root .review-text{font-family:'Amiri',serif;font-size:18px;line-height:1.85;color:var(--ink-2);margin-top:6px;padding-right:62px;white-space:pre-wrap}
.v3-root .review-text-empty{font-style:italic;color:var(--muted);font-size:14px}

.v3-root .review-imgs{margin-top:14px;padding-right:62px;display:flex;gap:10px;flex-wrap:wrap}
.v3-root .review-img{position:relative;width:64px;height:64px;border:1px solid var(--rule-2);overflow:hidden;background:var(--parchment-2)}

.v3-root .empty{text-align:center;padding:48px 24px;color:rgba(245,236,214,.55);font-family:'Amiri',serif;font-size:16px}

.v3-root .stage-foot{margin-top:64px;text-align:center;color:var(--gold-deep);font-family:'Amiri',serif;font-style:italic;font-size:14px;letter-spacing:.5px}
.v3-root .stage-foot a{color:var(--gold-2);text-decoration:none;font-weight:700;border-bottom:1px solid var(--gold)}

.v3-root .toast{position:fixed;bottom:32px;right:50%;transform:translateX(50%) translateY(60px);background:var(--bg-deep);color:var(--gold-2);padding:14px 24px;font-family:'Tajawal',sans-serif;font-weight:600;font-size:13px;letter-spacing:.5px;border:1px solid var(--gold);z-index:100;opacity:0;transition:all .35s cubic-bezier(.4,0,.2,1);pointer-events:none;box-shadow:0 8px 30px rgba(0,0,0,.6)}
.v3-root .toast.show{opacity:1;transform:translateX(50%) translateY(0)}

@media(max-width:720px){
  .v3-root .stage{padding:24px 14px}
  .v3-root .cert{padding:48px 24px}
  .v3-root .cert::before{inset:12px}
  .v3-root .cert::after{inset:18px}
  .v3-root .corner{width:32px;height:32px}
  .v3-root .royal-title{font-size:32px}
  .v3-root .honoree-name{font-size:36px}
  .v3-root .panel{grid-template-columns:1fr}
  .v3-root .panel-cell{border-left:0;border-bottom:1px solid var(--rule)}
  .v3-root .panel-cell:last-child{border-bottom:0}
  .v3-root .registry{grid-template-columns:1fr 1fr;gap:16px}
  .v3-root .qr{grid-column:span 2;justify-self:flex-start}
  .v3-root .sig{grid-template-columns:1fr;gap:16px}
  .v3-root .sig-stamp{margin:0 auto}
  .v3-root .review-text,.v3-root .review-imgs{padding-right:0;margin-top:14px}
  .v3-root .reviews-t{font-size:22px}
}

@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
`;
