// src/server/sync/common.ts

/**
 * Common Sync Utilities
 * 
 * Shared logic for review synchronization across different platforms.
 * Reduces code duplication between manual and cron sync functions.
 */

import { dbAdmin } from "@/lib/firebaseAdmin";
import { metrics } from "@/server/monitoring/metrics";
import type { Timestamp } from "firebase-admin/firestore";

export interface SyncResult {
  success: boolean;
  storeUid?: string;
  reviewsFound?: number;
  newReviews?: number;
  updatedReviews?: number;
  error?: string;
  duration?: number;
}

export interface SyncOptions {
  storeUid: string;
  incremental?: boolean;
  limit?: number;
  fetchReviews: (storeUid: string, lastSyncTime?: number) => Promise<any[]>;
}

/**
 * Get last sync timestamp for a store
 */
export async function getLastSyncTime(storeUid: string): Promise<number | null> {
  try {
    const db = dbAdmin();
    const storeDoc = await db.collection("stores").doc(storeUid).get();
    
    if (!storeDoc.exists) return null;
    
    const data = storeDoc.data();
    const lastSync = data?.lastReviewsSyncAt;
    
    if (!lastSync) return null;
    
    // Handle Firestore Timestamp
    if (typeof lastSync === "object" && "toMillis" in lastSync) {
      return (lastSync as Timestamp).toMillis();
    }
    
    // Handle number timestamp
    if (typeof lastSync === "number") {
      return lastSync;
    }
    
    return null;
  } catch (error) {
    console.error(`[SYNC_COMMON] Failed to get last sync time for ${storeUid}:`, error);
    return null;
  }
}

/**
 * Update sync statistics for a store
 */
export async function updateSyncStats(
  storeUid: string,
  stats: {
    reviewsFound?: number;
    newReviews?: number;
    updatedReviews?: number;
    lastSyncAt?: number;
    success?: boolean;
    error?: string;
  }
): Promise<void> {
  try {
    const db = dbAdmin();
    const storeRef = db.collection("stores").doc(storeUid);
    
    const updates: Record<string, any> = {
      lastReviewsSyncAt: stats.lastSyncAt || Date.now(),
      updatedAt: Date.now(),
    };
    
    if (stats.reviewsFound !== undefined) {
      updates.totalReviews = stats.reviewsFound;
    }
    
    if (stats.newReviews !== undefined || stats.updatedReviews !== undefined) {
      updates.lastSyncStats = {
        newReviews: stats.newReviews || 0,
        updatedReviews: stats.updatedReviews || 0,
        timestamp: Date.now(),
        success: stats.success !== false,
        error: stats.error || null,
      };
    }
    
    await storeRef.set(updates, { merge: true });
    
  } catch (error) {
    // Log but don't throw - sync stats update failure shouldn't break the sync
    console.error(`[SYNC_COMMON] Failed to update sync stats for ${storeUid}:`, error);
    
    // Track metric for failed stats update
    await metrics.track({
      name: "sync_stats_update_failed",
      value: 1,
      labels: { storeUid, error: (error as Error).message },
    });
  }
}

/**
 * Process and save reviews from external source
 */
