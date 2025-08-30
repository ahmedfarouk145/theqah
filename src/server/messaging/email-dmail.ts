// src/server/messaging/email-dmail.ts
import nodemailer from "nodemailer";

export type EmailSendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

function getConfig() {
  const host = process.env.DMAIL_SMTP_HOST || "mailserver.dmail.sa";
  const port = Number(process.env.DMAIL_SMTP_PORT || 465);
  const user = process.env.DMAIL_SMTP_USER || "";
  const pass = process.env.DMAIL_SMTP_PASS || "";
  const from = process.env.DMAIL_FROM || user || "ثقة <no-reply@theqah.com.sa>";
  if (!user || !pass) throw new Error("Missing DMAIL_SMTP_USER/PASS");
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
    secure: port === 465,
    auth: { user, pass },
  });

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text: textFallback ?? stripHtml(html),
    });
    return { ok: true, id: info.messageId || null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
