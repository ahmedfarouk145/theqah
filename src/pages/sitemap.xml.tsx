// src/pages/sitemap.xml.tsx
//
// Fully dynamic sitemap — recomputed on every cache miss from live Firestore
// data. Per-URL <lastmod> reflects the most recent meaningful change for that
// resource (store sync timestamp, blog publish date, or build time for static
// pages), so search engines can detect updates without us pinging anything.
//
// Caching strategy: a short fresh window (10 min) with a long stale-while-
// revalidate tail (1 h). Crawlers always get a fast response; bots that hit
// the same URL again within an hour while a refresh is in flight still get
// the previous body and a fresh one is generated in the background.
import { GetServerSideProps } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

// Static pages — lastmod uses build/request time as a floor since these pages
// don't have a per-resource timestamp. Priority/changefreq still help crawlers
// budget attention.
const STATIC_PAGES: { path: string; priority: number; changefreq: string }[] = [
    { path: "/", priority: 1.0, changefreq: "weekly" },
    { path: "/blog", priority: 0.9, changefreq: "daily" },
    { path: "/faq", priority: 0.7, changefreq: "monthly" },
    { path: "/privacy-policy", priority: 0.3, changefreq: "yearly" },
    { path: "/terms", priority: 0.3, changefreq: "yearly" },
    { path: "/support", priority: 0.6, changefreq: "monthly" },
];

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function toW3CDate(date: Date): string {
    return date.toISOString().split("T")[0];
}

type UrlEntry = {
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: number;
};

/**
 * Mirrors the fallback logic of
 * @/server/utils/admin-subscription-buckets:getEffectiveExpiresAt
 * but kept inline so the sitemap doesn't pull in admin-only deps.
 *
 * Returns true when the store is currently subscribed by ANY signal:
 *   1. subscription.expiresAt (number) is in the future          (admin panel)
 *   2. subscription.status === "active"                          (marketplace webhooks)
 *   3. subscription.raw[0].end_date / expires_at / expired_at    (Salla raw payload)
 *      parses to a future date
 */
function isSubscribed(sub: unknown, now: number): boolean {
    if (!sub || typeof sub !== "object") return false;
    const s = sub as Record<string, unknown>;

    // 1. Numeric expiresAt set by the admin panel
    if (typeof s.expiresAt === "number" && s.expiresAt > now) return true;

    // 2. Status string set by Salla / Zid marketplace webhooks
    const status = typeof s.status === "string" ? s.status.trim().toLowerCase() : "";
    if (status === "active" || status === "trial" || status === "trialing") {
        return true;
    }

    // 3. Salla raw payload — date strings nested under raw or raw.data[0]
    const raw = s.raw;
    let entry: Record<string, unknown> | null = null;
    if (raw && typeof raw === "object") {
        const r = raw as Record<string, unknown>;
        if (Array.isArray(r.data) && r.data.length > 0 && typeof r.data[0] === "object") {
            entry = r.data[0] as Record<string, unknown>;
        } else if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
            entry = raw[0] as Record<string, unknown>;
        } else {
            entry = r;
        }
    }
    if (entry) {
        for (const key of ["end_date", "expires_at", "expired_at"] as const) {
            const v = entry[key];
            if (typeof v === "string" && v.trim()) {
                const trimmed = v.trim();
                const ms = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
                    ? Date.parse(`${trimmed}T23:59:59.999Z`)
                    : Date.parse(trimmed.replace(" ", "T"));
                if (Number.isFinite(ms) && ms > now) return true;
            }
        }
    }

    return false;
}

function renderUrl(entry: UrlEntry): string {
    return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority.toFixed(1)}</priority>
  </url>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
    const db = dbAdmin();
    const today = toW3CDate(new Date());

    // 1. Static pages
    const staticEntries: UrlEntry[] = STATIC_PAGES.map((page) => ({
        loc: `${SITE_URL}${page.path}`,
        lastmod: today,
        changefreq: page.changefreq,
        priority: page.priority,
    }));

    // 2. Published blog posts — lastmod = publishedAt (real per-post date)
    let blogEntries: UrlEntry[] = [];
    try {
        const snap = await db
            .collection("blog_posts")
            .where("status", "==", "published")
            .orderBy("publishedAt", "desc")
            .limit(500)
            .get();

        blogEntries = snap.docs.map((doc) => {
            const data = doc.data();
            const publishedAt: Date | null =
                data.publishedAt?.toDate?.() ??
                (typeof data.publishedAt === "number" ? new Date(data.publishedAt) : null);
            return {
                loc: `${SITE_URL}/blog/${data.slug}`,
                lastmod: publishedAt ? toW3CDate(publishedAt) : today,
                changefreq: "weekly",
                priority: 0.7,
            };
        });
    } catch (err) {
        console.error("[sitemap] Failed to fetch blog posts:", err);
    }

    // 3. Subscribed stores → /store/{storeUid}/certificate.
    //
    // Subscription state is written from three places with different shapes:
    //   - Admin panel:       subscription.expiresAt (number, ms)
    //   - Salla webhook:     subscription.status = "active" + raw end_date string
    //   - Zid webhook:       subscription.status = "active"
    // A Firestore where("subscription.expiresAt", ">", now) silently drops
    // stores that don't have that exact numeric field, which means every
    // marketplace-only subscriber is invisible to the sitemap. Instead we
    // fetch the whole stores collection (cheap with .select() projection)
    // and decide subscription state in memory using the same fallback chain
    // as @/server/utils/admin-subscription-buckets:getEffectiveExpiresAt.
    //
    // lastmod = max(updatedAt, lastReviewsSyncAt) — whichever is fresher,
    // so a new verified review reflects in the sitemap on the next refresh.
    let certificateEntries: UrlEntry[] = [];
    try {
        const now = Date.now();
        const snap = await db
            .collection("stores")
            .select("subscription", "updatedAt", "lastReviewsSyncAt")
            .limit(10000)
            .get();

        for (const doc of snap.docs) {
            const data = doc.data() as {
                subscription?: {
                    expiresAt?: unknown;
                    status?: unknown;
                    raw?: unknown;
                };
                updatedAt?: unknown;
                lastReviewsSyncAt?: unknown;
            };
            if (!isSubscribed(data.subscription, now)) continue;

            const lastTouchMs =
                Math.max(
                    typeof data.updatedAt === "number" ? data.updatedAt : 0,
                    typeof data.lastReviewsSyncAt === "number" ? data.lastReviewsSyncAt : 0,
                ) || Date.now();

            certificateEntries.push({
                loc: `${SITE_URL}/store/${encodeURIComponent(doc.id)}/certificate`,
                lastmod: toW3CDate(new Date(lastTouchMs)),
                changefreq: "weekly",
                priority: 0.8,
            });
        }

        // Most recently updated stores first — helps crawlers prioritize
        // pages that changed since their last visit.
        certificateEntries.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
    } catch (err) {
        console.error("[sitemap] Failed to fetch subscribed stores:", err);
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...blogEntries, ...certificateEntries].map(renderUrl).join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    // 10 min fresh, 1 h stale-while-revalidate. Cache miss → live Firestore read.
    res.setHeader(
        "Cache-Control",
        "public, s-maxage=600, stale-while-revalidate=3600",
    );
    // Tell search-engine crawlers not to cache this themselves beyond the
    // freshness window — they should refetch to see new stores promptly.
    res.setHeader("X-Robots-Tag", "noarchive");
    res.write(xml);
    res.end();

    return { props: {} };
};

// The component won't actually render since we write directly to the response.
export default function SitemapPage() {
    return null;
}
