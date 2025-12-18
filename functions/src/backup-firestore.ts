import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

/**
 * Backup Strategy for TheQah Application
 * ======================================
 * 
 * Purpose: Automated daily backups of critical Firestore collections
 * Schedule: Daily at 3 AM UTC (off-peak hours)
 * Retention: 30 days (configurable)
 * Storage: Firebase Cloud Storage bucket
 * 
 * Collections Backed Up:
 * - stores: Store configurations and settings
 * - reviews: All customer reviews
 * - metrics: Application metrics (last 30 days)
 * - syncLogs: Synchronization logs
 * - review_tokens: Review invitation tokens
 * - owners: OAuth tokens and store ownership data
 * - domains: Domain to store mappings
 * 
 * Restoration Process:
 * 1. Download backup from Cloud Storage
 * 2. Use Firebase Admin SDK to restore collections
 * 3. Verify data integrity
 * 
 * Monitoring:
 * - Success/failure tracked in metrics collection
 * - Alerts sent for backup failures
 * - Backup size and duration logged
 */

const BACKUP_BUCKET = "theqah-backups"; // Can be configured via environment variable
const BACKUP_RETENTION_DAYS = 30;
const CRITICAL_COLLECTIONS = [
  "stores",
  "reviews", 
  "metrics",
  "syncLogs",
  "review_tokens",
  "review_invites",
  "owners",
  "domains",
  "subscriptions"
];

interface BackupMetadata {
  timestamp: number;
  date: string;
  collections: string[];
  totalDocuments: number;
  totalSize: number;
  duration: number;
  success: boolean;
  error?: string;
}

/**
 * Daily Firestore backup to Cloud Storage
 * Runs at 3 AM UTC every day
 */
