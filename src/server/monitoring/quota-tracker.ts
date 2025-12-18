// src/server/monitoring/quota-tracker.ts

/**
 * Firestore Quota Monitoring System
 * 
 * Tracks Firestore read/write operations to monitor quota usage
 * and prevent exceeding free tier limits (50K reads/20K writes per day).
 * 
 * Features:
 * - Real-time quota tracking
 * - Daily usage statistics
 * - Alert thresholds (80%, 90%, 95%)
 * - Projection to estimate when quota will be exceeded
 * - Integration with metrics system
 */

import { dbAdmin } from "@/lib/firebaseAdmin";
import { metrics } from "./metrics";

/* ===================== Types ===================== */

export interface QuotaStats {
  date: string; // YYYY-MM-DD
  reads: number;
  writes: number;
  deletes: number;
  timestamp: number;
}

export interface QuotaStatus {
  current: QuotaStats;
  limits: {
    reads: number;
    writes: number;
  };
  usage: {
    readsPercent: number;
    writesPercent: number;
  };
  alerts: QuotaAlert[];
  projection: {
    estimatedDailyReads: number;
    estimatedDailyWrites: number;
    willExceedReads: boolean;
    willExceedWrites: boolean;
  };
}

export interface QuotaAlert {
  type: "reads" | "writes";
  level: "warning" | "critical" | "danger";
  threshold: number;
  current: number;
  limit: number;
  message: string;
}

/* ===================== Configuration ===================== */

// Firestore Free Tier Limits (per day)
const FREE_TIER_LIMITS = {
  reads: 50000, // 50K reads/day
  writes: 20000, // 20K writes/day
  deletes: 20000, // 20K deletes/day (counted as writes)
};

// Alert thresholds (percentage of quota used)
const ALERT_THRESHOLDS = {
  warning: 80, // 80% used
  critical: 90, // 90% used
  danger: 95, // 95% used
};

// Enable/disable tracking
const ENABLE_QUOTA_TRACKING = process.env.ENABLE_QUOTA_TRACKING !== "false";

/* ===================== Quota Tracking ===================== */

/**
 * Track a Firestore operation
 */
export async function trackOperation(params: {
  type: "read" | "write" | "delete";
  count?: number;
  collection?: string;
  operation?: string;
}): Promise<void> {
  if (!ENABLE_QUOTA_TRACKING) return;

  try {
    const db = dbAdmin();
    const now = Date.now();
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const quotaRef = db.collection("quota_tracking").doc(today);

    // Increment counter for the operation type
    const increment = params.count || 1;
    const updates: Record<string, unknown> = {
      timestamp: now,
    };

    if (params.type === "read") {
      updates.reads = (await quotaRef.get()).data()?.reads || 0 + increment;
    } else if (params.type === "write") {
      updates.writes = (await quotaRef.get()).data()?.writes || 0 + increment;
    } else if (params.type === "delete") {
      updates.deletes = (await quotaRef.get()).data()?.deletes || 0 + increment;
      updates.writes = (await quotaRef.get()).data()?.writes || 0 + increment; // Deletes count as writes
    }

    await quotaRef.set(
      {
        date: today,
        ...updates,
      },
      { merge: true }
    );

    // Track in metrics for real-time monitoring
    await metrics.track({
      type: "database",
      severity: "info",
      metadata: {
        collection: params.collection || "unknown",
        operation: params.operation || "unknown",
      },
    });

  } catch (error) {
    console.error("[QUOTA_TRACKER] Failed to track operation:", error);
  }
}

/**
 * Get current quota status
 */
