// src/pages/api/admin/monitor-realtime.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

/**
 * Real-time monitoring - last 5 minutes of activity
 * GET /api/admin/monitor-realtime
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
    const fiveMinutesAgo = now - (5 * 60 * 1000);

    // H5: Pagination for realtime (default 500, max 1000)
    const limit = Math.min(parseInt(String(req.query.limit || "500")), 1000);
    const page = parseInt(String(req.query.page || "1"));
    
    // Get very recent metrics
    let query = db.collection("metrics")
      .where("timestamp", ">=", fiveMinutesAgo)
      .orderBy("timestamp", "desc")
      .limit(limit);
    
    // Cursor-based pagination
    if (page > 1 && req.query.cursor) {
      const cursorDoc = await db.collection("metrics").doc(String(req.query.cursor)).get();
      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    const metricsSnap = await query.get();

    const metrics = metricsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, unknown> & { id: string }));

    // Real-time statistics
    const apiCalls = metrics.filter(m => (m.type as string) === "api_call");
    const errors = metrics.filter(m => (m.severity as string) === "error" || (m.severity as string) === "critical");
    const activeEndpoints = new Set(apiCalls.map(m => m.endpoint as string)).size;
    const activeStores = new Set(metrics.filter(m => m.storeUid).map(m => m.storeUid as string)).size;

    // Requests per minute
    const minuteBuckets: Record<number, number> = {};
    apiCalls.forEach(call => {
      const minute = Math.floor((call.timestamp as number) / 60000);
      minuteBuckets[minute] = (minuteBuckets[minute] || 0) + 1;
    });

    const requestsPerMinute = Object.values(minuteBuckets);
    const avgRpm = requestsPerMinute.length > 0 
      ? Math.round(requestsPerMinute.reduce((a, b) => a + b, 0) / requestsPerMinute.length)
      : 0;

    // Current error rate
    const errorRate = apiCalls.length > 0 
      ? ((errors.length / apiCalls.length) * 100).toFixed(2)
      : "0";

    // Recent activity stream
    const activityStream = metrics.slice(0, 50).map(m => ({
      timestamp: m.timestamp as number,
      type: m.type as string,
      severity: m.severity as string,
      endpoint: m.endpoint as string | undefined,
      method: m.method as string | undefined,
      statusCode: m.statusCode as number | undefined,
      duration: m.duration as number | undefined,
      error: m.error as string | undefined,
      storeUid: m.storeUid as string | undefined
    }));

    // H5: Pagination metadata
    const hasMore = metricsSnap.docs.length === limit;
    const lastDoc = metricsSnap.docs[metricsSnap.docs.length - 1];
    const nextCursor = hasMore && lastDoc ? lastDoc.id : null;

    return res.status(200).json({
      ok: true,
      timestamp: now,
      window: "5 minutes",
      
      stats: {
        totalRequests: apiCalls.length,
        totalErrors: errors.length,
        errorRate: errorRate + "%",
        activeEndpoints,
        activeStores,
        avgRequestsPerMinute: avgRpm
      },

      activity: activityStream,

      // H5: Pagination info
      pagination: {
        page,
        limit,
        hasMore,
        nextCursor,
        totalFetched: metrics.length
      },

      health: {
        status: errors.length > 10 ? "⚠️ High error rate" :
                apiCalls.length === 0 ? "💤 No activity" :
                "✅ Healthy",
        requestsPerMinute: requestsPerMinute.slice(-5), // Last 5 minutes
        errorsPerMinute: errors.length > 0 
          ? Math.round((errors.length / 5) * 10) / 10
          : 0
      }
    });

  } catch (error: unknown) {
    console.error("[Monitor Realtime Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