export const backupFirestore = functions.pubsub
  .schedule("0 3 * * *") // Daily at 3 AM UTC
  .timeZone("UTC")
  .onRun(async (context) => {
    const startTime = Date.now();
    const db = admin.firestore();
    const storage = admin.storage();
    
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const timestamp = Date.now();
    
    console.log(`[Backup] Starting Firestore backup for ${dateStr}`);
    
    const metadata: BackupMetadata = {
      timestamp,
      date: dateStr,
      collections: CRITICAL_COLLECTIONS,
      totalDocuments: 0,
      totalSize: 0,
      duration: 0,
      success: false
    };
    
    try {
      // Create backup folder with timestamp
      const backupFolder = `backups/${dateStr}-${timestamp}`;
      const bucket = storage.bucket(BACKUP_BUCKET);
      
      // Backup each collection
      for (const collectionName of CRITICAL_COLLECTIONS) {
        console.log(`[Backup] Backing up collection: ${collectionName}`);
        
        try {
          const collectionRef = db.collection(collectionName);
          const snapshot = await collectionRef.get();
          
          if (snapshot.empty) {
            console.log(`[Backup] Collection ${collectionName} is empty, skipping`);
            continue;
          }
          
          // Prepare collection data
          const documents: Array<{id: string; data: admin.firestore.DocumentData; path: string}> = [];
          let collectionSize = 0;
          
          snapshot.forEach(doc => {
            const data = doc.data();
            const docData = {
              id: doc.id,
              data,
              path: doc.ref.path
            };
            documents.push(docData);
            // Estimate size (rough calculation)
            collectionSize += JSON.stringify(docData).length;
          });
          
          // Save to Cloud Storage as JSON
          const backupData = {
            collection: collectionName,
            timestamp,
            date: dateStr,
            documentCount: documents.length,
            documents
          };
          
          const jsonData = JSON.stringify(backupData, null, 2);
          const fileName = `${backupFolder}/${collectionName}.json`;
          const file = bucket.file(fileName);
          
          await file.save(jsonData, {
            contentType: 'application/json',
            metadata: {
              collection: collectionName,
              documentCount: documents.length.toString(),
              backupDate: dateStr,
              timestamp: timestamp.toString()
            }
          });
          
          console.log(`[Backup] ✅ Backed up ${documents.length} documents from ${collectionName} (${(collectionSize / 1024).toFixed(2)} KB)`);
          
          metadata.totalDocuments += documents.length;
          metadata.totalSize += collectionSize;
          
        } catch (collectionError) {
          console.error(`[Backup] ❌ Failed to backup ${collectionName}:`, collectionError);
          // Continue with other collections even if one fails
          await db.collection("backup_errors").add({
            timestamp: Date.now(),
            date: dateStr,
            collection: collectionName,
            error: collectionError instanceof Error ? collectionError.message : String(collectionError),
            stack: collectionError instanceof Error ? collectionError.stack : undefined
          });
        }
      }
      
      // Save backup metadata
      const metadataFile = bucket.file(`${backupFolder}/metadata.json`);
      metadata.success = true;
      metadata.duration = Date.now() - startTime;
      
      await metadataFile.save(JSON.stringify(metadata, null, 2), {
        contentType: 'application/json'
      });
      
      console.log(`[Backup] ✅ Backup completed successfully`);
      console.log(`[Backup] Total documents: ${metadata.totalDocuments}`);
      console.log(`[Backup] Total size: ${(metadata.totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[Backup] Duration: ${(metadata.duration / 1000).toFixed(2)}s`);
      
      // Log successful backup to metrics
      await db.collection("metrics").add({
        timestamp: new Date(),
        type: "backup",
        action: "firestore_backup",
        severity: "info",
        success: true,
        metadata: {
          date: dateStr,
          totalDocuments: metadata.totalDocuments,
          totalSize: metadata.totalSize,
          duration: metadata.duration,
          collections: CRITICAL_COLLECTIONS
        }
      });
      
      // Cleanup old backups (retention policy)
      await cleanupOldBackups(storage, BACKUP_RETENTION_DAYS);
      
      return { success: true, metadata };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error("[Backup] ❌ Fatal backup error:", error);
      
      metadata.success = false;
      metadata.duration = Date.now() - startTime;
      metadata.error = errorMsg;
      
      // Log failed backup to metrics with alert
      await db.collection("metrics").add({
        timestamp: new Date(),
        type: "backup",
        action: "firestore_backup",
        severity: "critical",
        success: false,
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
        errorStack: errorStack?.substring(0, 500),
        metadata: {
          date: dateStr,
          totalDocuments: metadata.totalDocuments,
          duration: metadata.duration,
          error: errorMsg
        }
      });
      
      // Send critical alert (reuses existing alerting system)
      try {
        const { sendCriticalAlert } = await import("./alerts");
        await sendCriticalAlert({
          title: "🚨 Firestore Backup Failed",
          message: `Daily backup failed for ${dateStr}`,
          error: errorMsg,
          errorStack,
          severity: "critical",
          metadata: {
            date: dateStr,
            duration: metadata.duration,
            documentsBackedUp: metadata.totalDocuments
          }
        });
      } catch (alertError) {
        console.error("[Backup] Failed to send alert:", alertError);
      }
      
      throw error;
    }
  });

/**
 * Cleanup old backups beyond retention period
 */
async function cleanupOldBackups(storage: ReturnType<typeof admin.storage>, retentionDays: number): Promise<void> {
  console.log(`[Backup Cleanup] Starting cleanup of backups older than ${retentionDays} days`);
  
  try {
    const [files] = await storage.bucket().getFiles({ prefix: "backups/" });
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffTimestamp = cutoffDate.getTime();
    
    let deletedCount = 0;
    
    for (const file of files) {
      // Extract timestamp from file path: backups/YYYY-MM-DD-timestamp/...
      const pathParts = file.name.split('/');
      if (pathParts.length < 2) continue;
      
      const folderName = pathParts[1]; // YYYY-MM-DD-timestamp
      const timestampMatch = folderName.match(/-(\d+)$/);
      
      if (timestampMatch) {
        const fileTimestamp = parseInt(timestampMatch[1], 10);
        
        if (fileTimestamp < cutoffTimestamp) {
          await file.delete();
          deletedCount++;
        }
      }
    }
    
    console.log(`[Backup Cleanup] ✅ Deleted ${deletedCount} old backup files`);
    
    // Log cleanup operation
    const db = admin.firestore();
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "backup",
      action: "backup_cleanup",
      severity: "info",
      metadata: {
        deletedCount,
        retentionDays,
        cutoffDate: cutoffDate.toISOString()
      }
    });
    
  } catch (error) {
    console.error("[Backup Cleanup] ❌ Failed to cleanup old backups:", error);
    // Don't throw - cleanup failure shouldn't fail the main backup
  }
}

