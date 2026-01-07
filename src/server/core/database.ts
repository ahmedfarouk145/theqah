/**
 * Singleton database connection wrapper
 * Enhances existing firebaseAdmin.ts pattern
 * @module server/core/database
 */

import { dbAdmin, authAdmin, initAdmin } from '@/lib/firebaseAdmin';
import type { Firestore, Transaction, WriteBatch } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';

/**
 * Singleton database connection class
 * Provides centralized access to Firestore and Auth
 */
export class DatabaseConnection {
    private static instance: DatabaseConnection | null = null;

    private constructor() {
        // Initialize Firebase Admin on first access
        initAdmin();
    }

    /**
     * Get singleton instance
     */
    static getInstance(): DatabaseConnection {
        if (!DatabaseConnection.instance) {
            DatabaseConnection.instance = new DatabaseConnection();
        }
        return DatabaseConnection.instance;
    }

    /**
     * Get Firestore instance
     */
    get db(): Firestore {
        return dbAdmin();
    }

    /**
     * Get Auth instance
     */
    get auth(): Auth {
        return authAdmin();
    }

    /**
     * Run a transaction
     */
    async runTransaction<T>(
        updateFunction: (transaction: Transaction) => Promise<T>
    ): Promise<T> {
        return this.db.runTransaction(updateFunction);
    }

    /**
     * Create a write batch
     */
    batch(): WriteBatch {
        return this.db.batch();
    }

    /**
     * Get current server timestamp
     */
    get timestamp(): FirebaseFirestore.FieldValue {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FieldValue } = require('firebase-admin/firestore');
        return FieldValue.serverTimestamp();
    }
}

// Export singleton getter for convenience
export const getDB = () => DatabaseConnection.getInstance();