export async function getQuotaStatus(): Promise<QuotaStatus> {
  try {
    const db = dbAdmin();
    const today = new Date().toISOString().split("T")[0];

    const quotaDoc = await db.collection("quota_tracking").doc(today).get();
    const quotaData = quotaDoc.data() as QuotaStats | undefined;

    const current: QuotaStats = {
      date: today,
      reads: quotaData?.reads || 0,
      writes: quotaData?.writes || 0,
      deletes: quotaData?.deletes || 0,
      timestamp: quotaData?.timestamp || Date.now(),
    };

    const readsPercent = (current.reads / FREE_TIER_LIMITS.reads) * 100;
    const writesPercent = (current.writes / FREE_TIER_LIMITS.writes) * 100;

    const alerts = generateAlerts(current);

    // Project daily usage based on current time of day
    const projection = projectDailyUsage(current);

    return {
      current,
      limits: FREE_TIER_LIMITS,
      usage: {
        readsPercent: Math.round(readsPercent * 10) / 10,
        writesPercent: Math.round(writesPercent * 10) / 10,
      },
      alerts,
      projection,
    };

  } catch (error) {
    console.error("[QUOTA_TRACKER] Failed to get quota status:", error);
    throw error;
  }
}

/**
 * Generate alerts based on current usage
 */
function generateAlerts(stats: QuotaStats): QuotaAlert[] {
  const alerts: QuotaAlert[] = [];

  // Check reads
  const readsPercent = (stats.reads / FREE_TIER_LIMITS.reads) * 100;
  if (readsPercent >= ALERT_THRESHOLDS.danger) {
    alerts.push({
      type: "reads",
      level: "danger",
      threshold: ALERT_THRESHOLDS.danger,
      current: stats.reads,
      limit: FREE_TIER_LIMITS.reads,
      message: `Critical: ${Math.round(readsPercent)}% of daily read quota used (${stats.reads.toLocaleString()}/${FREE_TIER_LIMITS.reads.toLocaleString()})`,
    });
  } else if (readsPercent >= ALERT_THRESHOLDS.critical) {
    alerts.push({
      type: "reads",
      level: "critical",
      threshold: ALERT_THRESHOLDS.critical,
      current: stats.reads,
      limit: FREE_TIER_LIMITS.reads,
      message: `Warning: ${Math.round(readsPercent)}% of daily read quota used (${stats.reads.toLocaleString()}/${FREE_TIER_LIMITS.reads.toLocaleString()})`,
    });
  } else if (readsPercent >= ALERT_THRESHOLDS.warning) {
    alerts.push({
      type: "reads",
      level: "warning",
      threshold: ALERT_THRESHOLDS.warning,
      current: stats.reads,
      limit: FREE_TIER_LIMITS.reads,
      message: `Notice: ${Math.round(readsPercent)}% of daily read quota used (${stats.reads.toLocaleString()}/${FREE_TIER_LIMITS.reads.toLocaleString()})`,
    });
  }

  // Check writes
  const writesPercent = (stats.writes / FREE_TIER_LIMITS.writes) * 100;
  if (writesPercent >= ALERT_THRESHOLDS.danger) {
    alerts.push({
      type: "writes",
      level: "danger",
      threshold: ALERT_THRESHOLDS.danger,
      current: stats.writes,
      limit: FREE_TIER_LIMITS.writes,
      message: `Critical: ${Math.round(writesPercent)}% of daily write quota used (${stats.writes.toLocaleString()}/${FREE_TIER_LIMITS.writes.toLocaleString()})`,
    });
  } else if (writesPercent >= ALERT_THRESHOLDS.critical) {
    alerts.push({
      type: "writes",
      level: "critical",
      threshold: ALERT_THRESHOLDS.critical,
      current: stats.writes,
      limit: FREE_TIER_LIMITS.writes,
      message: `Warning: ${Math.round(writesPercent)}% of daily write quota used (${stats.writes.toLocaleString()}/${FREE_TIER_LIMITS.writes.toLocaleString()})`,
    });
  } else if (writesPercent >= ALERT_THRESHOLDS.warning) {
    alerts.push({
      type: "writes",
      level: "warning",
      threshold: ALERT_THRESHOLDS.warning,
      current: stats.writes,
      limit: FREE_TIER_LIMITS.writes,
      message: `Notice: ${Math.round(writesPercent)}% of daily write quota used (${stats.writes.toLocaleString()}/${FREE_TIER_LIMITS.writes.toLocaleString()})`,
    });
  }

  return alerts;
}

/**
 * Project daily usage based on current time
 */
