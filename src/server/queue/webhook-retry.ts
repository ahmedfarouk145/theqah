// src/server/queue/webhook-retry.ts

/**
 * Webhook Retry Queue System
 * 
 * Implements exponential backoff retry logic for failed webhook processing
 * with dead letter queue for permanently failed webhooks.
 * 
 * Architecture:
 * - Retry queue: webhook_retry_queue (Firestore)
 * - Dead letter queue: webhook_dead_letter (Firestore)
 * - Max attempts: 5 (configurable)
 * - Backoff: exponential (1min, 5min, 15min, 1h, 6h)
 * 
 * Features:
 * - Automatic retry with exponential backoff
 * - Dead letter queue for manual review
 * - Monitoring integration
 * - Admin APIs for manual retry
 */

import type { NextApiRequest } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { metrics } from "@/server/monitoring/metrics";

/* ===================== Types ===================== */

export interface WebhookRetryEntry {
  id: string;
  event: string;
  merchant: string | number | null;
  orderId: string | null;
  rawBody: string;
  headers: Record<string, string>;
  
  // Retry tracking
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError: string | null;
  lastAttemptAt: number | null;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  
  // Metadata
  storeUid: string | null;
  priority: "high" | "normal" | "low";
  tags: string[];
}

export interface DeadLetterEntry {
  id: string;
  event: string;
  merchant: string | number | null;
  orderId: string | null;
  rawBody: string;
  headers: Record<string, string>;
  
  // Failure details
  totalAttempts: number;
  errors: Array<{
    attempt: number;
    timestamp: number;
    error: string;
    stack?: string;
  }>;
  
  // Metadata
  storeUid: string | null;
  priority: "high" | "normal" | "low";
  tags: string[];
  
  // Timestamps
  failedAt: number;
  createdAt: number;
  
  // Manual review
  reviewedAt: number | null;
  reviewedBy: string | null;
  resolution: "retried" | "ignored" | "manual_fix" | null;
  notes: string | null;
}

export interface RetryConfig {
  maxAttempts: number;
  backoffSchedule: number[]; // milliseconds between attempts
  enableDLQ: boolean;
  enableMetrics: boolean;
}

/* ===================== Configuration ===================== */

const DEFAULT_CONFIG: RetryConfig = {
  maxAttempts: 5,
  backoffSchedule: [
    1 * 60 * 1000,      // 1 minute
    5 * 60 * 1000,      // 5 minutes
    15 * 60 * 1000,     // 15 minutes
    60 * 60 * 1000,     // 1 hour
    6 * 60 * 60 * 1000, // 6 hours
  ],
  enableDLQ: true,
  enableMetrics: true,
};

// Environment overrides
const MAX_ATTEMPTS = process.env.WEBHOOK_MAX_RETRY_ATTEMPTS 
  ? parseInt(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS, 10) 
  : DEFAULT_CONFIG.maxAttempts;

const ENABLE_RETRY = process.env.ENABLE_WEBHOOK_RETRY !== "false";
const ENABLE_DLQ = process.env.ENABLE_WEBHOOK_DLQ !== "false";

/* ===================== Retry Queue Management ===================== */

/**
 * Add failed webhook to retry queue
 */
