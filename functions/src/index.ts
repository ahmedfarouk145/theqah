import * as admin from "firebase-admin";

// Initialize Firebase Admin
admin.initializeApp();

// Export cleanup functions
export { cleanupOldMetrics, cleanupOldSyncLogs } from "./cleanup-metrics";
