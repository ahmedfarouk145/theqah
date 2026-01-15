// src/server/messaging/send-invite.ts
import { sendSms, type SendSmsResult } from "./send-sms";
import { sendEmailSendGrid as sendEmailDmail, type EmailSendResult } from "./email-sendgrid";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { buildUnifiedSMS, buildUnifiedEmailHTML, buildUnifiedEmailText, type ReviewInviteData } from "./unified-templates";

// بناء نص SMS افتراضي
export function buildInviteSmsDefault(storeName: string, url: string): string {
  return `مرحباً، طلبك من ${storeName} تم. شاركنا رأيك: ${url} — فريق ثقة`;
}

type MessageResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

function asMessageResult(r: SendSmsResult | EmailSendResult): MessageResult {
  if (r.ok) {
    return { ok: true, id: ('id' in r ? r.id : null) || null, error: null };
  } else {
    return { ok: false, id: null, error: ('error' in r ? r.error : 'unknown error') || null };
  }
}

type Channel = "sms" | "email";

async function recordInviteChannel(inviteId: string | undefined, channel: Channel, result: MessageResult) {
  if (!inviteId) return;
  try {
    const db = dbAdmin();
    await db.collection("invite_channels").add({
      inviteId,
      channel,
      ok: result.ok,
      messageId: result.id,
      error: result.error,
      sentAt: Date.now(),
    });
  } catch (e) {
    console.warn(`Failed to record ${channel} channel:`, e);
  }
}

// تسجيل تحذيرات اختياري
const warn = console.warn;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      (e) => { clearTimeout(id); reject(e); }
    );
  });
}

export interface SendBothOptions {
  inviteId?: string;
  phone?: string;
  email?: string;
  customerName?: string;
  storeName?: string;
  productName?: string; // ✅ اسم المنتج
  orderNumber?: string; // ✅ رقم الطلب
  url: string;

  // تخصيصات اختيارية
  smsTextOverride?: string;
  emailSubjectOverride?: string;
  emailHtmlOverride?: string;

  // مهلة لكل قناة
  perChannelTimeoutMs?: number;
}

/** يرسل SMS و Email بالتوازي فورًا. يرجّع النتيجة بعد استقرار القناتين (settled). */
export async function sendBothNow(opts: SendBothOptions) {
  const name = (opts.customerName || "العميل").trim();
  const store = (opts.storeName || "المتجر").trim();
  const timeout = opts.perChannelTimeoutMs ?? 15_000;
  
  // ✅ إنشاء بيانات موحدة للـ templates
  const templateData: ReviewInviteData = {
    customerName: name,
    storeName: store,
    productName: opts.productName,
    orderNumber: opts.orderNumber,
    reviewUrl: opts.url
  };

  // ✅ استخدام Template موحد للـ SMS
  const smsText =
    (opts.smsTextOverride && opts.smsTextOverride.trim()) ||
    buildUnifiedSMS(templateData);

  // ✅ موضوع الإيميل مع اسم المتجر والمنتج
  const emailSubject =
    (opts.emailSubjectOverride && opts.emailSubjectOverride.trim()) ||
    `قيّم تجربتك من ${store}${opts.productName ? ` - ${opts.productName}` : ''}`;
    
  // ✅ استخدام Template موحد للـ Email
  const emailHtml =
    (opts.emailHtmlOverride && opts.emailHtmlOverride.trim()) ||
    buildUnifiedEmailHTML(templateData);
    
  const emailText = buildUnifiedEmailText(templateData);

  const jobs: Promise<void>[] = [];

  if (opts.phone) {
    const job = withTimeout(
      sendSms(opts.phone, smsText, {
        defaultCountry: "SA",
        msgClass: "transactional",
        priority: 1,
        requestDlr: true,
      }),
      timeout,
      "sms"
    )
      .then(asMessageResult)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        warn?.("sms.send.failed", { e: msg });
        return { ok: false, id: null, error: msg } as MessageResult;
      })
      .then((res) => recordInviteChannel(opts.inviteId, "sms", res));

    jobs.push(job);
  }

  if (opts.email) {
    const job = withTimeout(
      sendEmailDmail(opts.email, emailSubject, emailHtml, emailText),
      timeout,
      "email"
    )
      .then(asMessageResult)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        warn?.("email.send.failed", { e: msg });
        return { ok: false, id: null, error: msg } as MessageResult;
      })
      .then((res) => recordInviteChannel(opts.inviteId, "email", res));

    jobs.push(job);
  }

  if (jobs.length === 0) {
    return {
      ok: false,
      attempts: [],
      note: "no_channel_available",
    };
  }

  const settled = await Promise.allSettled(jobs);

  const ok = settled.some((s) => s.status === "fulfilled");
  return {
    ok,
    attempts: settled.map((s) => ({
      status: s.status,
      error: s.status === "rejected" ? (s.reason?.message || String(s.reason)) : null,
    })),
  };
}

export type Attempt = {
  channel: Channel;
  ok: boolean;
  messageId: string | null;
  error: string | null;
};
