// src/server/messaging/send-invite.ts
import { sendSms, type SendSmsResult } from "./send-sms";
import { sendEmailDmail } from "./email-dmail";
import { dbAdmin } from "@/lib/firebaseAdmin";

// بناء نص SMS افتراضي
export function buildInviteSmsDefault(storeName: string, url: string): string {
  return `مرحباً، طلبك من ${storeName} تم. شاركنا رأيك: ${url} — فريق ثقة`;
}

type MessageResult = {
  ok: boolean;
  id: string | null;
  error: string | null;
};

function asMessageResult(r: SendSmsResult): MessageResult {
  return { ok: r.ok, id: r.messageId || null, error: r.error || null };
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

  const smsText =
    (opts.smsTextOverride && opts.smsTextOverride.trim()) ||
    buildInviteSmsDefault(store, opts.url);

  const emailSubject =
    (opts.emailSubjectOverride && opts.emailSubjectOverride.trim()) ||
    "وش رأيك؟ نبي نسمع منك";

  const emailHtml =
    (opts.emailHtmlOverride && opts.emailHtmlOverride.trim()) ||
    `
      <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
        <p>مرحباً ${name}،</p>
        <p>طلبك من <strong>${store}</strong> تم. شاركنا رأيك لو تكرّمت.</p>
        <p>
          <a href="${opts.url}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
            اضغط للتقييم الآن
          </a>
        </p>
        <p style="color:#64748b">شكراً لك — فريق ثقة</p>
      </div>
    `.trim();

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
      sendEmailDmail(opts.email, emailSubject, emailHtml),
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