export async function enqueueWebhookRetry(params: {
  event: string;
  merchant: string | number | null;
  orderId: string | null;
  rawBody: Buffer | string;
  headers: Record<string, string | string[]>;
  error: Error;
  storeUid?: string | null;
  priority?: "high" | "normal" | "low";
}): Promise<{ ok: boolean; retryId?: string; error?: string }> {
  if (!ENABLE_RETRY) {
    return { ok: false, error: "Webhook retry disabled" };
  }

  try {
    const db = dbAdmin();
    const now = Date.now();
    const retryId = `retry_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Normalize headers (convert arrays to strings)
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(params.headers)) {
      normalizedHeaders[key] = Array.isArray(value) ? value[0] || "" : value;
    }

    const entry: WebhookRetryEntry = {
      id: retryId,
      event: params.event,
      merchant: params.merchant,
      orderId: params.orderId,
      rawBody: Buffer.isBuffer(params.rawBody) 
        ? params.rawBody.toString("utf8") 
        : params.rawBody,
      headers: normalizedHeaders,
      
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextRetryAt: now + DEFAULT_CONFIG.backoffSchedule[0],
      lastError: params.error.message,
      lastAttemptAt: now,
      
      createdAt: now,
      updatedAt: now,
      
      storeUid: params.storeUid || null,
      priority: params.priority || "normal",
      tags: [params.event, params.storeUid || "unknown"].filter(Boolean),
    };

    await db.collection("webhook_retry_queue").doc(retryId).set(entry);

    // Track metrics
    if (DEFAULT_CONFIG.enableMetrics) {
      await metrics.track({
        name: "webhook_retry_enqueued",
        value: 1,
        labels: {
          event: params.event,
          storeUid: params.storeUid || "unknown",
          priority: entry.priority,
        },
      });
    }

    console.log(`[WEBHOOK_RETRY] Enqueued webhook for retry: ${retryId} (event: ${params.event})`);
    return { ok: true, retryId };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK_RETRY] Failed to enqueue webhook:`, error);
    return { ok: false, error: errMsg };
  }
}

/**
 * Process pending retries (called by cron job)
 */
export async function processRetryQueue(): Promise<{
  ok: boolean;
  processed: number;
  succeeded: number;
  failed: number;
  movedToDLQ: number;
  errors: string[];
}> {
  const db = dbAdmin();
  const now = Date.now();
  const results = {
    ok: true,
    processed: 0,
    succeeded: 0,
    failed: 0,
    movedToDLQ: 0,
    errors: [] as string[],
  };

  try {
    // Get pending retries (due for retry)
    const pendingSnapshot = await db
      .collection("webhook_retry_queue")
      .where("nextRetryAt", "<=", now)
      .limit(50) // Process in batches
      .get();

    if (pendingSnapshot.empty) {
      console.log(`[WEBHOOK_RETRY] No pending retries`);
      return results;
    }

    console.log(`[WEBHOOK_RETRY] Processing ${pendingSnapshot.size} pending retries`);

    // Process each retry
    for (const doc of pendingSnapshot.docs) {
      const entry = doc.data() as WebhookRetryEntry;
      results.processed++;

      try {
        // Attempt to reprocess webhook
        const success = await retryWebhookProcessing(entry);

        if (success) {
          // Success - remove from queue
          await doc.ref.delete();
          results.succeeded++;
          
          if (DEFAULT_CONFIG.enableMetrics) {
            await metrics.track({
              name: "webhook_retry_succeeded",
              value: 1,
              labels: {
                event: entry.event,
                storeUid: entry.storeUid || "unknown",
                attempts: entry.attempts + 1,
              },
            });
          }

          console.log(`[WEBHOOK_RETRY] ✅ Retry succeeded: ${entry.id} (attempt ${entry.attempts + 1})`);

        } else {
          // Failed - check if should retry again or move to DLQ
          const newAttempts = entry.attempts + 1;

          if (newAttempts >= entry.maxAttempts) {
            // Max attempts reached - move to DLQ
            await moveToDLQ(entry);
            await doc.ref.delete();
            results.movedToDLQ++;

            console.log(`[WEBHOOK_RETRY] ⚠️ Max attempts reached, moved to DLQ: ${entry.id}`);

          } else {
            // Schedule next retry with exponential backoff
            const nextDelay = DEFAULT_CONFIG.backoffSchedule[newAttempts] || 
              DEFAULT_CONFIG.backoffSchedule[DEFAULT_CONFIG.backoffSchedule.length - 1];

            await doc.ref.update({
              attempts: newAttempts,
              nextRetryAt: now + nextDelay,
              lastAttemptAt: now,
              updatedAt: now,
            });

            results.failed++;
            console.log(`[WEBHOOK_RETRY] ❌ Retry failed, scheduled next attempt: ${entry.id} (attempt ${newAttempts}/${entry.maxAttempts})`);
          }
        }

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.errors.push(`${entry.id}: ${errMsg}`);
        console.error(`[WEBHOOK_RETRY] Error processing retry ${entry.id}:`, error);
      }
    }

    return results;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    results.ok = false;
    results.errors.push(errMsg);
    console.error(`[WEBHOOK_RETRY] Error processing retry queue:`, error);
    return results;
  }
}

