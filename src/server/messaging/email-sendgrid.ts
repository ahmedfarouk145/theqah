// src/server/messaging/email-sendgrid.ts
import sgMail from '@sendgrid/mail';

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

export async function sendEmailSendGrid(
  to: string,
  subject: string,
  html: string,
  textFallback?: string
): Promise<EmailSendResult> {
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
    
    console.log(`[SENDGRID] ✅ Email sent successfully - Message ID: ${response[0]?.headers?.['x-message-id'] || 'unknown'}`);
    
    return { 
      ok: true, 
      id: response[0]?.headers?.['x-message-id'] || null 
    };
    
  } catch (error: any) {
    const errorMessage = error?.response?.body?.errors?.[0]?.message || 
                        error?.message || 
                        String(error);
                        
    console.error(`[SENDGRID] ❌ Failed to send email to ${to}:`, {
      error: errorMessage,
      subject,
      statusCode: error?.code || error?.response?.statusCode
    });
    
    return { 
      ok: false, 
      error: errorMessage 
    };
  }
}

// Re-export with original function name for compatibility
export const sendEmailDmail = sendEmailSendGrid;
