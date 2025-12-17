import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";

/**
 * API endpoint to manually trigger metrics cleanup
 * Run this via cron-job.org or similar external cron service
 * 
 * Usage:
 * POST /api/admin/cleanup-metrics
 * Headers: Authorization: Bearer YOUR_ADMIN_SECRET
 * Body: { "daysOld": 30 } (optional, defaults to 30)
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Authentication
  const authHeader = req.headers.authorization;
  const ADMIN_SECRET = process.env.ADMIN_SECRET;

  if (!authHeader || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const daysOld = parseInt(String(req.body?.daysOld || "30"));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  console.log(`[Cleanup] Starting cleanup of metrics older than ${cutoffDate.toISOString()}`);

  try {
    const db = getDb();
    // Query metrics older than specified days
    const metricsRef = db.collection("metrics");
    const oldMetricsQuery = metricsRef.where("timestamp", "<", cutoffDate);

    let totalDeleted = 0;
    let hasMore = true;

    // Delete in batches of 500 (Firestore limit)
    while (hasMore) {
      const snapshot = await oldMetricsQuery.limit(500).get();

      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batch = db.batch();
      snapshot.docs.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        batch.delete(doc.ref);
        totalDeleted++;
      });

      await batch.commit();
      console.log(`[Cleanup] Deleted batch of ${snapshot.size} metrics (total: ${totalDeleted})`);

      hasMore = snapshot.size === 500;
    }

    console.log(`[Cleanup] Completed. Total metrics deleted: ${totalDeleted}`);

    // Log the cleanup operation itself
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "cleanup",
      severity: "info",
      metadata: {
        deletedCount: totalDeleted,
        cutoffDate: cutoffDate.toISOString(),
        daysOld,
      },
    });

    return res.status(200).json({
      success: true,
      deletedCount: totalDeleted,
      cutoffDate: cutoffDate.toISOString(),
    });
  } catch (error) {
    console.error("[Cleanup] Error during metrics cleanup:", error);

    // Log the error
    const db = getDb();
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "cleanup",
      severity: "error",
      metadata: {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    return res.status(500).json({
      error: "Cleanup failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
