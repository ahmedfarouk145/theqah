/**
 * Subscription Quota Checker
 * 
 * Enforces subscription limits across the application
 * Prevents users from exceeding their plan quotas
 * 
 * Pricing Model (Launch Offer):
 * - TRIAL: Free trial with 10 reviews for testing
 * - PAID: Single paid plan with 1,000 reviews/month
 *   - Monthly: 21 SAR/month (30% discount from 30 SAR)
 *   - Annual: 210 SAR/year (42% discount, 17.5 SAR/month)
 * 
 * Fair Use Policy: Up to 1,000 reviews per month
 */

import type { Firestore } from 'firebase-admin/firestore';
import { Errors } from '@/server/errors/error-handler';

export type PlanCode = 'TRIAL' | 'PAID_MONTHLY' | 'PAID_ANNUAL';

export interface SubscriptionQuota {
  plan: PlanCode;
  monthlyReviews: number;
  reviewsUsed: number;
  reviewsRemaining: number;
  billingCycle?: 'monthly' | 'annual';
  monthAnchor?: string;
  isActive: boolean;
  price?: { amount: number; currency: 'SAR' };
}

/**
 * Plan limits configuration
 * Launch offer: One plan, all features, 1,000 reviews/month
 */
export const PLAN_LIMITS: Record<PlanCode, { 
  monthlyReviews: number; 
  price: { amount: number; currency: 'SAR' };
  billingCycle: 'monthly' | 'annual' | 'trial';
}> = {
  TRIAL: { 
    monthlyReviews: 10, 
    price: { amount: 0, currency: 'SAR' },
    billingCycle: 'trial'
  },
  PAID_MONTHLY: { 
    monthlyReviews: 1000, 
    price: { amount: 21, currency: 'SAR' }, // 30% discount (from 30 SAR)
    billingCycle: 'monthly'
  },
  PAID_ANNUAL: { 
    monthlyReviews: 1000, 
    price: { amount: 210, currency: 'SAR' }, // 42% discount (17.5 SAR/month)
    billingCycle: 'annual'
  },
};

/**
 * Get subscription quota for a store
 */
export async function getSubscriptionQuota(
  db: Firestore,
  storeUid: string
): Promise<SubscriptionQuota> {
  const storeDoc = await db.collection('stores').doc(storeUid).get();
  
  if (!storeDoc.exists) {
    throw Errors.notFound('Store');
  }

  const storeData = storeDoc.data();
  const plan = storeData?.subscription?.plan || { code: 'TRIAL', active: false };
  const usage = storeData?.subscription?.usage || { reviewsUsed: 0 };
  
  const planCode = plan.code as PlanCode;
  const planConfig = PLAN_LIMITS[planCode] || PLAN_LIMITS.TRIAL;

  const reviewsUsed = usage.reviewsUsed || 0;
  const monthlyReviews = planConfig.monthlyReviews;
  const reviewsRemaining = Math.max(0, monthlyReviews - reviewsUsed);

  return {
    plan: planCode,
    monthlyReviews,
    reviewsUsed,
    reviewsRemaining,
    billingCycle: planConfig.billingCycle === 'trial' ? undefined : planConfig.billingCycle,
    monthAnchor: usage.monthAnchor,
    isActive: plan.active === true,
    price: planConfig.price,
  };
}

/**
 * Check if store can send review invites
 */
export async function canSendInvites(
  db: Firestore,
  storeUid: string,
  count: number = 1
): Promise<{ allowed: boolean; reason?: string; quota?: SubscriptionQuota }> {
  const quota = await getSubscriptionQuota(db, storeUid);

  // Check if subscription is active
  if (!quota.isActive) {
    return {
      allowed: false,
      reason: 'subscription_inactive',
      quota,
    };
  }

  // Check if within quota (1,000 reviews/month for paid plans)
  if (quota.reviewsRemaining < count) {
    return {
      allowed: false,
      reason: 'quota_exceeded',
      quota,
    };
  }

  return { allowed: true, quota };
}

/**
 * Reserve quota for review invites
 * Returns updated quota after reservation
 * 
 * Fair Use: Up to 1,000 reviews/month per paid subscription
 */
export async function reserveInviteQuota(
  db: Firestore,
  storeUid: string,
  count: number = 1
): Promise<SubscriptionQuota> {
  const check = await canSendInvites(db, storeUid, count);

  if (!check.allowed) {
    if (check.reason === 'subscription_inactive') {
      throw Errors.forbidden('الاشتراك غير نشط. يرجى تفعيل الاشتراك للمتابعة.');
    }
    if (check.reason === 'quota_exceeded') {
      throw Errors.quotaExceeded(
        `تم الوصول للحد الشهري (${check.quota?.reviewsUsed}/${check.quota?.monthlyReviews} مراجعة). يتم التجديد في بداية الشهر القادم.`
      );
    }
    throw Errors.forbidden('لا يمكن إرسال الدعوات');
  }

  // Increment usage atomically
  const storeRef = db.collection('stores').doc(storeUid);
  
  await db.runTransaction(async (tx) => {
    const storeDoc = await tx.get(storeRef);
    if (!storeDoc.exists) {
      throw Errors.notFound('Store');
    }

    const currentUsage = storeDoc.data()?.subscription?.usage?.reviewsUsed || 0;
    const newUsage = currentUsage + count;

    tx.update(storeRef, {
      'subscription.usage.reviewsUsed': newUsage,
      'subscription.usage.lastUpdatedAt': Date.now(),
    });
  });

  // Return updated quota
  return await getSubscriptionQuota(db, storeUid);
}

