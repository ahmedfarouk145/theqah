// src/server/messaging/email-dmail.ts
import nodemailer from "nodemailer";

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

function getConfig() {
  const host = process.env.DMAIL_SMTP_HOST || process.env.EMAIL_HOST || "mailserver.dmail.sa";
  const port = Number(process.env.DMAIL_SMTP_PORT || process.env.EMAIL_PORT || 465);
  const user = process.env.DMAIL_SMTP_USER || process.env.EMAIL_USER || "";
  const pass = process.env.DMAIL_SMTP_PASS || process.env.EMAIL_PASS || "";
  const from = process.env.DMAIL_FROM || process.env.EMAIL_FROM || user || "ثقة <no-reply@theqah.com.sa>";
  if (!user || !pass) {
    console.warn("[EMAIL] Missing SMTP credentials - EMAIL_USER/EMAIL_PASS or DMAIL_SMTP_USER/DMAIL_SMTP_PASS");
    throw new Error("Missing EMAIL_USER/EMAIL_PASS or DMAIL_SMTP_USER/DMAIL_SMTP_PASS");
  }
  return { host, port, user, pass, from };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendEmailDmail(
  to: string,
  subject: string,
  html: string,
  textFallback?: string
): Promise<EmailSendResult> {
  const { host, port, user, pass, from } = getConfig();

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // SMTPS
    auth: { user, pass },

    // ⚡️ تحسينات السرعة/الاستقرار
    pool: true,             // إعادة استخدام الاتصال
    maxConnections: 5,
    maxMessages: 50,
    rateDelta: 60_000,      // نافذة دقيقة
    rateLimit: 100,         // حد 100 رسالة/دقيقة عبر البوول

    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  try {
    console.log(`محاولة إرسال إيميل إلى: ${to} باستخدام SMTP: ${host}:${port}`);

    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: textFallback ?? stripHtml(html),
      priority: "high", // Nodemailer-level priority
      headers: {
        "X-Priority": "1 (Highest)",
        "X-MSMail-Priority": "High",
        Importance: "high",
      },
    });

    console.log(`✅ تم إرسال الإيميل بنجاح - Message ID: ${info.messageId}`);
    return { ok: true, id: info.messageId || null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ فشل في إرسال الإيميل إلى ${to}:`, { error: msg, subject });
    return { ok: false, error: msg };
  }
}

// ✅ طرق تصدير متعددة للتوافق مع الاستيراد القديم
export default sendEmailDmail;          // يسمح: import sendEmailDmail from "..."
export { sendEmailDmail as sendEmail }; // يسمح: import { sendEmail } from "..."
