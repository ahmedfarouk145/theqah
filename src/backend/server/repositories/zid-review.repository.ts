/**
 * Zid review repository — isolated from Salla.
 *
 * Writes:
 *   - Always go to the new `zid_reviews` collection.
 *
 * Reads:
 *   - Single-doc reads (`findById`) check `zid_reviews` first, fall back
 *     to legacy `reviews`.
 *   - Multi-doc reads (`findVerifiedByStore`, etc.) union both collections
 *     and dedupe by `reviewId`. New docs win on conflict.
 *
 * This repo only serves Zid reviews — `storeUid` should always start with
 * `"zid:"`. Salla reviews continue to be served by `ReviewRepository`.
 *
 * @module server/repositories/zid-review.repository
 */

import { BaseRepository } from './base.repository';
import type { Review, PaginatedResult, PaginationOptions } from '../core/types';

const LEGACY_COLLECTION = 'reviews';

export class ZidReviewRepository extends BaseRepository<Review> {
    protected readonly collectionName = 'zid_reviews';
    protected readonly idField = 'reviewId';

    /** Reference to the legacy collection used for read-fallback. */
    private get legacy() {
        return this.db.collection(LEGACY_COLLECTION);
    }

    /**
     * Find a review by its reviewId. Tries `zid_reviews`, falls back to
     * legacy `reviews`.
     */
    override async findById(reviewId: string): Promise<Review | null> {
        const newDoc = await this.collection.doc(reviewId).get();
        if (newDoc.exists) return this.mapDoc(newDoc);

        const legacyDoc = await this.legacy.doc(reviewId).get();
        if (legacyDoc.exists) return this.mapDoc(legacyDoc);

        return null;
    }

    /** Find a review by orderId (Zid-scoped). Unions both collections. */
    async findByOrderId(orderId: string): Promise<Review | null> {
        const newSnap = await this.collection
            .where('orderId', '==', orderId)
            .limit(1)
            .get();
        if (!newSnap.empty) return this.mapDoc(newSnap.docs[0]);

        const legacySnap = await this.legacy
            .where('orderId', '==', orderId)
            .limit(1)
            .get();
        if (!legacySnap.empty) return this.mapDoc(legacySnap.docs[0]);

        return null;
    }

    /** Find a review by (orderId, productId). */
    async findByOrderAndProduct(
        orderId: string,
        productId: string,
    ): Promise<Review | null> {
        const newSnap = await this.collection
            .where('orderId', '==', orderId)
            .where('productId', '==', productId)
            .limit(1)
            .get();
        if (!newSnap.empty) return this.mapDoc(newSnap.docs[0]);

        const legacySnap = await this.legacy
            .where('orderId', '==', orderId)
            .where('productId', '==', productId)
            .limit(1)
            .get();
        if (!legacySnap.empty) return this.mapDoc(legacySnap.docs[0]);

        return null;
    }

    /**
     * Verified reviews for a Zid store (used by widget API + certificate
     * page). Unions `zid_reviews` + legacy `reviews`, deduped by reviewId.
     */
    async findVerifiedByStore(
        storeUid: string,
        productId?: string,
    ): Promise<Review[]> {
        const buildQuery = (coll: FirebaseFirestore.CollectionReference) => {
            let q = coll
                .where('storeUid', '==', storeUid)
                .where('verified', '==', true)
                .where('status', '==', 'approved');
            if (productId) q = q.where('productId', '==', productId);
            return q;
        };

        const [newSnap, legacySnap] = await Promise.all([
            buildQuery(this.collection).get(),
            buildQuery(this.legacy).get(),
        ]);

        return this.mergeAndDedupe(newSnap.docs, legacySnap.docs);
    }

