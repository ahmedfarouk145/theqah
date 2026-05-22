// src/lib/feeds/buildReviewFeedData.ts
//
// Shared data fetcher for the public review feeds (Phase 4 — AI Discovery).
// Both /feeds/reviews.json (JSON Feed v1.1) and /feeds/reviews.rss.xml
// (RSS 2.0) call this function so the underlying query, store-name
// enrichment, and certificate-link construction stay in one place.
//
// Strategy:
//   1. One Firestore query for the latest N verified+approved reviews
//      across ALL subscribed stores, ordered by publishedAt DESC.
//   2. One bulk read across `stores` + `zid_stores` for the unique storeUids
//      in step 1's result — gives us store names without N+1 lookups.
//   3. Build feed items with store name, certificate URL anchored at the
//      specific review ID, verification metadata, and the same Triple-Match
//      certificate code as everywhere else (djb2-base36 hash of storeUid).
//
// Caching: the calling endpoints set Cache-Control with a 1-hour fresh
// window + 6-hour stale-while-revalidate, so this function runs at most
// once an hour per region.

import { dbAdmin } from "@/lib/firebaseAdmin";
import { URLS } from "@/config/constants";

const SITE_URL = URLS.CANONICAL_ORIGIN;

/**
 * Hard cap on feed length. Feeds longer than this take too long to
 * serialize per request and aren't useful to AI crawlers anyway — they
 * sample from the head, not the tail.
 */
const FEED_MAX_ITEMS = 100;

export interface ReviewFeedItem {
    /** Stable, globally-unique URL fragment for this review. */
    id: string;
    /** Full URL to the review's anchor on the store certificate page. */
    url: string;
    /** Short Arabic title (≤ 100 chars). */
    title: string;
    /** Reviewer's display name as captured at submission time. */
    authorName: string;
    /** Review body text. Empty if the buyer left no comment. */
    content: string;
    /** Star rating, 1-5. */
    rating: number;
    /** ISO 8601 publish timestamp. */
    datePublishedISO: string;
    /** Store metadata used for context in the feed item. */
    storeName: string;
    storeUid: string;
    storeUrl: string | null;
    /** Source platform — "salla" / "zid" / "manual". */
    platform: string;
    /** Triple-Match certificate code, format TQ-XXXXXX. */
    certificateNumber: string;
}

/**
 * Same djb2-base36 hash used by reviews.tsx and theqah-widget.js — so the
 * cert code in a feed item matches what users see on the certificate page.
 */
function certCode(storeUid: string): string {
    if (!storeUid) return "";
    let hash = 5381;
    for (let i = 0; i < storeUid.length; i++) {
        hash = ((hash * 33) ^ storeUid.charCodeAt(i)) >>> 0;
    }
    return "TQ-" + (hash.toString(36).toUpperCase() + "000000").slice(0, 6);
}

