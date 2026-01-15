/**
 * User Activity Tracking System
 * ==============================
 * 
 * Purpose: Track user actions for analytics and behavior analysis
 * Features:
 * - Page views, API calls, feature usage
 * - User engagement metrics (DAU/MAU)
 * - Retention and churn analysis
 * - Admin activity monitoring
 * 
 * Privacy:
 * - IP anonymization (GDPR compliant)
 * - No PII stored in activity logs
 * - 90-day retention policy
 */

import type { NextApiRequest } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { metrics } from "@/server/monitoring/metrics";

// ============================================================================
// Types
// ============================================================================

export type ActivityAction = 
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  | "auth.password_reset"
  | "dashboard.view"
  | "reviews.view"
  | "reviews.sync"
  | "reviews.approve"
  | "reviews.reject"
  | "reviews.delete"
  | "settings.view"
  | "settings.update"
  | "widget.install"
  | "widget.customize"
  | "subscription.view"
  | "subscription.upgrade"
  | "subscription.cancel"
  | "api.call"
  | "admin.access"
  | "admin.user_view"
  | "admin.store_view";

export interface ActivityEvent {
  userId?: string;
  storeUid?: string;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  referrer?: string;
  timestamp: number;
}

interface TrackOptions {
  userId?: string;
  storeUid?: string;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  req?: NextApiRequest;
}

// ============================================================================
// Configuration
// ============================================================================

const RETENTION_DAYS = 90;
const BATCH_SIZE = 100;
const ENABLE_TRACKING = process.env.ENABLE_ACTIVITY_TRACKING !== "false"; // Enabled by default

// ============================================================================
// IP Anonymization (GDPR Compliance)
// ============================================================================

/**
 * Anonymize IP address for privacy
 * IPv4: 192.168.1.100 -> 192.168.1.0
 * IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334 -> 2001:0db8:85a3:0000::
 */
function anonymizeIP(ip: string): string {
  if (ip.includes(':')) {
    // IPv6 - keep first 4 segments
    const parts = ip.split(':');
    return parts.slice(0, 4).join(':') + '::';
  } else {
    // IPv4 - zero out last octet
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }
  return ip;
}

/**
 * Extract client IP from request
 */
function getClientIP(req: NextApiRequest): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return anonymizeIP(ip.trim());
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return anonymizeIP(realIP.trim());
  }
  
  if (req.socket.remoteAddress) {
    return anonymizeIP(req.socket.remoteAddress);
  }
  
  return undefined;
}

// ============================================================================
// Core Tracking Functions
// ============================================================================

/**
 * Track user activity event
 */
export async function trackActivity(options: TrackOptions): Promise<void> {
  if (!ENABLE_TRACKING) {
    return;
  }

  try {
    const now = Date.now();
    const db = dbAdmin();

    // Build activity event
    const event: ActivityEvent = {
      userId: options.userId,
      storeUid: options.storeUid,
      action: options.action,
      metadata: options.metadata || {},
      timestamp: now,
    };

    // Add request context if available
    if (options.req) {
      event.ip = getClientIP(options.req);
      const userAgent = options.req.headers['user-agent'];
      event.userAgent = typeof userAgent === 'string' ? userAgent : undefined;
      const referer = options.req.headers['referer'] || options.req.headers['referrer'];
      event.referrer = typeof referer === 'string' ? referer : undefined;
    }

    // Save to Firestore (fire and forget)
    db.collection('user_activity').add(event).catch(err => {
      console.error('[ActivityTracker] Failed to save activity:', err);
    });

    // Track in metrics for real-time monitoring
    await metrics.track({
      type: 'auth_event',
      severity: 'info',
      userId: options.userId,
      storeUid: options.storeUid,
      metadata: {
        action: options.action,
        ...options.metadata
      }
    });

  } catch (error) {
    // Don't fail the request if tracking fails
    console.error('[ActivityTracker] Error:', error);
  }
}

/**
 * Track page view
 */
export async function trackPageView(options: {
  userId?: string;
  storeUid?: string;
  page: string;
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: 'dashboard.view',
    metadata: { page: options.page },
    req: options.req
  });
}

/**
 * Track authentication event
 */
export async function trackAuth(options: {
  userId: string;
  storeUid?: string;
  action: 'login' | 'logout' | 'signup' | 'password_reset';
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: `auth.${options.action}` as ActivityAction,
    req: options.req
  });
}

/**
 * Track review action
 */
export async function trackReviewAction(options: {
  userId: string;
  storeUid: string;
  action: 'view' | 'sync' | 'approve' | 'reject' | 'delete';
  reviewId?: string;
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: `reviews.${options.action}` as ActivityAction,
    metadata: options.reviewId ? { reviewId: options.reviewId } : undefined,
    req: options.req
  });
}

/**
 * Track settings change
 */
export async function trackSettingsChange(options: {
  userId: string;
  storeUid: string;
  action: 'view' | 'update';
  section?: string;
  changes?: string[];
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: `settings.${options.action}` as ActivityAction,
    metadata: {
      section: options.section,
      changes: options.changes
    },
    req: options.req
  });
}

/**
 * Track subscription event
 */
export async function trackSubscription(options: {
  userId: string;
  storeUid: string;
  action: 'view' | 'upgrade' | 'cancel';
  fromPlan?: string;
  toPlan?: string;
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: `subscription.${options.action}` as ActivityAction,
    metadata: {
      fromPlan: options.fromPlan,
      toPlan: options.toPlan
    },
    req: options.req
  });
}

