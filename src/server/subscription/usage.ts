/**
 * Subscription Usage Tracking
 * 
 * Simplified usage tracking for reviews only
 * Note: Salla removed invite system, we now track reviews directly
 * 
 * Legacy invite functions are kept for backward compatibility but are deprecated
 */

import { dbAdmin } from "@/lib/firebaseAdmin";
import { 
  canAddReviews, 
  reserveReviewQuota, 
  getSubscriptionQuota
  // Legacy imports removed - use canAddReviews/reserveReviewQuota instead
} from "./quota-checker";

// Helper to get month key for quota tracking
// @unused - kept for potential future use
// function monthKey(ts: number = Date.now()): string {
//   const d = new Date(ts);
//   const y = d.getUTCFullYear();
//   const m = String(d.getUTCMonth() + 1).padStart(2, "0");
//   return `${y}-${m}`;
// }

/**
 * Track review creation and increment quota
 * Call this when a review is created or synced from Salla
 */
export async function onReviewCreated(storeUid: string, count: number = 1) {
  console.log(`[USAGE] Recording ${count} review(s) for store: ${storeUid}`);
  const db = dbAdmin();
  
  try {
    // Use quota system - this will increment atomically and check limits
    await reserveReviewQuota(db, storeUid, count);
    console.log(`[USAGE] ✅ Review quota reserved successfully`);
  } catch (error) {
    console.error(`[USAGE] ❌ Failed to reserve quota:`, error);
    throw error; // Re-throw to prevent review from being created
  }
}

/**
 * Check if store can add reviews
 * Uses new quota-checker system
 */
export async function canAddReview(storeUid: string, count: number = 1): Promise<{ ok: boolean; reason?: string }> {
  console.log(`[USAGE] Checking review permission for store: ${storeUid}`);
  const db = dbAdmin();
  
  try {
    const check = await canAddReviews(db, storeUid, count);
    
    if (!check.allowed) {
      console.log(`[USAGE] ❌ Review blocked: ${check.reason}`);
      return { 
        ok: false, 
        reason: check.reason === 'quota_exceeded' 
          ? `حد الاستخدام الشهري (${check.quota?.reviewsUsed}/${check.quota?.monthlyReviews})`
          : check.reason === 'subscription_inactive'
            ? 'الاشتراك غير نشط'
            : 'غير مسموح'
      };
    }
    
    console.log(`[USAGE] ✅ Review allowed (${check.quota?.reviewsRemaining} remaining)`);
    return { ok: true };
  } catch (error) {
    console.error(`[USAGE] ❌ Error checking quota:`, error);
    return { ok: false, reason: 'خطأ في فحص الحصة' };
  }
}

/**
 * Get current usage statistics for a store
 */
export async function getUsageStats(storeUid: string) {
  const db = dbAdmin();
  const quota = await getSubscriptionQuota(db, storeUid);
  
  return {
    plan: quota.plan,
    billingCycle: quota.billingCycle,
    reviews: {
      used: quota.reviewsUsed,
      limit: quota.monthlyReviews,
      remaining: quota.reviewsRemaining,
      percentage: Math.round((quota.reviewsUsed / quota.monthlyReviews) * 100),
    },
    isActive: quota.isActive,
    monthAnchor: quota.monthAnchor,
  };
}

/**
 * @deprecated Salla removed invite system. Use onReviewCreated instead.
 */
export async function onInviteSent(storeUid: string) {
  console.warn('[USAGE] onInviteSent is deprecated. Use onReviewCreated instead.');
  return onReviewCreated(storeUid, 1);
}

/**
 * @deprecated Salla removed invite system. Use canAddReview instead.
 */
export async function canSendInvite(storeUid: string): Promise<{ ok: boolean; reason?: string }> {
  console.warn('[USAGE] canSendInvite is deprecated. Use canAddReview instead.');
  return canAddReview(storeUid, 1);
}
