// src/server/messaging/email-sendgrid.ts
import sgMail from '@sendgrid/mail';
import { dbAdmin } from "@/lib/firebaseAdmin";

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

let isConfigured = false;

function configureSendGrid() {
  if (isConfigured) return;
  
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY environment variable");
  }
  
  sgMail.setApiKey(apiKey);
  isConfigured = true;
  
  console.log(`[SENDGRID] Configured successfully`);
}

// Enhanced logging function
async function logEmailAttempt(
  to: string,
  subject: string,
  success: boolean,
  messageId?: string | null,
  error?: string
) {
  try {
    const db = dbAdmin();
    const logData = {
      to,
      subject,
      success,
      messageId: messageId || null,
      error: error || null,
      timestamp: Date.now(),
      service: 'sendgrid',
      createdAt: new Date().toISOString()
    };
    
    // Log to email_logs collection
    await db.collection("email_logs").add(logData);
    
    // Update stats
    const statsRef = db.collection("email_stats").doc("summary");
    await db.runTransaction(async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      const currentStats = statsDoc.exists ? statsDoc.data() : {};
      
      transaction.set(statsRef, {
        totalAttempts: (currentStats.totalAttempts || 0) + 1,
        successful: success ? (currentStats.successful || 0) + 1 : (currentStats.successful || 0),
        failed: success ? (currentStats.failed || 0) : (currentStats.failed || 0) + 1,
        lastAttempt: Date.now(),
        updatedAt: Date.now()
      }, { merge: true });
    });
    
  } catch (logError) {
    console.error("[SENDGRID] Failed to log email attempt:", logError);
  }
}

export async function sendEmailSendGrid(
  to: string,
  subject: string,
  html: string,
  textFallback?: string
): Promise<EmailSendResult> {
  let messageId: string | null = null;
  let success = false;
  let errorMessage = "";

  try {
    configureSendGrid();
    
    // Use verified sender email - fallback to gmail if not configured
    const from = process.env.SENDGRID_FROM || process.env.EMAIL_FROM || "zeyadmawjoud@gmail.com";
    
    console.log(`[SENDGRID] Sending email to: ${to} from: ${from}`);
    
    const msg = {
      to,
      from,
      subject,
      html,
      text: textFallback || html.replace(/<[^>]*>/g, '').trim(),
      // Optional: add tracking
      trackingSettings: {
        clickTracking: {
          enable: true,
          enableText: false
        },
        openTracking: {
          enable: true
        }
      },
      // Optional: categories for analytics
      categories: ['theqah', 'review-invite']
    };

    const response = await sgMail.send(msg);
    messageId = response[0]?.headers?.['x-message-id'] || null;
    success = true;
    
    console.log(`[SENDGRID] ✅ Email sent successfully - Message ID: ${messageId || 'unknown'}`);
    
    // Log success
    await logEmailAttempt(to, subject, true, messageId);
    
    return { 
      ok: true, 
      id: messageId
    };
    
  } catch (error: unknown) {
    errorMessage = (error as { response?: { body?: { errors?: { message?: string }[] } }; message?: string })?.response?.body?.errors?.[0]?.message || 
                   (error as Error)?.message || 
                   String(error);
                        
    console.error(`[SENDGRID] ❌ Failed to send email to ${to}:`, {
      error: errorMessage,
      subject,
      statusCode: (error as { code?: number; response?: { statusCode?: number } })?.code || (error as { response?: { statusCode?: number } })?.response?.statusCode
    });
    
    // Log failure
    await logEmailAttempt(to, subject, false, null, errorMessage);
    
    return { 
      ok: false, 
      error: errorMessage 
    };
  }
}

// Re-export with original function name for compatibility
export const sendEmailDmail = sendEmailSendGrid;