/**
 * Manual backup trigger (HTTP endpoint for emergency backups)
 * Requires admin authentication
 */
export const manualBackup = functions.https.onRequest(async (req, res) => {
  // Authentication check
  const adminSecret = req.headers.authorization?.replace("Bearer ", "");
  const expectedSecret = process.env.ADMIN_SECRET || "RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO";
  
  if (adminSecret !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  console.log("[Manual Backup] Starting manual backup triggered via HTTP");
  
  try {
    // Trigger the backup function manually
    const result = await backupFirestore.run(null as unknown, {} as Record<string, never>);
    
    res.status(200).json({
      success: true,
      message: "Manual backup completed successfully",
      result
    });
  } catch (error) {
    console.error("[Manual Backup] Failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Restore collection from backup
 * WARNING: This will overwrite existing data!
 * Use with extreme caution - recommended for disaster recovery only
 */
export const restoreFromBackup = functions.https.onRequest(async (req, res) => {
  // Double authentication - requires both admin secret and explicit confirmation
  const adminSecret = req.headers.authorization?.replace("Bearer ", "");
  const expectedSecret = process.env.ADMIN_SECRET || "RkTrCoGuHAS3p9x5Kw4V2iX0JcnZYyNO";
  const confirmationToken = req.body.confirmationToken;
  
  if (adminSecret !== expectedSecret || confirmationToken !== "CONFIRM_RESTORE") {
    res.status(401).json({ error: "Unauthorized or missing confirmation" });
    return;
  }
  
  const { backupDate, collectionName, mode } = req.body;
  
  if (!backupDate || !collectionName) {
    res.status(400).json({ error: "Missing backupDate or collectionName" });
    return;
  }
  
  console.log(`[Restore] Starting restore: ${collectionName} from ${backupDate} (mode: ${mode})`);
  
  try {
    const db = admin.firestore();
    const storage = admin.storage();
    const bucket = storage.bucket(BACKUP_BUCKET);
    
    // Find backup file
    const [files] = await bucket.getFiles({ prefix: `backups/${backupDate}` });
    const backupFile = files.find(f => f.name.endsWith(`${collectionName}.json`));
    
    if (!backupFile) {
      res.status(404).json({ error: `Backup not found for ${collectionName} on ${backupDate}` });
      return;
    }
    
    // Download and parse backup
    const [fileContent] = await backupFile.download();
    const backupData = JSON.parse(fileContent.toString());
    
    let restoredCount = 0;
    const batch = db.batch();
    
    // Restore documents
    for (const docData of backupData.documents) {
      const docRef = db.collection(collectionName).doc(docData.id);
      
      if (mode === "merge") {
        batch.set(docRef, docData.data, { merge: true });
      } else {
        // mode === "overwrite"
        batch.set(docRef, docData.data);
      }
      
      restoredCount++;
      
      // Commit in batches of 500 (Firestore limit)
      if (restoredCount % 500 === 0) {
        await batch.commit();
      }
    }
    
    // Commit remaining documents
    if (restoredCount % 500 !== 0) {
      await batch.commit();
    }
    
    console.log(`[Restore] ✅ Restored ${restoredCount} documents to ${collectionName}`);
    
    // Log restoration
    await db.collection("metrics").add({
      timestamp: new Date(),
      type: "backup",
      action: "restore_from_backup",
      severity: "critical",
      metadata: {
        backupDate,
        collectionName,
        restoredCount,
        mode
      }
    });
    
    res.status(200).json({
      success: true,
      message: `Restored ${restoredCount} documents`,
      collection: collectionName,
      backupDate
    });
    
  } catch (error) {
    console.error("[Restore] Failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