export async function processReviews(
  storeUid: string,
  externalReviews: any[],
  mapReviewFn: (review: any) => any
): Promise<{ newReviews: number; updatedReviews: number }> {
  const db = dbAdmin();
  let newReviews = 0;
  let updatedReviews = 0;
  
  for (const extReview of externalReviews) {
    try {
      const reviewData = mapReviewFn(extReview);
      
      if (!reviewData || !reviewData.externalId) {
        console.warn(`[SYNC_COMMON] Invalid review data, skipping`);
        continue;
      }
      
      // Query by external ID
      const existingQuery = await db
        .collection("reviews")
        .where("storeUid", "==", storeUid)
        .where("externalId", "==", reviewData.externalId)
        .limit(1)
        .get();
      
      if (existingQuery.empty) {
        // New review
        await db.collection("reviews").add({
          ...reviewData,
          storeUid,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        newReviews++;
      } else {
        // Update existing review
        const existingDoc = existingQuery.docs[0];
        await existingDoc.ref.set(
          {
            ...reviewData,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        updatedReviews++;
      }
      
    } catch (error) {
      console.error(`[SYNC_COMMON] Failed to process review:`, error);
    }
  }
  
  return { newReviews, updatedReviews };
}

/**
 * Generic sync function
 * Handles incremental sync, error tracking, and metrics
 */
export async function performSync(options: SyncOptions): Promise<SyncResult> {
  const startTime = Date.now();
  const { storeUid, incremental = true, limit, fetchReviews } = options;
  
  try {
    // Get last sync time if incremental
    let lastSyncTime: number | null = null;
    if (incremental) {
      lastSyncTime = await getLastSyncTime(storeUid);
    }
    
    // Fetch reviews from external source
    const externalReviews = await fetchReviews(storeUid, lastSyncTime || undefined);
    
    if (!externalReviews || externalReviews.length === 0) {
      const duration = Date.now() - startTime;
      
      // Update sync stats even if no reviews
      await updateSyncStats(storeUid, {
        reviewsFound: 0,
        newReviews: 0,
        updatedReviews: 0,
        lastSyncAt: Date.now(),
        success: true,
      });
      
      return {
        success: true,
        storeUid,
        reviewsFound: 0,
        newReviews: 0,
        updatedReviews: 0,
        duration,
      };
    }
    
    // Limit reviews if specified
    const reviewsToProcess = limit
      ? externalReviews.slice(0, limit)
      : externalReviews;
    
    const duration = Date.now() - startTime;
    
    // Track sync metric
    await metrics.track({
      name: "reviews_sync_completed",
      value: reviewsToProcess.length,
      labels: {
        storeUid,
        incremental: incremental.toString(),
        duration: duration.toString(),
      },
    });
    
    return {
      success: true,
      storeUid,
      reviewsFound: reviewsToProcess.length,
      duration,
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    console.error(`[SYNC_COMMON] Sync failed for ${storeUid}:`, error);
    
    // Track error metric
    await metrics.track({
      name: "reviews_sync_failed",
      value: 1,
      labels: {
        storeUid,
        error: errorMessage,
        duration: duration.toString(),
      },
    });
    
    // Update sync stats with error
    await updateSyncStats(storeUid, {
      lastSyncAt: Date.now(),
      success: false,
      error: errorMessage,
    });
    
    return {
      success: false,
      storeUid,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * Batch sync multiple stores
 */
export async function batchSync(
  storeUids: string[],
  syncFn: (storeUid: string) => Promise<SyncResult>
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  
  for (const storeUid of storeUids) {
    try {
      const result = await syncFn(storeUid);
      results.push(result);
    } catch (error) {
      console.error(`[SYNC_COMMON] Batch sync failed for ${storeUid}:`, error);
      results.push({
        success: false,
        storeUid,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  
  return results;
}

/**
 * Log sync summary
 */
export function logSyncSummary(results: SyncResult[]): void {
  const total = results.length;
  const successful = results.filter((r) => r.success).length;
  const failed = total - successful;
  const totalReviews = results.reduce((sum, r) => sum + (r.reviewsFound || 0), 0);
  const totalNew = results.reduce((sum, r) => sum + (r.newReviews || 0), 0);
  const totalUpdated = results.reduce((sum, r) => sum + (r.updatedReviews || 0), 0);
  const avgDuration = results.length > 0
    ? results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length
    : 0;
  
  console.log(`[SYNC_SUMMARY] ========================================`);
  console.log(`[SYNC_SUMMARY] Total Stores: ${total}`);
  console.log(`[SYNC_SUMMARY] Successful: ${successful}`);
  console.log(`[SYNC_SUMMARY] Failed: ${failed}`);
  console.log(`[SYNC_SUMMARY] Total Reviews Found: ${totalReviews}`);
  console.log(`[SYNC_SUMMARY] New Reviews: ${totalNew}`);
  console.log(`[SYNC_SUMMARY] Updated Reviews: ${totalUpdated}`);
  console.log(`[SYNC_SUMMARY] Avg Duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`[SYNC_SUMMARY] ========================================`);
}
