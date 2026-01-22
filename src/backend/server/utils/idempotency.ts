// src/backend/server/utils/idempotency.ts
/**
 * H10: Webhook Idempotency Utility
 * Prevents duplicate processing of the same webhook event
 */

import { dbAdmin } from "@/lib/firebaseAdmin";

export interface IdempotencyOptions {
    ttlMs?: number; // How long to remember processed keys (default: 24 hours)
    collection?: string; // Firestore collection for idempotency keys
}

const DEFAULT_OPTIONS: Required<IdempotencyOptions> = {
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours
    collection: "idempotency_keys",
};

/**
 * Generate a unique idempotency key from webhook data
 * Uses multiple fields to minimize collision risk
 */
export function generateIdempotencyKey(params: {
    event: string;
    merchantId?: string | number;
    orderId?: string | number;
    eventId?: string;
    timestamp?: number;
}): string {
    const parts = [
        params.event,
        params.merchantId ? String(params.merchantId) : "",
        params.orderId ? String(params.orderId) : "",
        params.eventId || "",
    ].filter(Boolean);

    // Add timestamp bucket (1-minute granularity) to reduce false positives
    if (params.timestamp) {
        const bucket = Math.floor(params.timestamp / 60000); // 1-minute buckets
        parts.push(String(bucket));
    }

    return parts.join(":");
}

/**
 * Check if a webhook event has already been processed
 * @returns true if duplicate (should skip), false if new (should process)
 */
export async function isDuplicateWebhook(
    key: string,
    options: IdempotencyOptions = {}
): Promise<boolean> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const db = dbAdmin();
        const docRef = db.collection(opts.collection).doc(key);
        const doc = await docRef.get();

        if (doc.exists) {
            const data = doc.data();
            const processedAt = data?.processedAt || 0;
            const now = Date.now();

            // Check if within TTL
            if (now - processedAt < opts.ttlMs) {
                return true; // Duplicate within TTL
            }
        }

        return false; // Not a duplicate
    } catch (error) {
        // On error, allow processing to continue (fail open)
        console.error("[Idempotency] Check failed:", error);
        return false;
    }
}

/**
 * Mark a webhook event as processed
 */
export async function markWebhookProcessed(
    key: string,
    metadata?: Record<string, unknown>,
    options: IdempotencyOptions = {}
): Promise<void> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const db = dbAdmin();
        const docRef = db.collection(opts.collection).doc(key);

        await docRef.set({
            processedAt: Date.now(),
            createdAt: new Date().toISOString(),
            metadata: metadata || null,
        });
    } catch (error) {
        console.error("[Idempotency] Mark processed failed:", error);
        // Don't throw - this shouldn't block processing
    }
}

/**
 * Check and mark in a single operation (atomic)
 * @returns { isDuplicate: boolean, firstProcessedAt?: number }
 */
export async function checkAndMark(
    key: string,
    metadata?: Record<string, unknown>,
    options: IdempotencyOptions = {}
): Promise<{ isDuplicate: boolean; firstProcessedAt?: number }> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const db = dbAdmin();
        const docRef = db.collection(opts.collection).doc(key);

        const result = await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);

            if (doc.exists) {
                const data = doc.data();
                const processedAt = data?.processedAt || 0;
                const now = Date.now();

                if (now - processedAt < opts.ttlMs) {
                    return { isDuplicate: true, firstProcessedAt: processedAt };
                }
            }

            // Mark as processed
            transaction.set(docRef, {
                processedAt: Date.now(),
                createdAt: new Date().toISOString(),
                metadata: metadata || null,
            });

            return { isDuplicate: false };
        });

        return result;
    } catch (error) {
        console.error("[Idempotency] Atomic check failed:", error);
        return { isDuplicate: false }; // Fail open
    }
}

/**
 * Cleanup expired idempotency keys (run periodically)
 */
export async function cleanupExpiredKeys(
    options: IdempotencyOptions = {}
): Promise<number> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
        const db = dbAdmin();
        const cutoff = Date.now() - opts.ttlMs;

        const expired = await db
            .collection(opts.collection)
            .where("processedAt", "<", cutoff)
            .limit(500)
            .get();

        const batch = db.batch();
        expired.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();

        return expired.size;
    } catch (error) {
        console.error("[Idempotency] Cleanup failed:", error);
        return 0;
    }
}

export default {
    generateIdempotencyKey,
    isDuplicateWebhook,
    markWebhookProcessed,
    checkAndMark,
    cleanupExpiredKeys,
};