function trim(s: string, n: number): string {
    const t = (s || "").trim();
    return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

interface StoreSnapshot {
    name: string;
    domain: string | null;
}

/**
 * Bulk-load store snapshots for the given uids. Reads `stores` (Salla +
 * legacy Zid + admin) and `zid_stores` (new Zid) in parallel; merges them
 * with `zid_stores` winning on conflict to match the sitemap.xml precedence.
 */
async function loadStores(uids: string[]): Promise<Map<string, StoreSnapshot>> {
    if (uids.length === 0) return new Map();
    const db = dbAdmin();
    const out = new Map<string, StoreSnapshot>();

    // Firestore `in` queries are capped at 30 ids per call. Chunk + parallel.
    const chunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) chunks.push(uids.slice(i, i + 30));

    const FieldPath = (await import("firebase-admin/firestore")).FieldPath;

    await Promise.all(
        chunks.flatMap((chunk) => [
            // Legacy `stores` collection
            db.collection("stores")
                .where(FieldPath.documentId(), "in", chunk)
                .select("name", "salla", "zid", "domain")
                .get()
                .then((snap) => {
                    for (const doc of snap.docs) {
                        const d = doc.data() as Record<string, unknown>;
                        const salla = (d.salla || {}) as Record<string, unknown>;
                        const zid = (d.zid || {}) as Record<string, unknown>;
                        const domainObj = (d.domain || {}) as Record<string, unknown>;
                        out.set(doc.id, {
                            name: String(
                                d.name ||
                                salla.storeName ||
                                zid.storeName ||
                                "متجر",
                            ),
                            domain: typeof domainObj.base === "string"
                                ? domainObj.base
                                : (typeof salla.domain === "string"
                                    ? salla.domain
                                    : (typeof zid.domain === "string" ? zid.domain : null)),
                        });
                    }
                })
                .catch(() => { /* ignore — feed degrades to "متجر" name */ }),
            // New `zid_stores` collection — overrides legacy when both exist.
            db.collection("zid_stores")
                .where(FieldPath.documentId(), "in", chunk)
                .select("name", "zid", "domain")
                .get()
                .then((snap) => {
                    for (const doc of snap.docs) {
                        const d = doc.data() as Record<string, unknown>;
                        const zid = (d.zid || {}) as Record<string, unknown>;
                        const domainObj = (d.domain || {}) as Record<string, unknown>;
                        const existing = out.get(doc.id);
                        out.set(doc.id, {
                            name: String(d.name || zid.storeName || existing?.name || "متجر"),
                            domain: typeof domainObj.base === "string"
                                ? domainObj.base
                                : (typeof zid.domain === "string" ? zid.domain : existing?.domain ?? null),
                        });
                    }
                })
                .catch(() => { /* ignore */ }),
        ]),
    );

    return out;
}

/**
 * Fetch + assemble the latest N verified reviews as feed items. Returns
 * newest first. Reads from the `reviews` collection only — Zid reviews
 * (which live in `zid_reviews`) aren't included here yet because the feed
 * is a global, paginated head; adding a union of two collections with
 * mixed schemas is deferred until after Phase 4 validates the approach.
 */
export async function buildReviewFeedData(): Promise<ReviewFeedItem[]> {
    const db = dbAdmin();

    const snap = await db.collection("reviews")
        .where("verified", "==", true)
        .where("status", "==", "approved")
        .orderBy("publishedAt", "desc")
        .limit(FEED_MAX_ITEMS)
        .get();

    if (snap.empty) return [];

    // Collect unique storeUids for the bulk store lookup.
    const storeUids = Array.from(
        new Set(
            snap.docs
                .map((d) => (d.data() as Record<string, unknown>).storeUid as string)
                .filter(Boolean),
        ),
    );
    const stores = await loadStores(storeUids);

    const items: ReviewFeedItem[] = [];
    for (const doc of snap.docs) {
        const r = doc.data() as Record<string, unknown>;
        const storeUid = String(r.storeUid || "");
        if (!storeUid) continue;

        const store = stores.get(storeUid);
        const storeName = store?.name || "متجر";
        const storeUrl = store?.domain
            ? (store.domain.startsWith("http") ? store.domain : `https://${store.domain}`)
            : null;

        const stars = Math.max(1, Math.min(5, Number(r.stars) || 5));
        const publishedAtMs = typeof r.publishedAt === "number"
            ? r.publishedAt
            : Date.now();
        const author = ((r.author || {}) as Record<string, unknown>).displayName;

        const reviewId = doc.id;
        const certUrl = `${SITE_URL}/store/${encodeURIComponent(storeUid)}/certificate#review-${reviewId}`;

        items.push({
            id: certUrl,
            url: certUrl,
            title: trim(
                `تقييم موثق على ${storeName} — ${stars} نجوم`,
                100,
            ),
            authorName: trim(String(author || "عميل موثق"), 60),
            content: trim(String(r.text || ""), 500),
            rating: stars,
            datePublishedISO: new Date(publishedAtMs).toISOString(),
            storeName,
            storeUid,
            storeUrl,
            platform: String(r.platform || "salla"),
            certificateNumber: certCode(storeUid),
        });
    }

    return items;
}
