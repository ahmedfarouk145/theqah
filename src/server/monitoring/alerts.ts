// src/server/monitoring/alerts.ts
import { sendEmailDmail } from "../messaging/email-dmail";

const alertRateLimits = new Map<string, number>();
const RATE_LIMIT_DURATION = 60 * 60 * 1000;

export function isCriticalError(params: {
  statusCode?: number;
  error?: string;
  severity?: string;
}): boolean {
  const { statusCode, error, severity } = params;
  
  if (statusCode && statusCode >= 500) {
    return true;
  }
  
  if (severity === "critical") {
    return true;
  }
  
  if (error) {
    const criticalPatterns = [
      /auth.*fail/i,
      /authentication.*error/i,
      /database.*fail/i,
      /firebase.*error/i,
      /payment.*fail/i,
      /cannot.*connect/i,
      /timeout/i,
      /out of memory/i,
      /quota.*exceed/i,
    ];
    
    return criticalPatterns.some(pattern => pattern.test(error));
  }
  
  return false;
}

function shouldSendAlert(errorType: string): boolean {
  const lastSent = alertRateLimits.get(errorType);
  const now = Date.now();
  
  if (!lastSent || (now - lastSent) >= RATE_LIMIT_DURATION) {
    alertRateLimits.set(errorType, now);
    return true;
  }
  
  return false;
}

function getErrorType(params: {
  endpoint?: string;
  error?: string;
  statusCode?: number;
}): string {
  const { endpoint, error, statusCode } = params;
  const errorMsg = error ? error.substring(0, 50) : 'unknown';
  return `${endpoint || 'unknown'}_${statusCode || 0}_${errorMsg}`;
}
export async function sendEmailAlert(params: {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  error?: string;
  userId?: string;
  storeUid?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    endpoint = "unknown",
    method = "unknown",
    statusCode = 0,
    error = "Unknown error",
    userId,
    storeUid,
    metadata
  } = params;
  
  const errorType = getErrorType({ endpoint, error, statusCode });
  
  if (!shouldSendAlert(errorType)) {
    console.log(`[ALERT] Rate limited: ${errorType}`);
    return;
  }
  
  const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) {
    console.warn("[ALERT] No admin email configured, skipping alert");
    return;
  }
  
  const timestamp = new Date().toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
  const subject = ` خطأ حرج في TheQah - ${endpoint}`;
  
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;line-height:1.6;color:#333}.container{max-width:600px;margin:0 auto;padding:20px}.header{background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);color:white;padding:20px;border-radius:8px 8px 0 0}.content{background:#f9fafb;padding:20px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px}.error-box{background:white;border-right:4px solid #dc2626;padding:15px;margin:15px 0;border-radius:4px}.metadata{background:#f3f4f6;padding:10px;margin:10px 0;border-radius:4px;font-family:monospace;font-size:13px}.footer{text-align:center;color:#6b7280;font-size:12px;margin-top:20px}.status-badge{display:inline-block;padding:4px 12px;border-radius:12px;font-weight:bold}.status-error{background:#fee2e2;color:#991b1b}</style></head><body><div class="container"><div class="header"><h1 style="margin:0"> تنبيه خطأ حرج</h1><p style="margin:5px 0 0 0;opacity:0.9">نظام TheQah - مراقبة الأخطاء</p></div><div class="content"><div class="error-box"><h2 style="margin-top:0;color:#dc2626">تفاصيل الخطأ</h2><p><strong>نقطة النهاية:</strong> <code>${endpoint}</code></p><p><strong>الطريقة:</strong> ${method}</p><p><strong>حالة HTTP:</strong> <span class="status-badge status-error">${statusCode}</span></p><p><strong>الوقت:</strong> ${timestamp}</p><div style="margin-top:15px"><strong>رسالة الخطأ:</strong><div class="metadata">${error}</div></div>${userId?`<p><strong>معرف المستخدم:</strong> ${userId}</p>`:''}${storeUid?`<p><strong>معرف المتجر:</strong> ${storeUid}</p>`:''}${metadata&&Object.keys(metadata).length>0?`<div style="margin-top:15px"><strong>بيانات إضافية:</strong><div class="metadata">${JSON.stringify(metadata,null,2)}</div></div>`:''}</div><div style="background:#eff6ff;border-right:4px solid #3b82f6;padding:15px;margin:15px 0;border-radius:4px"><p style="margin:0"><strong> الإجراءات الموصى بها:</strong></p><ul style="margin:10px 0 0 20px"><li>التحقق من سجلات النظام</li><li>مراجعة لوحة مراقبة Vercel</li><li>التحقق من اتصالات Firebase</li>${statusCode>=500?'<li>فحص حالة الخوادم</li>':''}</ul></div></div><div class="footer"><p>هذا تنبيه تلقائي من نظام مراقبة TheQah</p><p>يتم إرسال التنبيهات فقط للأخطاء الحرجة</p></div></div></body></html>`;
  
  try {
    const result = await sendEmailDmail(adminEmail, subject, html, `خطأ حرج: ${endpoint} - ${error}`);
    
    if (result.ok) {
      console.log(`[ALERT] Email sent successfully to ${adminEmail}`);
    } else {
      console.error(`[ALERT] Failed to send email: ${result.error}`);
    }
  } catch (err) {
    console.error("[ALERT] Exception while sending email:", err);
  }
}

export async function sendSlackAlert(params: {
  endpoint?: string;
  error?: string;
  statusCode?: number;
}): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!slackWebhookUrl) {
    return;
  }
  
  const errorType = getErrorType(params);
  
  if (!shouldSendAlert(errorType)) {
    return;
  }
  
  try {
    const message = {
      text: ` Critical Error in TheQah`,
      blocks: [{
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Critical Error Detected*\n*Endpoint:* \`${params.endpoint}\`\n*Status:* ${params.statusCode}\n*Error:* ${params.error}`
        }
      }]
    };
    
    const response = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    
    if (response.ok) {
      console.log("[ALERT] Slack notification sent successfully");
    } else {
      console.error(`[ALERT] Slack notification failed: ${response.status}`);
    }
  } catch (err) {
    console.error("[ALERT] Exception while sending Slack alert:", err);
  }
}

export async function sendCriticalAlert(params: {
  endpoint?: string;
  method?: string;
  statusCode?: number;
  error?: string;
  userId?: string;
  storeUid?: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!isCriticalError(params)) {
    return;
  }
  
  console.log(`[ALERT] Critical error detected: ${params.endpoint}`);
  
  await Promise.allSettled([
    sendEmailAlert(params),
    sendSlackAlert(params)
  ]);
}
