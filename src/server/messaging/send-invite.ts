// src/server/messaging/send-invite.ts
import { getDb } from "@/server/firebase-admin";
import { sendSms } from "./send-sms";
import { sendEmailDmail } from "./email-dmail";
import { warn } from "@/lib/logger";
import { buildReviewSms } from "./templates";

export type Country = "eg" | "sa";
// بعد إزالة واتساب
export type Channel = "sms" | "email";

// توحيد نتيجة أي مزود (محلي، لا يعتمد على ملفات تانية)
type MessageResult = { ok: boolean; id?: string | null; error?: string | null };

export async function recordInviteChannel(
  inviteId: string,
  channel: Channel,
  result: { ok: boolean; error?: string | null; id?: string | null }
) {
  const db = getDb();
  const ref = db.collection("review_invites").doc(inviteId);
  await ref.set(
    {
      lastSentAt: Date.now(),
      sentChannels: {
        [channel]: {
          ok: !!result.ok,
          id: result.id ?? null,
          error: result.error ?? null,
          at: Date.now(),
        },
      },
    },
    { merge: true }
  );
}

export interface TryChannelsOptions {
  inviteId?: string;
  country: Country;
  phone?: string;
  email?: string;
  customerName?: string;
  storeName?: string;
  url: string;
  strategy?: "all" | "first_success";
  /** ترتيب القنوات اختيارياً (مثلاً ["sms","email"]) */
  order?: Channel[];
}

export type Attempt = { channel: Channel; ok: boolean; id?: string | null; error?: string | null };
export type TryChannelsResult = {
  ok: boolean;
  firstSuccessChannel: Channel | null;
  attempts: Attempt[];
};

/** تطبيع نتيجة أي مزوّد لشكل موحّد بدون استخدام any */
function asMessageResult(r: unknown): MessageResult {
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const ok = Boolean(o.ok);
    const id =
      typeof o.id === "string"
        ? o.id
        : o.id == null
        ? null
        : String(o.id);
    const error = typeof o.error === "string" ? o.error : null;
    return { ok, id: id ?? null, error };
  }
  return { ok: false, id: null, error: "INVALID_RESULT" };
}

export async function tryChannels(opts: TryChannelsOptions): Promise<TryChannelsResult> {
  const strategy = opts.strategy || "all";
  const name = opts.customerName || "العميل";
  const store = opts.storeName || "المتجر";

  // نصوص القنوات
  const smsText = buildReviewSms(name, store, opts.url);
  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
      <p>مرحباً ${name}،</p>
      <p>يعطيك العافية على طلبك من <strong>${store}</strong>.</p>
      <p>وش رأيك تشاركنا رأيك؟ تقييمك يهمنا ويساعد غيرك 😊</p>
      <p>
        <a href="${opts.url}" style="background:#16a34a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
          اضغط للتقييم الآن
        </a>
      </p>
      <p style="color:#64748b">شكراً لك — فريق ثقة</p>
    </div>
  `.trim();

  // بعد إزالة واتساب: الترتيب الافتراضي ثابت
  const defaultOrder: Channel[] = ["sms", "email"];
  const order: Channel[] = (opts.order && opts.order.length ? opts.order : defaultOrder);

  const attempts: Attempt[] = [];
  let firstSuccessChannel: Channel | null = null;

  // Helper لإيقاف مبكّر لو strategy=first_success
  const stopEarly = () => strategy === "first_success" && firstSuccessChannel !== null;

  for (const ch of order) {
    if (stopEarly()) break;

    try {
      if (ch === "sms") {
        if (!opts.phone) continue;
        const r = await sendSms(opts.phone, smsText);
        const mr = asMessageResult(r);
        const attempt: Attempt = { channel: "sms", ok: mr.ok, id: mr.id ?? null, error: mr.error ?? null };
        attempts.push(attempt);
        if (opts.inviteId) await recordInviteChannel(opts.inviteId, "sms", attempt);
        if (attempt.ok && strategy === "first_success" && firstSuccessChannel === null) firstSuccessChannel = "sms";
      } else if (ch === "email") {
        if (!opts.email) continue;
        const r = await sendEmailDmail(opts.email, "وش رأيك؟ نبي نسمع منك", html);
        const mr = asMessageResult(r);
        const attempt: Attempt = { channel: "email", ok: mr.ok, id: mr.id ?? null, error: mr.error ?? null };
        attempts.push(attempt);
        if (opts.inviteId) await recordInviteChannel(opts.inviteId, "email", attempt);
        if (attempt.ok && strategy === "first_success" && firstSuccessChannel === null) firstSuccessChannel = "email";
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      warn(`${ch}.send.failed`, { e: errMsg });
      const attempt: Attempt = { channel: ch, ok: false, id: null, error: errMsg };
      attempts.push(attempt);
      if (opts.inviteId) await recordInviteChannel(opts.inviteId, ch, attempt);
    }
  }

  const ok =
    strategy === "first_success"
      ? firstSuccessChannel !== null
      : attempts.some((a) => a.ok) || attempts.length > 0;

  return { ok, firstSuccessChannel, attempts };
}
