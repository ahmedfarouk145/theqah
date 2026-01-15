/**
 * Type-safe Firestore query builder
 * @module server/core/query-builder
 */

import type {
    CollectionReference,
    Query,
    QueryDocumentSnapshot,
    WhereFilterOp,
    OrderByDirection,
} from 'firebase-admin/firestore';
import type { PaginationOptions, PaginatedResult, EntityBase } from './types';

/**
 * Generic type-safe Firestore query builder
 */
export class FirestoreQueryBuilder<T extends EntityBase> {
    private queryRef: Query;

    constructor(
        private collection: CollectionReference,
        private idField: string = 'id'
    ) {
        this.queryRef = collection;
    }

    /**
     * Add a where clause
     */
    where<K extends keyof T>(
        field: K,
        op: WhereFilterOp,
        value: T[K] | unknown
    ): this {
        this.queryRef = this.queryRef.where(field as string, op, value);
        return this;
    }

    /**
     * Add multiple where conditions
     */
    whereMultiple(conditions: Array<{ field: keyof T; op: WhereFilterOp; value: unknown }>): this {
        for (const { field, op, value } of conditions) {
            this.queryRef = this.queryRef.where(field as string, op, value);
        }
        return this;
    }

    /**
     * Add order by clause
     */
    orderBy(field: keyof T, direction: OrderByDirection = 'asc'): this {
        this.queryRef = this.queryRef.orderBy(field as string, direction);
        return this;
    }

    /**
     * Limit results
     */
    limit(count: number): this {
        this.queryRef = this.queryRef.limit(count);
        return this;
    }

    /**
     * Start after a cursor (for pagination)
     */
    startAfter(cursor: QueryDocumentSnapshot | unknown): this {
        this.queryRef = this.queryRef.startAfter(cursor);
        return this;
    }

    /**
     * Execute query and return all results
     */
    async getAll(): Promise<T[]> {
        const snapshot = await this.queryRef.get();
        return snapshot.docs.map((doc) => this.mapDoc(doc));
    }

    /**
     * Execute query and return first result
     */
    async getFirst(): Promise<T | null> {
        const snapshot = await this.queryRef.limit(1).get();
        if (snapshot.empty) return null;
        return this.mapDoc(snapshot.docs[0]);
    }

    /**
     * Get paginated results
     */
    async getPaginated(options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
        const { limit = 20, startAfter } = options;

        let query = this.queryRef.limit(limit + 1);

        if (startAfter) {
            const startDoc = await this.collection.doc(startAfter).get();
            if (startDoc.exists) {
                query = query.startAfter(startDoc);
            }
        }

        const snapshot = await query.get();
        const docs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        return {
            data: docs.map((doc) => this.mapDoc(doc)),
            hasMore,
            nextCursor: hasMore && docs.length > 0 ? docs[docs.length - 1].id : undefined,
        };
    }

    /**
     * Count documents matching the query
     */
    async count(): Promise<number> {
        const snapshot = await this.queryRef.count().get();
        return snapshot.data().count;
    }

    /**
     * Map Firestore document to entity
     */
    private mapDoc(doc: QueryDocumentSnapshot): T {
        const data = doc.data();
        return {
            ...data,
            [this.idField]: doc.id,
        } as T;
    }

    /**
     * Get the underlying query reference
     */
    getQueryRef(): Query {
        return this.queryRef;
    }
}