/**
 * Retry webhook processing by re-invoking the handler
 */
async function retryWebhookProcessing(entry: WebhookRetryEntry): Promise<boolean> {
  try {
    // Import handler to avoid circular dependency
    const { default: webhookHandler } = await import("@/pages/api/salla/webhook");

    // Reconstruct request object
    const mockReq = {
      method: "POST",
      headers: entry.headers,
      body: entry.rawBody,
    } as unknown as NextApiRequest;

    // Mock response object to capture result
    let statusCode = 0;
    const mockRes = {
      status: (code: number) => {
        statusCode = code;
        return mockRes;
      },
      json: () => mockRes,
      setHeader: () => mockRes,
    };

    // Call handler
    await webhookHandler(mockReq, mockRes as any);

    // Check if successful (2xx status code)
    return statusCode >= 200 && statusCode < 300;

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Retry processing failed:`, error);
    return false;
  }
}

/**
 * Move failed webhook to dead letter queue
 */
async function moveToDLQ(entry: WebhookRetryEntry): Promise<void> {
  if (!ENABLE_DLQ) {
    console.log(`[WEBHOOK_RETRY] DLQ disabled, not moving entry: ${entry.id}`);
    return;
  }

  try {
    const db = dbAdmin();
    const dlqId = `dlq_${entry.id}`;

    const dlqEntry: DeadLetterEntry = {
      id: dlqId,
      event: entry.event,
      merchant: entry.merchant,
      orderId: entry.orderId,
      rawBody: entry.rawBody,
      headers: entry.headers,
      
      totalAttempts: entry.attempts,
      errors: [{
        attempt: entry.attempts,
        timestamp: entry.lastAttemptAt || Date.now(),
        error: entry.lastError || "Unknown error",
      }],
      
      storeUid: entry.storeUid,
      priority: entry.priority,
      tags: entry.tags,
      
      failedAt: Date.now(),
      createdAt: entry.createdAt,
      
      reviewedAt: null,
      reviewedBy: null,
      resolution: null,
      notes: null,
    };

    await db.collection("webhook_dead_letter").doc(dlqId).set(dlqEntry);

    // Track metrics
    if (DEFAULT_CONFIG.enableMetrics) {
      await metrics.track({
        name: "webhook_moved_to_dlq",
        value: 1,
        labels: {
          event: entry.event,
          storeUid: entry.storeUid || "unknown",
          attempts: entry.attempts,
        },
      });
    }

    console.log(`[WEBHOOK_RETRY] Moved to DLQ: ${dlqId}`);

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Failed to move to DLQ:`, error);
    throw error;
  }
}

/* ===================== Manual Retry Operations ===================== */

/**
 * Manually retry a specific webhook from DLQ
 */
