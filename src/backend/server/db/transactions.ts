/**
 * Database Transaction Utilities
 * 
 * Provides safe transaction wrappers for critical Firestore operations
 * to ensure data consistency and prevent race conditions.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';

/**
 * Transaction helper that automatically retries on contention
 */
export async function safeTransaction<T>(
  db: Firestore,
  operation: (tx: Transaction) => Promise<T>,
  options: {
    maxRetries?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { maxRetries = 3, onRetry } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await db.runTransaction(operation);
    } catch (error) {
      lastError = error as Error;
      
      // Check if it's a contention error (should retry)
      const isContention = 
        lastError.message?.includes('contention') ||
        lastError.message?.includes('ABORTED') ||
        lastError.message?.includes('too much contention');

      if (isContention && attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
        continue;
      }

      // Not a contention error or max retries reached
      throw lastError;
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Batch write with transaction safety
 * Use when you need atomic writes across multiple documents
 */
export async function transactionalBatchWrite(
  db: Firestore,
  operations: Array<{
    type: 'set' | 'update' | 'delete';
    collection: string;
    docId: string;
    data?: Record<string, unknown>;
    merge?: boolean;
  }>
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  // Firestore transaction limit is 500 operations
  if (operations.length > 500) {
    throw new Error(`Too many operations (${operations.length}). Maximum is 500 per transaction.`);
  }

  await safeTransaction(db, async (tx) => {
    // First, read all documents (transactions require reads before writes)
    const reads = operations
      .filter(op => op.type === 'update')
      .map(op => tx.get(db.collection(op.collection).doc(op.docId)));

    if (reads.length > 0) {
      await Promise.all(reads);
    }

    // Then perform writes
    for (const op of operations) {
      const ref = db.collection(op.collection).doc(op.docId);

      switch (op.type) {
        case 'set':
          if (op.merge) {
            tx.set(ref, op.data || {}, { merge: true });
          } else {
            tx.set(ref, op.data || {});
          }
          break;
        case 'update':
          tx.update(ref, op.data || {});
          break;
        case 'delete':
          tx.delete(ref);
          break;
      }
    }
  });
}

/**
 * Atomic counter increment
 * Safely increment/decrement a counter field without race conditions
 */
export async function atomicCounterUpdate(
  db: Firestore,
  collection: string,
  docId: string,
  field: string,
  delta: number
): Promise<number> {
  return await safeTransaction(db, async (tx) => {
    const ref = db.collection(collection).doc(docId);
    const doc = await tx.get(ref);

    if (!doc.exists) {
      // Initialize document with counter
      const newValue = delta;
      tx.set(ref, { [field]: newValue });
      return newValue;
    }

    const currentValue = (doc.data()?.[field] as number) || 0;
    const newValue = currentValue + delta;
    tx.update(ref, { [field]: newValue });

    return newValue;
  });
}

/**
 * Atomic toggle
 * Safely toggle a boolean field
 */
export async function atomicToggle(
  db: Firestore,
  collection: string,
  docId: string,
  field: string
): Promise<boolean> {
  return await safeTransaction(db, async (tx) => {
    const ref = db.collection(collection).doc(docId);
    const doc = await tx.get(ref);

    if (!doc.exists) {
      throw new Error(`Document ${collection}/${docId} not found`);
    }

    const currentValue = doc.data()?.[field] === true;
    const newValue = !currentValue;
    tx.update(ref, { [field]: newValue });

    return newValue;
  });
}

/**
 * Conditional update
 * Update only if a condition is met (optimistic locking)
 */
export async function conditionalUpdate(
  db: Firestore,
  collection: string,
  docId: string,
  condition: (data: Record<string, unknown>) => boolean,
  updates: Record<string, unknown>
): Promise<{ updated: boolean; reason?: string }> {
  return await safeTransaction(db, async (tx) => {
    const ref = db.collection(collection).doc(docId);
    const doc = await tx.get(ref);

    if (!doc.exists) {
      return { updated: false, reason: 'document_not_found' };
    }

    const data = doc.data() || {};
    if (!condition(data)) {
      return { updated: false, reason: 'condition_not_met' };
    }

    tx.update(ref, updates);
    return { updated: true };
  });
}

/**
 * Move document between collections atomically
 * Useful for workflow state transitions
 */
export async function moveDocument(
  db: Firestore,
  fromCollection: string,
  toCollection: string,
  docId: string,
  transform?: (data: Record<string, unknown>) => Record<string, unknown>
): Promise<void> {
  await safeTransaction(db, async (tx) => {
    const sourceRef = db.collection(fromCollection).doc(docId);
    const targetRef = db.collection(toCollection).doc(docId);

    const sourceDoc = await tx.get(sourceRef);
    if (!sourceDoc.exists) {
      throw new Error(`Source document ${fromCollection}/${docId} not found`);
    }

    let data = sourceDoc.data() || {};
    if (transform) {
      data = transform(data);
    }

    tx.set(targetRef, data);
    tx.delete(sourceRef);
  });
}

/**
 * Reserve a quota/limit atomically
 * Useful for preventing over-allocation
 */
export async function reserveQuota(
  db: Firestore,
  collection: string,
  docId: string,
  quotaField: string,
  usedField: string,
  amount: number
): Promise<{ success: boolean; remaining?: number; reason?: string }> {
  return await safeTransaction(db, async (tx) => {
    const ref = db.collection(collection).doc(docId);
    const doc = await tx.get(ref);

    if (!doc.exists) {
      return { success: false, reason: 'document_not_found' };
    }

    const data = doc.data() || {};
    const quota = (data[quotaField] as number) || 0;
    const used = (data[usedField] as number) || 0;
    const remaining = quota - used;

    if (remaining < amount) {
      return { success: false, remaining, reason: 'insufficient_quota' };
    }

    const newUsed = used + amount;
    tx.update(ref, { [usedField]: newUsed });

    return { success: true, remaining: quota - newUsed };
  });
}

/**
 * Create document with unique constraint check
 * Prevents duplicate creation based on a field value
 */
export async function createWithUniqueConstraint(
  db: Firestore,
  collection: string,
  uniqueField: string,
  uniqueValue: unknown,
  data: Record<string, unknown>
): Promise<{ success: boolean; docId?: string; reason?: string }> {
  // First check if duplicate exists (outside transaction for efficiency)
  const existing = await db.collection(collection)
    .where(uniqueField, '==', uniqueValue)
    .limit(1)
    .get();

  if (!existing.empty) {
    return { 
      success: false, 
      docId: existing.docs[0].id,
      reason: 'duplicate_exists' 
    };
  }

  // Create within transaction to handle race conditions
  return await safeTransaction(db, async (tx) => {
    // Double-check within transaction
    const recheck = await tx.get(
      db.collection(collection).where(uniqueField, '==', uniqueValue).limit(1)
    );

    if (!recheck.empty) {
      return { 
        success: false, 
        docId: recheck.docs[0].id,
        reason: 'duplicate_exists' 
      };
    }

    const ref = db.collection(collection).doc();
    tx.set(ref, { ...data, [uniqueField]: uniqueValue });

    return { success: true, docId: ref.id };
  });
}
