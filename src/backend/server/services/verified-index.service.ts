/**
 * Verified-review index — one compact doc per store so the public widget
 * endpoint costs ~1 read instead of reading every verified review.
 *
 * Doc: verified_index/{storeUid}
 *   entries: compact ID tuples for ALL verified reviews (badge matching)
 *   rich:    full data for the most recent RICH_COUNT (JSON-LD fallback
 *            when the page has no productId)
 *   count:   total verified reviews — compared against a count()
 *            aggregate (1 read) on each request; mismatch triggers a
 *            lazy rebuild, so the index self-heals without hooking
 *            every review write path.
 *
 * @module server/services/verified-index.service
 */

import { dbAdmin } from '@/lib/firebaseAdmin';

export const VERIFIED_INDEX_COLLECTION = 'verified_index';
const RICH_COUNT = 20;
// Firestore doc limit is 1 MiB; compact entries are ~60 bytes so 5000
// stays far below it. Stores beyond this keep badges for the newest 5000.
const MAX_ENTRIES = 5000;

export interface CompactEntry {
    id: string;
    sallaReviewId: string | null;
    zidDomHash: string | null;
    productId: string | null;
}

export interface RichEntry extends CompactEntry {
    stars: number;
    authorName: string | null;
    text: string | null;
    productName: string | null;
    publishedAt: number | null;
}

export interface VerifiedIndexDoc {
    storeUid: string;
    count: number;
    updatedAt: number;
    entries: CompactEntry[];
    rich: RichEntry[];
}

function asString(v: unknown): string | null {
    return typeof v === 'string' && v ? v : v != null && v !== '' ? String(v) : null;
}

function reviewTimestamp(d: Record<string, unknown>): number {
    for (const k of ['publishedAt', 'createdAt', 'at']) {
        const v = d[k];
        if (typeof v === 'number') return v;
        if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
            return (v as { toMillis: () => number }).toMillis();
        }
    }
    return 0;
}

export class VerifiedIndexService {
    private verifiedQuery(storeUid: string) {
        const db = dbAdmin();
        return db.collection('reviews')
            .where('storeUid', '==', storeUid)
            .where('verified', '==', true)
            .where('status', '==', 'approved');
    }

    /**
     * Rebuild the index doc from the reviews collection.
     * Cost: N review reads + 1 write. Runs only when the count drifts
     * (review approved/hidden) or the doc doesn't exist yet.
     */
    async rebuild(storeUid: string): Promise<VerifiedIndexDoc> {
        const db = dbAdmin();
        const snap = await this.verifiedQuery(storeUid).get();

        const all = snap.docs.map((doc) => {
            const d = doc.data() as Record<string, unknown>;
            return {
                compact: {
                    id: doc.id,
                    sallaReviewId: asString(d.sallaReviewId),
                    zidDomHash: asString(d.zidDomHash),
                    productId: asString(d.productId),
                } as CompactEntry,
                d,
                ts: reviewTimestamp(d),
            };
        });

        // Newest first so MAX_ENTRIES truncation drops the oldest.
        all.sort((a, b) => b.ts - a.ts);
        const kept = all.slice(0, MAX_ENTRIES);

        const rich: RichEntry[] = kept.slice(0, RICH_COUNT).map(({ compact, d, ts }) => ({
            ...compact,
            stars: typeof d.stars === 'number' ? d.stars : Number(d.stars) || 0,
            authorName: asString((d.author as Record<string, unknown> | undefined)?.displayName) || asString(d.authorName),
            text: asString(d.text),
            productName: asString(d.productName),
            publishedAt: ts || null,
        }));

        const doc: VerifiedIndexDoc = {
            storeUid,
            count: snap.size,
            updatedAt: Date.now(),
            entries: kept.map((k) => k.compact),
            rich,
        };

        await db.collection(VERIFIED_INDEX_COLLECTION).doc(storeUid).set(doc);
        return doc;
    }

    /**
     * Get a fresh index for a store.
     * Steady-state cost: 1 doc read + 1 count() aggregate read.
     */
    async getFresh(storeUid: string): Promise<VerifiedIndexDoc> {
        const db = dbAdmin();

        const [docSnap, countSnap] = await Promise.all([
            db.collection(VERIFIED_INDEX_COLLECTION).doc(storeUid).get(),
            this.verifiedQuery(storeUid).count().get(),
        ]);
        const liveCount = countSnap.data().count;
        const existing = docSnap.exists ? (docSnap.data() as VerifiedIndexDoc) : null;

        if (existing && existing.count === liveCount) {
            return existing;
        }
        return this.rebuild(storeUid);
    }
}