export async function manualRetryWebhook(
  dlqId: string,
  userId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = dbAdmin();
    const dlqDoc = await db.collection("webhook_dead_letter").doc(dlqId).get();

    if (!dlqDoc.exists) {
      return { ok: false, error: "Webhook not found in DLQ" };
    }

    const dlqEntry = dlqDoc.data() as DeadLetterEntry;

    // Move back to retry queue
    const retryResult = await enqueueWebhookRetry({
      event: dlqEntry.event,
      merchant: dlqEntry.merchant,
      orderId: dlqEntry.orderId,
      rawBody: dlqEntry.rawBody,
      headers: dlqEntry.headers,
      error: new Error("Manual retry"),
      storeUid: dlqEntry.storeUid,
      priority: "high", // Prioritize manual retries
    });

    if (retryResult.ok) {
      // Update DLQ entry
      await dlqDoc.ref.update({
        reviewedAt: Date.now(),
        reviewedBy: userId,
        resolution: "retried",
        notes: "Manually retried by admin",
      });

      console.log(`[WEBHOOK_RETRY] Manual retry initiated: ${dlqId} by ${userId}`);
      return { ok: true };
    }

    return { ok: false, error: retryResult.error };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK_RETRY] Manual retry failed:`, error);
    return { ok: false, error: errMsg };
  }
}

/**
 * Mark DLQ entry as resolved without retry
 */
export async function resolveDLQEntry(
  dlqId: string,
  userId: string,
  resolution: "ignored" | "manual_fix",
  notes?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = dbAdmin();
    const dlqDoc = await db.collection("webhook_dead_letter").doc(dlqId).get();

    if (!dlqDoc.exists) {
      return { ok: false, error: "Webhook not found in DLQ" };
    }

    await dlqDoc.ref.update({
      reviewedAt: Date.now(),
      reviewedBy: userId,
      resolution,
      notes: notes || null,
    });

    console.log(`[WEBHOOK_RETRY] DLQ entry resolved: ${dlqId} as ${resolution} by ${userId}`);
    return { ok: true };

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[WEBHOOK_RETRY] Failed to resolve DLQ entry:`, error);
    return { ok: false, error: errMsg };
  }
}

/* ===================== Query Operations ===================== */

/**
 * Get retry queue status
 */
export async function getRetryQueueStatus(): Promise<{
  ok: boolean;
  total: number;
  pending: number;
  scheduled: number;
  byPriority: Record<string, number>;
  oldestEntry: number | null;
}> {
  try {
    const db = dbAdmin();
    const now = Date.now();

    const allRetries = await db.collection("webhook_retry_queue").get();
    const total = allRetries.size;

    let pending = 0;
    let scheduled = 0;
    const byPriority: Record<string, number> = { high: 0, normal: 0, low: 0 };
    let oldestEntry: number | null = null;

    for (const doc of allRetries.docs) {
      const entry = doc.data() as WebhookRetryEntry;
      
      if (entry.nextRetryAt <= now) {
        pending++;
      } else {
        scheduled++;
      }

      byPriority[entry.priority] = (byPriority[entry.priority] || 0) + 1;

      if (oldestEntry === null || entry.createdAt < oldestEntry) {
        oldestEntry = entry.createdAt;
      }
    }

    return { ok: true, total, pending, scheduled, byPriority, oldestEntry };

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Failed to get queue status:`, error);
    return { ok: false, total: 0, pending: 0, scheduled: 0, byPriority: {}, oldestEntry: null };
  }
}

/**
 * Get DLQ status
 */
export async function getDLQStatus(): Promise<{
  ok: boolean;
  total: number;
  unreviewed: number;
  reviewed: number;
  byResolution: Record<string, number>;
  oldestEntry: number | null;
}> {
  try {
    const db = dbAdmin();

    const allDLQ = await db.collection("webhook_dead_letter").get();
    const total = allDLQ.size;

    let unreviewed = 0;
    let reviewed = 0;
    const byResolution: Record<string, number> = {};
    let oldestEntry: number | null = null;

    for (const doc of allDLQ.docs) {
      const entry = doc.data() as DeadLetterEntry;
      
      if (entry.reviewedAt) {
        reviewed++;
        const res = entry.resolution || "unknown";
        byResolution[res] = (byResolution[res] || 0) + 1;
      } else {
        unreviewed++;
      }

      if (oldestEntry === null || entry.failedAt < oldestEntry) {
        oldestEntry = entry.failedAt;
      }
    }

    return { ok: true, total, unreviewed, reviewed, byResolution, oldestEntry };

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Failed to get DLQ status:`, error);
    return { ok: false, total: 0, unreviewed: 0, reviewed: 0, byResolution: {}, oldestEntry: null };
  }
}