/**
 * Track API call
 */
export async function trackApiCall(options: {
  userId?: string;
  storeUid?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  duration?: number;
  req?: NextApiRequest;
}): Promise<void> {
  await trackActivity({
    userId: options.userId,
    storeUid: options.storeUid,
    action: 'api.call',
    metadata: {
      endpoint: options.endpoint,
      method: options.method,
      statusCode: options.statusCode,
      duration: options.duration
    },
    req: options.req
  });
}

// ============================================================================
// Analytics Queries
// ============================================================================

/**
 * Get Daily Active Users (DAU)
 */
export async function getDailyActiveUsers(date?: Date): Promise<number> {
  const db = dbAdmin();
  const targetDate = date || new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const snapshot = await db.collection('user_activity')
    .where('timestamp', '>=', startOfDay.getTime())
    .where('timestamp', '<=', endOfDay.getTime())
    .get();

  const uniqueUsers = new Set<string>();
  snapshot.docs.forEach(doc => {
    const userId = doc.data().userId;
    if (userId) uniqueUsers.add(userId);
  });

  return uniqueUsers.size;
}

/**
 * Get Monthly Active Users (MAU)
 */
export async function getMonthlyActiveUsers(date?: Date): Promise<number> {
  const db = dbAdmin();
  const targetDate = date || new Date();
  const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);

  const snapshot = await db.collection('user_activity')
    .where('timestamp', '>=', startOfMonth.getTime())
    .where('timestamp', '<=', endOfMonth.getTime())
    .get();

  const uniqueUsers = new Set<string>();
  snapshot.docs.forEach(doc => {
    const userId = doc.data().userId;
    if (userId) uniqueUsers.add(userId);
  });

  return uniqueUsers.size;
}

/**
 * Get feature usage statistics
 */
export async function getFeatureUsage(options: {
  startDate: Date;
  endDate: Date;
  action?: ActivityAction;
}): Promise<Map<ActivityAction, number>> {
  const db = dbAdmin();
  
  let query = db.collection('user_activity')
    .where('timestamp', '>=', options.startDate.getTime())
    .where('timestamp', '<=', options.endDate.getTime());

  if (options.action) {
    query = query.where('action', '==', options.action);
  }

  const snapshot = await query.get();
  
  const usage = new Map<ActivityAction, number>();
  snapshot.docs.forEach(doc => {
    const action = doc.data().action as ActivityAction;
    usage.set(action, (usage.get(action) || 0) + 1);
  });

  return usage;
}

/**
 * Get user activity timeline
 */
export async function getUserActivityTimeline(options: {
  userId: string;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const db = dbAdmin();
  
  const snapshot = await db.collection('user_activity')
    .where('userId', '==', options.userId)
    .orderBy('timestamp', 'desc')
    .limit(options.limit || 100)
    .get();

  return snapshot.docs.map(doc => doc.data() as ActivityEvent);
}

/**
 * Get store activity timeline
 */
export async function getStoreActivityTimeline(options: {
  storeUid: string;
  limit?: number;
}): Promise<ActivityEvent[]> {
  const db = dbAdmin();
  
  const snapshot = await db.collection('user_activity')
    .where('storeUid', '==', options.storeUid)
    .orderBy('timestamp', 'desc')
    .limit(options.limit || 100)
    .get();

  return snapshot.docs.map(doc => doc.data() as ActivityEvent);
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up old activity logs (90+ days)
 * Should be run by a scheduled function
 */
export async function cleanupOldActivity(): Promise<{ deleted: number }> {
  const db = dbAdmin();
  const cutoffDate = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const snapshot = await db.collection('user_activity')
    .where('timestamp', '<', cutoffDate)
    .limit(BATCH_SIZE)
    .get();

  if (snapshot.empty) {
    return { deleted: 0 };
  }

  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  console.log(`[ActivityTracker] Cleaned up ${snapshot.size} old activity logs`);

  return { deleted: snapshot.size };
}

/**
 * Get retention rate for a cohort
 */
export async function getRetentionRate(options: {
  cohortStartDate: Date;
  cohortEndDate: Date;
  checkDate: Date;
}): Promise<number> {
  const db = dbAdmin();

  // Get users who signed up in the cohort period
  const cohortSnapshot = await db.collection('user_activity')
    .where('action', '==', 'auth.signup')
    .where('timestamp', '>=', options.cohortStartDate.getTime())
    .where('timestamp', '<=', options.cohortEndDate.getTime())
    .get();

  const cohortUsers = new Set<string>();
  cohortSnapshot.docs.forEach(doc => {
    const userId = doc.data().userId;
    if (userId) cohortUsers.add(userId);
  });

  if (cohortUsers.size === 0) return 0;

  // Get users who were active on check date
  const checkDayStart = new Date(options.checkDate);
  checkDayStart.setHours(0, 0, 0, 0);
  const checkDayEnd = new Date(options.checkDate);
  checkDayEnd.setHours(23, 59, 59, 999);

  const activeSnapshot = await db.collection('user_activity')
    .where('timestamp', '>=', checkDayStart.getTime())
    .where('timestamp', '<=', checkDayEnd.getTime())
    .get();

  const activeUsers = new Set<string>();
  activeSnapshot.docs.forEach(doc => {
    const userId = doc.data().userId;
    if (userId && cohortUsers.has(userId)) {
      activeUsers.add(userId);
    }
  });

  return (activeUsers.size / cohortUsers.size) * 100;
}
