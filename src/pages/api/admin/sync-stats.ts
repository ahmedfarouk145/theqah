// src/pages/api/admin/sync-stats.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

/**
 * Get sync statistics for all stores
 * GET /api/admin/sync-stats
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple auth check (add proper auth later)
  const authHeader = req.headers.authorization;
  const adminSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;
  
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const db = dbAdmin();
    
    // Get all Salla stores with sync stats
    const storesSnap = await db.collection("stores")
      .where("provider", "==", "salla")
      .where("salla.connected", "==", true)
      .get();

    const stats = [];
    let totalReviews = 0;
    let totalStores = 0;

    for (const doc of storesSnap.docs) {
      const data = doc.data();
      const storeStats = {
        storeUid: doc.id,
        storeName: data.name || data.salla?.name || "Unknown",
        lastSyncAt: data.salla?.lastReviewsSyncAt || 0,
        lastSyncCount: data.salla?.lastReviewsSyncCount || 0,
        totalSynced: data.salla?.totalReviewsSynced || 0,
        subscriptionStartedAt: data.subscription?.startedAt || 0,
      };

      stats.push(storeStats);
      totalReviews += storeStats.totalSynced;
      totalStores++;
    }

    // Calculate daily quota usage estimate
    const avgReviewsPerSync = totalStores > 0 ? totalReviews / totalStores : 0;
    const dailyReadsEstimate = totalStores * 3 + avgReviewsPerSync; // stores + batch queries
    const dailyWritesEstimate = avgReviewsPerSync + totalStores; // reviews + stats

    // Sort by last sync (oldest first)
    stats.sort((a, b) => a.lastSyncAt - b.lastSyncAt);

    return res.status(200).json({
      ok: true,
      summary: {
        totalStores,
        totalReviewsSynced: totalReviews,
        avgReviewsPerStore: totalStores > 0 ? Math.round(totalReviews / totalStores) : 0,
      },
      quotaEstimate: {
        dailyReads: Math.round(dailyReadsEstimate),
        dailyWrites: Math.round(dailyWritesEstimate),
        freeLimit: {
          reads: 50000,
          writes: 20000,
        },
        status: 
          dailyReadsEstimate > 50000 || dailyWritesEstimate > 20000 
            ? "⚠️ Exceeds free tier"
            : "✅ Within free tier",
      },
      stores: stats,
      timestamp: Date.now(),
    });

  } catch (error: unknown) {
    console.error("[Sync Stats Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
