// src/pages/api/admin/monitor-app.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

/**
 * Comprehensive application monitoring dashboard
 * GET /api/admin/monitor-app?period=24h|7d|30d
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
    
    // Period selection (default: 24 hours)
    const period = req.query.period === "7d" ? 7 * 24 * 60 * 60 * 1000 :
                   req.query.period === "30d" ? 30 * 24 * 60 * 60 * 1000 :
                   24 * 60 * 60 * 1000; // 24h default
    
    const startTime = now - period;

    // Fetch metrics from the period
    const metricsSnap = await db.collection("metrics")
      .where("timestamp", ">=", startTime)
      .orderBy("timestamp", "desc")
      .limit(10000) // Reasonable limit
      .get();

    const metrics = metricsSnap.docs.map(doc => doc.data());

    // Aggregate metrics
    const apiCalls = metrics.filter(m => m.type === "api_call");
    const errors = metrics.filter(m => m.severity === "error" || m.severity === "critical");
    const webhooks = metrics.filter(m => m.type === "webhook_received");
    const dbReads = metrics.filter(m => m.type === "database_read");
    const dbWrites = metrics.filter(m => m.type === "database_write");

    // API endpoint statistics
    const endpointStats: Record<string, {
      count: number;
      avgDuration: number;
      errors: number;
      p95Duration: number;
    }> = {};

    apiCalls.forEach(call => {
      const endpoint = call.endpoint || "unknown";
      if (!endpointStats[endpoint]) {
        endpointStats[endpoint] = { count: 0, avgDuration: 0, errors: 0, p95Duration: 0 };
      }
      endpointStats[endpoint].count++;
      endpointStats[endpoint].avgDuration += call.duration || 0;
      if (call.statusCode && call.statusCode >= 400) {
        endpointStats[endpoint].errors++;
      }
    });

    // Calculate averages and P95
    Object.keys(endpointStats).forEach(endpoint => {
      const stat = endpointStats[endpoint];
      stat.avgDuration = Math.round(stat.avgDuration / stat.count);
      
      // Calculate P95 duration
      const durations = apiCalls
        .filter(c => c.endpoint === endpoint && c.duration)
        .map(c => c.duration as number)
        .sort((a, b) => a - b);
      
      if (durations.length > 0) {
        const p95Index = Math.floor(durations.length * 0.95);
        stat.p95Duration = durations[p95Index] || 0;
      }
    });

    // Error breakdown
    const errorsByEndpoint: Record<string, number> = {};
    errors.forEach(error => {
      const endpoint = error.endpoint || "unknown";
      errorsByEndpoint[endpoint] = (errorsByEndpoint[endpoint] || 0) + 1;
    });

    // Database usage
    const totalDbReads = dbReads.reduce((sum, m) => {
      const count = m.metadata?.count as number | undefined;
      return sum + (count || 1);
    }, 0);

    const totalDbWrites = dbWrites.reduce((sum, m) => {
      const count = m.metadata?.count as number | undefined;
      return sum + (count || 1);
    }, 0);

    // Webhook statistics
    const webhooksByEvent: Record<string, { total: number; failures: number }> = {};
    webhooks.forEach(wh => {
      const event = wh.metadata?.event as string || "unknown";
      if (!webhooksByEvent[event]) {
        webhooksByEvent[event] = { total: 0, failures: 0 };
      }
      webhooksByEvent[event].total++;
      if (wh.error) {
        webhooksByEvent[event].failures++;
      }
    });

    // Active users/stores
    const activeStoresSnap = await db.collection("stores")
      .where("salla.connected", "==", true)
      .get();

    const totalStores = activeStoresSnap.size;
    const storesByPlan: Record<string, number> = {};

    activeStoresSnap.forEach(doc => {
      const plan = doc.data()?.subscription?.planId || "free";
      storesByPlan[plan] = (storesByPlan[plan] || 0) + 1;
    });

    // Recent reviews
    const recentReviewsSnap = await db.collection("reviews")
      .where("createdAt", ">=", startTime)
      .get();

    const totalReviews = recentReviewsSnap.size;
    const verifiedReviews = recentReviewsSnap.docs.filter(d => d.data().verified === true).length;

    // System health alerts
    const alerts = [];

    // High error rate
    const errorRate = apiCalls.length > 0 ? (errors.length / apiCalls.length) * 100 : 0;
    if (errorRate > 5) {
      alerts.push({
        type: "high_error_rate",
        severity: errorRate > 10 ? "critical" : "warning",
        message: `Error rate: ${errorRate.toFixed(1)}% (${errors.length}/${apiCalls.length} requests)`,
        value: errorRate
      });
    }

    // Slow endpoints (avg > 2s)
    Object.entries(endpointStats).forEach(([endpoint, stats]) => {
      if (stats.avgDuration > 2000) {
        alerts.push({
          type: "slow_endpoint",
          severity: stats.avgDuration > 5000 ? "warning" : "info",
          message: `${endpoint}: Avg ${stats.avgDuration}ms`,
          endpoint,
          avgDuration: stats.avgDuration
        });
      }
    });

    // High database usage
    const dailyReadEstimate = (totalDbReads / period) * (24 * 60 * 60 * 1000);
    const dailyWriteEstimate = (totalDbWrites / period) * (24 * 60 * 60 * 1000);

    if (dailyReadEstimate > 45000) {
      alerts.push({
        type: "high_db_reads",
        severity: dailyReadEstimate > 50000 ? "critical" : "warning",
        message: `Estimated daily reads: ${Math.round(dailyReadEstimate)} / 50,000`,
        value: dailyReadEstimate
      });
    }

    if (dailyWriteEstimate > 18000) {
      alerts.push({
        type: "high_db_writes",
        severity: dailyWriteEstimate > 20000 ? "critical" : "warning",
        message: `Estimated daily writes: ${Math.round(dailyWriteEstimate)} / 20,000`,
        value: dailyWriteEstimate
      });
    }

    // Response time distribution
    const durations = apiCalls.map(c => c.duration || 0).sort((a, b) => a - b);
    const p50 = durations[Math.floor(durations.length * 0.5)] || 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] || 0;
    const p99 = durations[Math.floor(durations.length * 0.99)] || 0;

    return res.status(200).json({
      ok: true,
      period: req.query.period || "24h",
      timestamp: now,
      
      summary: {
        totalApiCalls: apiCalls.length,
        totalErrors: errors.length,
        errorRate: errorRate.toFixed(2) + "%",
        totalWebhooks: webhooks.length,
        totalAlerts: alerts.length
      },

      performance: {
        avgResponseTime: Math.round(apiCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / apiCalls.length) || 0,
        p50ResponseTime: p50,
        p95ResponseTime: p95,
        p99ResponseTime: p99,
        slowestEndpoint: Object.entries(endpointStats)
          .sort((a, b) => b[1].avgDuration - a[1].avgDuration)[0]?.[0] || "none"
      },

      endpoints: Object.entries(endpointStats)
        .map(([endpoint, stats]) => ({ endpoint, ...stats }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20), // Top 20 endpoints

      errors: {
        total: errors.length,
        byEndpoint: Object.entries(errorsByEndpoint)
          .map(([endpoint, count]) => ({ endpoint, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        recent: errors.slice(0, 10).map(e => ({
          endpoint: e.endpoint,
          error: e.error,
          timestamp: e.timestamp,
          storeUid: e.storeUid
        }))
      },

      database: {
        totalReads: totalDbReads,
        totalWrites: totalDbWrites,
        estimatedDailyReads: Math.round(dailyReadEstimate),
        estimatedDailyWrites: Math.round(dailyWriteEstimate),
        quotaStatus: {
          reads: `${Math.round((dailyReadEstimate / 50000) * 100)}%`,
          writes: `${Math.round((dailyWriteEstimate / 20000) * 100)}%`
        }
      },

      webhooks: {
        total: webhooks.length,
        byEvent: Object.entries(webhooksByEvent)
          .map(([event, stats]) => ({ 
            event, 
            total: stats.total, 
            failures: stats.failures,
            successRate: ((stats.total - stats.failures) / stats.total * 100).toFixed(1) + "%"
          }))
          .sort((a, b) => b.total - a.total)
      },

      stores: {
        total: totalStores,
        byPlan: storesByPlan,
        activeToday: metrics.filter(m => m.storeUid).length
      },

      reviews: {
        total: totalReviews,
        verified: verifiedReviews,
        verificationRate: totalReviews > 0 
          ? ((verifiedReviews / totalReviews) * 100).toFixed(1) + "%" 
          : "0%"
      },

      alerts: alerts.sort((a, b) => {
        const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
        return (severityOrder[a.severity] || 99) - (severityOrder[b.severity] || 99);
      })
    });

  } catch (error: unknown) {
    console.error("[Monitor App Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
