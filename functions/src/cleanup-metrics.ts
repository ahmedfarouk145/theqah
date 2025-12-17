import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Scheduled function to clean up old metrics data
 * Runs daily at 2 AM UTC
 * Deletes metrics older than 30 days to prevent database bloat
 */
export const cleanupOldMetrics = functions.pubsub
  .schedule("0 2 * * *") // Every day at 2 AM UTC
  .timeZone("UTC")
  .onRun(async (context) => {
    const db = admin.firestore();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log(`[Cleanup] Starting cleanup of metrics older than ${thirtyDaysAgo.toISOString()}`);

    try {
      // Query metrics older than 30 days
      const metricsRef = db.collection("metrics");
      const oldMetricsQuery = metricsRef.where("timestamp", "<", thirtyDaysAgo);

      // Get all old metrics in batches
      let totalDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        const snapshot = await oldMetricsQuery.limit(500).get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        // Delete in batches of 500 (Firestore limit)
        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
          batch.delete(doc.ref);
          totalDeleted++;
        });

        await batch.commit();
        console.log(`[Cleanup] Deleted batch of ${snapshot.size} metrics (total: ${totalDeleted})`);

        // Check if there are more documents
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
          cutoffDate: thirtyDaysAgo.toISOString(),
        },
      });

      return { success: true, deletedCount: totalDeleted };
    } catch (error) {
      console.error("[Cleanup] Error during metrics cleanup:", error);

      // Log the error
      await db.collection("metrics").add({
        timestamp: new Date(),
        type: "cleanup",
        severity: "error",
        metadata: {
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      });

      throw error;
    }
  });

/**
 * Scheduled function to clean up old sync logs
 * Runs daily at 2:30 AM UTC
 * Deletes sync logs older than 60 days
 */
export const cleanupOldSyncLogs = functions.pubsub
  .schedule("30 2 * * *") // Every day at 2:30 AM UTC
  .timeZone("UTC")
  .onRun(async (context) => {
    const db = admin.firestore();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    console.log(`[Cleanup] Starting cleanup of sync logs older than ${sixtyDaysAgo.toISOString()}`);

    try {
      const syncLogsRef = db.collection("syncLogs");
      const oldLogsQuery = syncLogsRef.where("timestamp", "<", sixtyDaysAgo);

      let totalDeleted = 0;
      let hasMore = true;

      while (hasMore) {
        const snapshot = await oldLogsQuery.limit(500).get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
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
          cutoffDate: sixtyDaysAgo.toISOString(),
        },
      });

      return { success: true, deletedCount: totalDeleted };
    } catch (error) {
      console.error("[Cleanup] Error during sync logs cleanup:", error);

      await db.collection("metrics").add({
        timestamp: new Date(),
        type: "cleanup",
        severity: "error",
        metadata: {
          collection: "syncLogs",
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });

      throw error;
    }
  });
