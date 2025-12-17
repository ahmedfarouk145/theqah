import * as admin from "firebase-admin";

/**
 * Alert system for Firebase Functions
 * Sends critical alerts via email and logs to Firestore
 */

interface AlertPayload {
  title: string;
  message: string;
  error?: string;
  errorStack?: string;
  severity: "info" | "warning" | "critical";
  metadata?: Record<string, any>;
}

/**
 * Send critical alert for backup failures and other critical events
 * Logs to Firestore metrics collection for monitoring
 */
export async function sendCriticalAlert(payload: AlertPayload): Promise<void> {
  const db = admin.firestore();
  
  console.log(`[Alert] ${payload.severity.toUpperCase()}: ${payload.title}`);
  console.log(`[Alert] Message: ${payload.message}`);
  
  if (payload.error) {
    console.error(`[Alert] Error: ${payload.error}`);
  }
  
  // Log to Firestore for monitoring dashboard
  try {
    await db.collection("alerts").add({
      timestamp: new Date(),
      title: payload.title,
      message: payload.message,
      error: payload.error || null,
      errorStack: payload.errorStack?.substring(0, 1000) || null,
      severity: payload.severity,
      source: "firebase_functions",
      metadata: payload.metadata || {},
      acknowledged: false
    });
  } catch (dbError) {
    console.error("[Alert] Failed to log alert to Firestore:", dbError);
  }
  
  // Send email notification for critical alerts
  if (payload.severity === "critical") {
    try {
      // Email sending logic - can be implemented with SendGrid, SES, or SMTP
      // For now, just log it - you can integrate with your email service
      console.log("[Alert] Critical alert - email notification would be sent here");
      console.log("[Alert] To: admin@theqah.com");
      console.log("[Alert] Subject:", payload.title);
      console.log("[Alert] Body:", payload.message);
      
      // Example: await sendEmail({ to: "admin@theqah.com", subject: payload.title, body: payload.message });
    } catch (emailError) {
      console.error("[Alert] Failed to send email alert:", emailError);
    }
  }
}

/**
 * Helper function to log backup events
 */
export async function logBackupEvent(
  action: string,
  success: boolean,
  metadata?: Record<string, any>
): Promise<void> {
  const db = admin.firestore();
  
  await db.collection("backup_events").add({
    timestamp: new Date(),
    action,
    success,
    metadata: metadata || {},
    source: "firebase_functions"
  });
}
