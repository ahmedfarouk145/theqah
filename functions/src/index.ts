import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Export cleanup functions
export { cleanupOldMetrics, cleanupOldSyncLogs } from "./cleanup-metrics";

// Export backup functions (H10 - Backup Strategy)
export { backupFirestore, manualBackup, restoreFromBackup } from "./backup-firestore";
