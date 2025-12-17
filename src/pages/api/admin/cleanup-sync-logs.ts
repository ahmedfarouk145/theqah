import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";

/**
 * API endpoint to manually trigger sync logs cleanup
 * Run this via cron-job.org or similar external cron service
 * 
 * Usage:
 * POST /api/admin/cleanup-sync-logs
 * Headers: Authorization: Bearer YOUR_ADMIN_SECRET
 * Body: { "daysOld": 60 } (optional, defaults to 60)
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

  const daysOld = parseInt(String(req.body?.daysOld || "60"));
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  console.log(`[Cleanup] Starting cleanup of sync logs older than ${cutoffDate.toISOString()}`);

  try {
    const db = getDb();
    const syncLogsRef = db.collection("syncLogs");
    const oldLogsQuery = syncLogsRef.where("timestamp", "<", cutoffDate);

    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      const snapshot = await oldLogsQuery.limit(500).get();

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
      console.log(`[Cleanup] Deleted batch of ${snapshot.size} sync logs (total: ${totalDeleted})`);

      hasMore = snapshot.size === 500;
    }

    console.log(`[Cleanup] Completed sync logs cleanup. Total deleted: ${totalDeleted}`);

    // Log the cleanup operation
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "cleanup",
      severity: "info",
      metadata: {
        collection: "syncLogs",
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
    console.error("[Cleanup] Error during sync logs cleanup:", error);

    const db = getDb();
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "cleanup",
      severity: "error",
      metadata: {
        collection: "syncLogs",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return res.status(500).json({
      error: "Cleanup failed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
