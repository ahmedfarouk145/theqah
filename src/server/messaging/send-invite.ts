// src/server/messaging/send-invite.ts
import { getDb } from "@/server/firebase-admin";
import { sendSms } from "./send-sms";
import { sendEmailDmail } from "./email-dmail";
import { warn } from "@/lib/logger";
import { buildReviewSms } from "./templates";

export type Country = "sa"; // السعودية فقط الآن
export type Channel = "sms" | "email";

// نضيف timestamp داخل Attempt عشان نعرف أول قناة نجحت فعليًا حتى مع التنفيذ المتوازي
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
  country: Country; // ثابت "sa"
  phone?: string;
  email?: string;
  customerName?: string;
  storeName?: string;
  url: string;
  /**
   * "all": ابعت كل القنوات معًا (متوازي) — (الموصى به)
   * "first_success": يكتفي بأول نجاح (هنحدده بعد التنفيذ المتوازي حسب أسرع نجاح)
   */
  strategy?: "all" | "first_success";
  /** ترتيب القنوات (لأولوية تحديد أول نجاح فقط) */
  order?: Channel[];
}

export type Attempt = {
  channel: Channel;
  ok: boolean;
  id?: string | null;
  error?: string | null;
  at?: number; // وقت اكتمال المحاولة (ms)
};

export type TryChannelsResult = {
  ok: boolean;
  firstSuccessChannel: Channel | null;
  attempts: Attempt[];
};

/** تطبيع نتيجة أي مزوّد لشكل موحّد */
function asMessageResult(r: unknown): MessageResult {
  if (r && typeof r === "object") {
    const o = r as Record<string, unknown>;
    const ok = Boolean(o.ok);
    const id =
      typeof o.id === "string" ? o.id : o.id == null ? null : String(o.id);
    const error = typeof o.error === "string" ? o.error : null;
    return { ok, id: id ?? null, error };
  }
  return { ok: false, id: null, error: "INVALID_RESULT" };
}

/**
 * ✅ تعديل جذري:
 * - نجمع مهام الإرسال في Array ونشغّلها معًا بـ Promise.allSettled
 * - نرفع أولوية SMS + transactional + نطلب DLR + نثبّت الدولة للسعودية
 * - نرجّع أول قناة نجحت فعليًا (الأسرع) باستخدام timestamps
 */
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

  // الترتيب الافتراضي: SMS ثم Email
  const defaultOrder: Channel[] = ["sms", "email"];
  const order: Channel[] = (opts.order && opts.order.length ? opts.order : defaultOrder);

  // نجمع المهام المتاحة (حسب وجود phone/email)
  type Task = () => Promise<Attempt>;
  const tasks: Task[] = [];

  // helper: يسجّل Attempt ويكتب في review_invites لو فيه inviteId
  const finalizeAttempt = async (attempt: Attempt) => {
    if (opts.inviteId) {
      await recordInviteChannel(opts.inviteId, attempt.channel, {
        ok: attempt.ok,
        id: attempt.id ?? null,
        error: attempt.error ?? null,
      });
    }
    return attempt;
  };

  // 🇸🇦 خيارات SMS للسعودية فقط + تسريع التسليم:
  const smsOpts = {
    defaultCountry: "SA" as const,
    msgClass: "transactional" as const,
    priority: 1 as const,      // أعلى من الافتراضي
    requestDlr: true as const, // نحتاج تتبع التسليم
  };

  if (opts.phone) {
    tasks.push(async () => {
      try {
        const r = await sendSms(opts.phone!, smsText, smsOpts);
        const mr = asMessageResult(r);
        const attempt: Attempt = {
          channel: "sms",
          ok: mr.ok,
          id: mr.id ?? null,
          error: mr.error ?? null,
          at: Date.now(),
        };
        return finalizeAttempt(attempt);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        warn("sms.send.failed", { e: errMsg });
        return finalizeAttempt({
          channel: "sms",
          ok: false,
          id: null,
          error: errMsg,
          at: Date.now(),
        });
      }
    });
  }

  if (opts.email) {
    tasks.push(async () => {
      try {
        const r = await sendEmailDmail(opts.email!, "وش رأيك؟ نبي نسمع منك", html);
        const mr = asMessageResult(r);
        const attempt: Attempt = {
          channel: "email",
          ok: mr.ok,
          id: mr.id ?? null,
          error: mr.error ?? null,
          at: Date.now(),
        };
        return finalizeAttempt(attempt);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        warn("email.send.failed", { e: errMsg });
        return finalizeAttempt({
          channel: "email",
          ok: false,
          id: null,
          error: errMsg,
          at: Date.now(),
        });
      }
    });
  }

  // لو مفيش ولا قناة متاحة
  if (tasks.length === 0) {
    return { ok: false, firstSuccessChannel: null, attempts: [] };
  }

  // ✅ تنفيذ متوازي للقنوات
  const settled = await Promise.allSettled(tasks.map((t) => t()));
  const attempts: Attempt[] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : { channel: "sms", ok: false, id: null, error: "TASK_FAILED", at: Date.now() }
  );

  // ok العام:
  const ok = attempts.some((a) => a.ok);

  // تحديد أول قناة نجحت فعليًا (الأسرع) بناءً على at + ترتيب تفضيلي (order)
  let firstSuccessChannel: Channel | null = null;
  const successAttempts = attempts.filter((a) => a.ok && a.at);
  if (successAttempts.length > 0) {
    // رتب حسب الزمن أولًا، ولو تعادل نرجّح حسب order
    successAttempts.sort((a, b) => {
      if ((a.at! - b.at!) !== 0) return a.at! - b.at!;
      // ترجيح حسب order لو متساويين في الزمن
      return order.indexOf(a.channel) - order.indexOf(b.channel);
    });
    firstSuccessChannel = successAttempts[0].channel;
  }

  // لو الاستراتيجية first_success وكان فيه نجاح — تمام. لو مفيش نجاح — ok=false بالفعل
  // في "all" إحنا دايمًا شغّلنا الاثنين معًا؛ ده المطلوب علشان يصلوا في نفس الوقت.

  return { ok, firstSuccessChannel, attempts };
}