/**
 * Check if store can create reviews
 */
export async function canCreateReview(
  db: Firestore,
  storeUid: string
): Promise<{ allowed: boolean; reason?: string }> {
  const storeDoc = await db.collection('stores').doc(storeUid).get();
  
  if (!storeDoc.exists) {
    return { allowed: false, reason: 'store_not_found' };
  }

  const storeData = storeDoc.data();
  const plan = storeData?.subscription?.plan;

  // Review creation is always allowed regardless of plan
  // Only invite sending is quota-limited
  return { allowed: true };
}

/**
 * Check if store can sync reviews
 */
export async function canSyncReviews(
  db: Firestore,
  storeUid: string
): Promise<{ allowed: boolean; reason?: string }> {
  const storeDoc = await db.collection('stores').doc(storeUid).get();
  
  if (!storeDoc.exists) {
    return { allowed: false, reason: 'store_not_found' };
  }

  const storeData = storeDoc.data();
  const connected = storeData?.salla?.connected || storeData?.zid?.connected;

  if (!connected) {
    return { allowed: false, reason: 'store_not_connected' };
  }

  // Review sync is always allowed for connected stores
  return { allowed: true };
}

/**
 * Reset monthly quota (called by cron on 1st of month)
 * Resets review count for new billing period
 */
export async function resetMonthlyQuota(
  db: Firestore,
  storeUid: string,
  monthAnchor?: string
): Promise<void> {
  const storeRef = db.collection('stores').doc(storeUid);
  
  await storeRef.update({
    'subscription.usage.reviewsUsed': 0,
    'subscription.usage.monthAnchor': monthAnchor || new Date().toISOString().slice(0, 7), // YYYY-MM
    'subscription.usage.resetAt': Date.now(),
  });
}

/**
 * Get quota usage summary for admin dashboard
 */
export async function getQuotaSummary(
  db: Firestore,
  storeUid: string
): Promise<{
  plan: PlanCode;
  quota: SubscriptionQuota;
  pricing: { amount: number; currency: string; cycle: string };
  usage: {
    reviews: { used: number; limit: number; percentage: number };
    totalReviews: number;
  };
}> {
  const quota = await getSubscriptionQuota(db, storeUid);

  // Get total review count
  const reviewsSnap = await db
    .collection('reviews')
    .where('storeUid', '==', storeUid)
    .count()
    .get();

  const totalReviewCount = reviewsSnap.data().count;

  const reviewPercentage = Math.round((quota.reviewsUsed / quota.monthlyReviews) * 100);

  const planConfig = PLAN_LIMITS[quota.plan];
  const billingCycle = planConfig.billingCycle === 'annual' 
    ? 'سنوي (210 ريال)' 
    : planConfig.billingCycle === 'monthly' 
      ? 'شهري (21 ريال)' 
      : 'تجريبي';

  return {
    plan: quota.plan,
    quota,
    pricing: {
      amount: planConfig.price.amount,
      currency: planConfig.price.currency,
      cycle: billingCycle,
    },
    usage: {
      reviews: {
        used: quota.reviewsUsed,
        limit: quota.monthlyReviews,
        percentage: reviewPercentage,
      },
      totalReviews: totalReviewCount,
    },
  };
}

/**
 * Validate subscription before operation
 * Throws error if not allowed
 */
export async function requireActiveSubscription(
  db: Firestore,
  storeUid: string
): Promise<void> {
  const quota = await getSubscriptionQuota(db, storeUid);

  if (!quota.isActive) {
    throw Errors.forbidden('الاشتراك مطلوب. يرجى الاشتراك في الباقة للمتابعة.');
  }
}

/**
 * Validate review quota before operation
 * Throws error if quota exceeded
 */
export async function requireInviteQuota(
  db: Firestore,
  storeUid: string,
  count: number = 1
): Promise<void> {
  const check = await canSendInvites(db, storeUid, count);

  if (!check.allowed) {
    if (check.reason === 'subscription_inactive') {
      throw Errors.forbidden('الاشتراك غير نشط. يرجى تفعيل الاشتراك للمتابعة.');
    }
    if (check.reason === 'quota_exceeded') {
      throw Errors.quotaExceeded(
        `تم الوصول للحد الشهري (${check.quota?.reviewsUsed}/${check.quota?.monthlyReviews} مراجعة). يتم التجديد في بداية الشهر القادم.`
      );
    }
    throw Errors.forbidden('لا يمكن إرسال الدعوات');
  }
}