    /**
     * Published reviews for the public widget. Limit is applied AFTER
     * merging so we don't accidentally truncate a store whose reviews
     * happen to all live in legacy. We over-fetch from each side then
     * trim.
     */
    async findPublishedByStore(
        storeUid: string,
        options?: {
            productId?: string;
            limit?: number;
            sort?: 'asc' | 'desc';
            sinceDays?: number;
        },
    ): Promise<Review[]> {
        const { productId, limit = 20, sort = 'desc', sinceDays = 0 } =
            options || {};

        const buildQuery = (coll: FirebaseFirestore.CollectionReference) =>
            coll
                .where('storeUid', '==', storeUid)
                .where('status', '==', 'published')
                .orderBy('publishedAt', sort)
                .limit(limit);

        const [newSnap, legacySnap] = await Promise.all([
            buildQuery(this.collection).get(),
            buildQuery(this.legacy).get(),
        ]);

        let reviews = this.mergeAndDedupe(newSnap.docs, legacySnap.docs);

        if (productId) {
            reviews = reviews.filter((r) => r.productId === productId);
        }
        if (sinceDays > 0) {
            const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
            reviews = reviews.filter((r) => (r.publishedAt || 0) >= cutoff);
        }

        // Re-sort the union (each collection was sorted in isolation; the
        // merged stream may not be globally sorted) and trim to limit.
        reviews.sort((a, b) =>
            sort === 'desc'
                ? (b.publishedAt || 0) - (a.publishedAt || 0)
                : (a.publishedAt || 0) - (b.publishedAt || 0),
        );

        return reviews.slice(0, limit);
    }

    /** Pending reviews for a Zid store. */
    async findPendingReviews(storeUid: string): Promise<Review[]> {
        const buildQuery = (coll: FirebaseFirestore.CollectionReference) =>
            coll
                .where('storeUid', '==', storeUid)
                .where('status', '==', 'pending_review');

        const [newSnap, legacySnap] = await Promise.all([
            buildQuery(this.collection).get(),
            buildQuery(this.legacy).get(),
        ]);

        return this.mergeAndDedupe(newSnap.docs, legacySnap.docs);
    }

    /** Paginated list of reviews for a store (admin/dashboard use). */
    async findByStoreUid(
        storeUid: string,
        options?: PaginationOptions,
    ): Promise<PaginatedResult<Review>> {
        // Pagination across two collections is non-trivial — we'd need to
        // merge cursors. For Phase 1 we delegate to the new collection
        // only; legacy reviews surface through the unioned read methods
        // above. Revisit if the dashboard needs legacy paging.
        return this.query()
            .where('storeUid', '==', storeUid)
            .orderBy('createdAt', 'desc')
            .getPaginated(options);
    }

    /** Update review status. Writes to whichever collection holds the doc. */
    async updateStatus(
        reviewId: string,
        status: string,
        published: boolean,
    ): Promise<void> {
        await this.upgradeWrite(reviewId, {
            status,
            published,
            publishedAt: published ? Date.now() : null,
        } as unknown as Partial<Review>);
    }

    /** Hide a review. Writes to whichever collection holds the doc. */
    async hide(reviewId: string): Promise<void> {
        await this.upgradeWrite(reviewId, {
            status: 'hidden',
            published: false,
        } as unknown as Partial<Review>);
    }

    /**
     * Internal: merge two snapshot lists into a deduped Review[] (new
     * collection wins on conflict). Stable order: new docs first.
     */
    private mergeAndDedupe(
        newDocs: FirebaseFirestore.QueryDocumentSnapshot[],
        legacyDocs: FirebaseFirestore.QueryDocumentSnapshot[],
    ): Review[] {
        const seen = new Set<string>();
        const out: Review[] = [];
        for (const doc of [...newDocs, ...legacyDocs]) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            out.push(this.mapDoc(doc));
        }
        return out;
    }

    /**
     * Internal: write a partial update to wherever the doc currently lives.
     * If the doc only exists in legacy, lazy-migrate it: read full legacy
     * doc, merge with the patch, write the full doc to `zid_reviews`. The
     * legacy doc is left as a stale snapshot (read-fallback won't return
     * it because the new doc now wins).
     */
    private async upgradeWrite(
        reviewId: string,
        patch: Partial<Review>,
    ): Promise<void> {
        const newDoc = await this.collection.doc(reviewId).get();
        if (newDoc.exists) {
            await this.set(reviewId, patch);
            return;
        }

        const legacyDoc = await this.legacy.doc(reviewId).get();
        if (!legacyDoc.exists) {
            // Doc doesn't exist anywhere — nothing to update.
            return;
        }

        const merged = { ...legacyDoc.data(), ...patch } as Partial<Review>;
        await this.set(reviewId, merged);
    }
}
