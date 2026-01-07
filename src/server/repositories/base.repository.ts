/**
 * Base repository with common CRUD operations
 * @module server/repositories/base.repository
 */

import type { Firestore, Transaction, DocumentReference } from 'firebase-admin/firestore';
import { getDB, FirestoreQueryBuilder } from '../core';
import type { EntityBase, PaginationOptions, PaginatedResult } from '../core/types';

/**
 * Abstract base repository class
 * Provides common CRUD operations for all entities
 */
export abstract class BaseRepository<T extends EntityBase> {
    protected abstract readonly collectionName: string;
    protected readonly idField: string = 'id';

    /**
     * Get Firestore database instance
     */
    protected get db(): Firestore {
        return getDB().db;
    }

    /**
     * Get collection reference
     */
    protected get collection() {
        return this.db.collection(this.collectionName);
    }

    /**
     * Create a new query builder for this collection
     */
    query(): FirestoreQueryBuilder<T> {
        return new FirestoreQueryBuilder<T>(this.collection, this.idField);
    }

    /**
     * Find entity by ID
     */
    async findById(id: string): Promise<T | null> {
        const doc = await this.collection.doc(id).get();
        if (!doc.exists) return null;
        return this.mapDoc(doc);
    }

    /**
     * Find all entities matching query
     */
    async findAll(): Promise<T[]> {
        const snapshot = await this.collection.get();
        return snapshot.docs.map((doc) => this.mapDoc(doc));
    }

    /**
     * Find with pagination
     */
    async findPaginated(options: PaginationOptions = {}): Promise<PaginatedResult<T>> {
        return this.query().getPaginated(options);
    }

    /**
     * Create a new entity
     */
    async create(data: Omit<T, 'id' | 'createdAt'>): Promise<T> {
        const now = Date.now();
        const docRef = this.collection.doc();
        const entity = {
            ...data,
            [this.idField]: docRef.id,
            createdAt: now,
            updatedAt: now,
        } as unknown as T;

        await docRef.set(entity as FirebaseFirestore.DocumentData);
        return entity;
    }

    /**
     * Create with specific ID
     */
    async createWithId(id: string, data: Omit<T, 'id' | 'createdAt'>): Promise<T> {
        const now = Date.now();
        const docRef = this.collection.doc(id);
        const entity = {
            ...data,
            [this.idField]: id,
            createdAt: now,
            updatedAt: now,
        } as unknown as T;

        await docRef.set(entity as FirebaseFirestore.DocumentData);
        return entity;
    }

    /**
     * Update an existing entity
     */
    async update(id: string, data: Partial<T>): Promise<void> {
        const updateData = {
            ...data,
            updatedAt: Date.now(),
        };
        await this.collection.doc(id).update(updateData as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
    }

    /**
     * Set/merge entity data
     */
    async set(id: string, data: Partial<T>, merge: boolean = true): Promise<void> {
        const setData = {
            ...data,
            updatedAt: Date.now(),
        };
        await this.collection.doc(id).set(setData as FirebaseFirestore.DocumentData, { merge });
    }

    /**
     * Delete an entity
     */
    async delete(id: string): Promise<void> {
        await this.collection.doc(id).delete();
    }

    /**
     * Check if entity exists
     */
    async exists(id: string): Promise<boolean> {
        const doc = await this.collection.doc(id).get();
        return doc.exists;
    }

    /**
     * Count all documents in collection
     */
    async count(): Promise<number> {
        const snapshot = await this.collection.count().get();
        return snapshot.data().count;
    }

    /**
     * Run a transaction
     */
    async transaction<R>(fn: (tx: Transaction) => Promise<R>): Promise<R> {
        return this.db.runTransaction(fn);
    }

    /**
     * Get document reference for transactions
     */
    getDocRef(id: string): DocumentReference {
        return this.collection.doc(id);
    }

    /**
     * Map Firestore document to entity
     */
    protected mapDoc(doc: FirebaseFirestore.DocumentSnapshot): T {
        const data = doc.data();
        return {
            ...data,
            [this.idField]: doc.id,
        } as T;
    }
}
