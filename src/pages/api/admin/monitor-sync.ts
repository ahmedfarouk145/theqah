// src/pages/api/admin/monitor-sync.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

/**
 * Monitor sync health and get alerts
 * GET /api/admin/monitor-sync
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const authHeader = req.headers.authorization;
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = dbAdmin();
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Get recent sync logs
    const syncLogsSnap = await db.collection("syncLogs")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();

    const recentSyncs = syncLogsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Get all connected stores
    const storesSnap = await db.collection("stores")
      .where("provider", "==", "salla")
      .where("salla.connected", "==", true)
      .get();

    const alerts = [];
    const storeHealth = [];

    for (const storeDoc of storesSnap.docs) {
      const storeData = storeDoc.data();
      const storeUid = storeDoc.id;
      const lastSyncAt = storeData.salla?.lastReviewsSyncAt || 0;
      const lastSyncCount = storeData.salla?.lastReviewsSyncCount || 0;
      const totalSynced = storeData.salla?.totalReviewsSynced || 0;
      
      const hoursSinceSync = (now - lastSyncAt) / (1000 * 60 * 60);
      
      // Alert: No sync in 12 hours
      if (lastSyncAt > 0 && hoursSinceSync > 12) {
        alerts.push({
          type: "stale_sync",
          severity: hoursSinceSync > 24 ? "high" : "medium",
          storeUid,
          storeName: storeData.name || storeData.salla?.name || "Unknown",
          message: `No sync in ${Math.round(hoursSinceSync)} hours`,
          lastSyncAt,
          hoursSinceSync: Math.round(hoursSinceSync * 10) / 10
        });
      }
      
      // Alert: Never synced but connected
      if (lastSyncAt === 0 && storeData.salla?.connected) {
        alerts.push({
          type: "never_synced",
          severity: "high",
          storeUid,
          storeName: storeData.name || storeData.salla?.name || "Unknown",
          message: "Store connected but never synced reviews",
          connectedAt: storeData.salla?.connectedAt || 0
        });
      }

      // Alert: Zero reviews synced after multiple attempts
      if (totalSynced === 0 && lastSyncAt > oneDayAgo) {
        alerts.push({
          type: "zero_reviews",
          severity: "medium",
          storeUid,
          storeName: storeData.name || storeData.salla?.name || "Unknown",
          message: "No reviews found after sync attempts",
          lastSyncAt
        });
      }

      storeHealth.push({
        storeUid,
        storeName: storeData.name || storeData.salla?.name || "Unknown",
        lastSyncAt,
        lastSyncCount,
        totalSynced,
        hoursSinceSync: lastSyncAt > 0 ? Math.round(hoursSinceSync * 10) / 10 : null,
        status: hoursSinceSync < 7 ? "healthy" : hoursSinceSync < 12 ? "warning" : "critical"
      });
    }

    // Check quota usage
    const totalStores = storesSnap.size;
    const avgReviewsPerStore = storeHealth.reduce((sum, s) => sum + s.totalSynced, 0) / totalStores || 0;
    const estimatedDailyReads = (totalStores * 3) + (avgReviewsPerStore * 4); // 4 syncs per day
    const estimatedDailyWrites = (avgReviewsPerStore * 4) + (totalStores * 4);

    // Quota alerts
    if (estimatedDailyReads > 45000) {
      alerts.push({
        type: "quota_warning",
        severity: estimatedDailyReads > 50000 ? "high" : "medium",
        message: `High read quota usage: ${Math.round(estimatedDailyReads)} / 50,000 daily`,
        estimatedDailyReads,
        limit: 50000,
        percentage: Math.round((estimatedDailyReads / 50000) * 100)
      });
    }

    if (estimatedDailyWrites > 18000) {
      alerts.push({
        type: "quota_warning",
        severity: estimatedDailyWrites > 20000 ? "high" : "medium",
        message: `High write quota usage: ${Math.round(estimatedDailyWrites)} / 20,000 daily`,
        estimatedDailyWrites,
        limit: 20000,
        percentage: Math.round((estimatedDailyWrites / 20000) * 100)
      });
    }

    // Sort alerts by severity
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99));

    // Sort stores by health status
    storeHealth.sort((a, b) => {
      const statusOrder: Record<string, number> = { critical: 0, warning: 1, healthy: 2 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });

    return res.status(200).json({
      ok: true,
      timestamp: now,
      summary: {
        totalStores,
        healthyStores: storeHealth.filter(s => s.status === "healthy").length,
        warningStores: storeHealth.filter(s => s.status === "warning").length,
        criticalStores: storeHealth.filter(s => s.status === "critical").length,
        totalAlerts: alerts.length,
        highSeverityAlerts: alerts.filter(a => a.severity === "high").length
      },
      alerts,
      stores: storeHealth,
      recentSyncs: recentSyncs.slice(0, 5),
      quotaStatus: {
        estimatedDailyReads: Math.round(estimatedDailyReads),
        estimatedDailyWrites: Math.round(estimatedDailyWrites),
        readLimit: 50000,
        writeLimit: 20000,
        readPercentage: Math.round((estimatedDailyReads / 50000) * 100),
        writePercentage: Math.round((estimatedDailyWrites / 20000) * 100),
        status: estimatedDailyReads > 50000 || estimatedDailyWrites > 20000 
          ? "⚠️ Exceeds free tier" 
          : estimatedDailyReads > 45000 || estimatedDailyWrites > 18000
          ? "⚠️ Approaching limit"
          : "✅ Healthy"
      }
    });

  } catch (error: unknown) {
    console.error("[Monitor Sync Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
