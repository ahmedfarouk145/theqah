// src/server/notifications.ts
export async function sendSMS(to: string, text: string) {
  console.log("[SMS]", { to, text });
  return { ok: true as const };
}
export async function sendWhatsApp(to: string, text: string) {
  console.log("[WA]", { to, text });
  return { ok: true as const };
}
export async function sendEmail(to: string, subject: string, html?: string) {
  console.log("[EMAIL]", { to, subject, hasHtml: Boolean(html) });
  return { ok: true as const };
}