/**
 * List DLQ entries with pagination
 */
export async function listDLQEntries(params: {
  limit?: number;
  startAfter?: string;
  onlyUnreviewed?: boolean;
}): Promise<{
  ok: boolean;
  entries: DeadLetterEntry[];
  hasMore: boolean;
}> {
  try {
    const db = dbAdmin();
    const limit = params.limit || 50;

    let query = db.collection("webhook_dead_letter")
      .orderBy("failedAt", "desc")
      .limit(limit + 1);

    if (params.onlyUnreviewed) {
      query = query.where("reviewedAt", "==", null) as any;
    }

    if (params.startAfter) {
      const startDoc = await db.collection("webhook_dead_letter").doc(params.startAfter).get();
      if (startDoc.exists) {
        query = query.startAfter(startDoc) as any;
      }
    }

    const snapshot = await query.get();
    const entries = snapshot.docs.slice(0, limit).map(doc => doc.data() as DeadLetterEntry);
    const hasMore = snapshot.docs.length > limit;

    return { ok: true, entries, hasMore };

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Failed to list DLQ entries:`, error);
    return { ok: false, entries: [], hasMore: false };
  }
}

/* ===================== Cleanup Operations ===================== */

/**
 * Clean up old resolved DLQ entries
 */
export async function cleanupOldDLQEntries(
  olderThanDays: number = 90
): Promise<{ ok: boolean; deleted: number }> {
  try {
    const db = dbAdmin();
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);

    const oldEntries = await db
      .collection("webhook_dead_letter")
      .where("reviewedAt", "<=", cutoffTime)
      .limit(500)
      .get();

    const batch = db.batch();
    oldEntries.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[WEBHOOK_RETRY] Cleaned up ${oldEntries.size} old DLQ entries`);
    return { ok: true, deleted: oldEntries.size };

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Failed to cleanup DLQ:`, error);
    return { ok: false, deleted: 0 };
  }
}

/* ===================== Health Check ===================== */

/**
 * Check retry system health
 */
export async function checkRetrySystemHealth(): Promise<{
  ok: boolean;
  healthy: boolean;
  issues: string[];
  metrics: {
    retryQueueSize: number;
    dlqSize: number;
    oldestRetry: number | null;
    oldestDLQ: number | null;
  };
}> {
  const issues: string[] = [];

  try {
    const [retryStatus, dlqStatus] = await Promise.all([
      getRetryQueueStatus(),
      getDLQStatus(),
    ]);

    // Check for issues
    if (retryStatus.total > 1000) {
      issues.push(`Retry queue is large: ${retryStatus.total} entries`);
    }

    if (dlqStatus.total > 500) {
      issues.push(`DLQ is large: ${dlqStatus.total} entries`);
    }

    if (dlqStatus.unreviewed > 100) {
      issues.push(`Many unreviewed DLQ entries: ${dlqStatus.unreviewed}`);
    }

    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    if (retryStatus.oldestEntry && retryStatus.oldestEntry < oneDayAgo) {
      issues.push(`Old retry entries detected (older than 24h)`);
    }

    if (dlqStatus.oldestEntry && dlqStatus.oldestEntry < oneDayAgo && dlqStatus.unreviewed > 0) {
      issues.push(`Unreviewed DLQ entries older than 24h`);
    }

    const healthy = issues.length === 0;

    return {
      ok: true,
      healthy,
      issues,
      metrics: {
        retryQueueSize: retryStatus.total,
        dlqSize: dlqStatus.total,
        oldestRetry: retryStatus.oldestEntry,
        oldestDLQ: dlqStatus.oldestEntry,
      },
    };

  } catch (error) {
    console.error(`[WEBHOOK_RETRY] Health check failed:`, error);
    return {
      ok: false,
      healthy: false,
      issues: ["Health check failed"],
      metrics: {
        retryQueueSize: 0,
        dlqSize: 0,
        oldestRetry: null,
        oldestDLQ: null,
      },
    };
  }
}