function projectDailyUsage(stats: QuotaStats): {
  estimatedDailyReads: number;
  estimatedDailyWrites: number;
  willExceedReads: boolean;
  willExceedWrites: boolean;
} {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
  const elapsedMs = now.getTime() - startOfDay;
  const totalMs = endOfDay - startOfDay;
  const percentOfDayElapsed = elapsedMs / totalMs;

  // Avoid division by zero
  if (percentOfDayElapsed < 0.01) {
    return {
      estimatedDailyReads: 0,
      estimatedDailyWrites: 0,
      willExceedReads: false,
      willExceedWrites: false,
    };
  }

  const estimatedDailyReads = Math.round(stats.reads / percentOfDayElapsed);
  const estimatedDailyWrites = Math.round(stats.writes / percentOfDayElapsed);

  return {
    estimatedDailyReads,
    estimatedDailyWrites,
    willExceedReads: estimatedDailyReads > FREE_TIER_LIMITS.reads,
    willExceedWrites: estimatedDailyWrites > FREE_TIER_LIMITS.writes,
  };
}

/**
 * Get historical quota usage
 */
export async function getHistoricalQuota(days: number = 7): Promise<QuotaStats[]> {
  try {
    const db = dbAdmin();
    const history: QuotaStats[] = [];

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split("T")[0];
      const doc = await db.collection("quota_tracking").doc(dateStr).get();

      if (doc.exists) {
        history.push(doc.data() as QuotaStats);
      } else {
        history.push({
          date: dateStr,
          reads: 0,
          writes: 0,
          deletes: 0,
          timestamp: d.getTime(),
        });
      }
    }

    return history;

  } catch (error) {
    console.error("[QUOTA_TRACKER] Failed to get historical quota:", error);
    return [];
  }
}

/**
 * Check if quota is healthy (not at risk)
 */
export async function isQuotaHealthy(): Promise<{
  healthy: boolean;
  issues: string[];
}> {
  const status = await getQuotaStatus();
  const issues: string[] = [];

  if (status.usage.readsPercent >= ALERT_THRESHOLDS.critical) {
    issues.push(`Read quota at ${status.usage.readsPercent}%`);
  }

  if (status.usage.writesPercent >= ALERT_THRESHOLDS.critical) {
    issues.push(`Write quota at ${status.usage.writesPercent}%`);
  }

  if (status.projection.willExceedReads) {
    issues.push(`Projected to exceed read quota (est. ${status.projection.estimatedDailyReads.toLocaleString()})`);
  }

  if (status.projection.willExceedWrites) {
    issues.push(`Projected to exceed write quota (est. ${status.projection.estimatedDailyWrites.toLocaleString()})`);
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

/**
 * Send alert if quota threshold exceeded
 */
export async function checkAndAlert(): Promise<void> {
  try {
    const status = await getQuotaStatus();

    // Send alerts for critical and danger levels
    const criticalAlerts = status.alerts.filter(
      (a) => a.level === "critical" || a.level === "danger"
    );

    if (criticalAlerts.length > 0) {
      // Import alerts module dynamically to avoid circular dependency
      const { sendAlert } = await import("./alerts");

      for (const alert of criticalAlerts) {
        await sendAlert({
          severity: alert.level === "danger" ? "critical" : "warning",
          title: `Firestore Quota Alert: ${alert.type}`,
          message: alert.message,
          details: {
            current: alert.current,
            limit: alert.limit,
            percent: Math.round((alert.current / alert.limit) * 100),
          },
        });
      }
    }

  } catch (error) {
    console.error("[QUOTA_TRACKER] Failed to check and alert:", error);
  }
}

/**
 * Cleanup old quota tracking data (keep last 90 days)
 */
export async function cleanupOldQuotaData(): Promise<{ deleted: number }> {
  try {
    const db = dbAdmin();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    const oldDocs = await db
      .collection("quota_tracking")
      .where("date", "<", cutoffStr)
      .limit(100)
      .get();

    const batch = db.batch();
    oldDocs.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    console.log(`[QUOTA_TRACKER] Cleaned up ${oldDocs.size} old quota records`);
    return { deleted: oldDocs.size };

  } catch (error) {
    console.error("[QUOTA_TRACKER] Failed to cleanup old data:", error);
    return { deleted: 0 };
  }
}
