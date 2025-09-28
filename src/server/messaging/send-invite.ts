// src/server/messaging/try-channels-fast.ts
import { getDb } from "@/server/firebase-admin";
import { sendSms } from "./send-sms";
import { sendEmailDmail } from "./email-dmail";
import { warn } from "@/lib/logger";
import { buildInviteSMS as buildInviteSmsDefault } from "./send-sms";

export type Channel = "sms" | "email";
type MessageResult = { ok: boolean; id?: string | null; error?: string | null };

function asMessageResult(r: unknown): MessageResult {
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const ok = Boolean(o.ok);
    const id = typeof o.id === "string" ? o.id : o.id == null ? null : String(o.id);
    const error = typeof o.error === "string" ? o.error : null;
    return { ok, id: id ?? null, error };
  }
  return { ok: false, id: null, error: "INVALID_RESULT" };
}

async function recordInviteChannel(
  inviteId: string | undefined,
  channel: Channel,
  res: MessageResult
) {
  if (!inviteId) return;
  const db = getDb();
  await db.collection("review_invites").doc(inviteId).set({
    lastSentAt: Date.now(),
    sentChannels: {
      [channel]: {
        ok: !!res.ok,
        id: res.id ?? null,
        error: res.error ?? null,
        at: Date.now(),
      },
    },
  }, { merge: true });
}

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

  // مهلة لكل قناة (افتراضي 15 ثانية)
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
