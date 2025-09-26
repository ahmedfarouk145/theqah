import { getDb } from "@/server/firebase-admin";
import { sendSms } from "./send-sms";
import { sendEmailDmail } from "./email-dmail";
import { warn } from "@/lib/logger";
import { buildReviewSms } from "./templates";

export type Country = "sa";
export type Channel = "sms" | "email";

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
  order?: Channel[];
}

export type Attempt = {
  channel: Channel;
  ok: boolean;
  id?: string | null;
  error?: string | null;
  at?: number;
};

export type TryChannelsResult = {
  ok: boolean;
  firstSuccessChannel: Channel | null;
  attempts: Attempt[];
};

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

// helper: timeout لكل قناة
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${label}_timeout_${ms}ms`)), ms);
    p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); });
  });
}

export async function tryChannels(opts: TryChannelsOptions): Promise<TryChannelsResult> {
  const strategy = opts.strategy || "all";
  const name = opts.customerName || "العميل";
  const store = opts.storeName || "المتجر";

  const smsText = buildReviewSms(name, store, opts.url);
  const html = `
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

  const defaultOrder: Channel[] = ["sms", "email"];
  const order: Channel[] = (opts.order && opts.order.length ? opts.order : defaultOrder);

  type Task = () => Promise<Attempt>;
  const tasks: Task[] = [];

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

  const smsOpts = {
    defaultCountry: "SA" as const,
    msgClass: "transactional" as const,
    priority: 1 as const,
    requestDlr: true as const,
  };

  // مهلة صارمة لكل قناة
  const CHANNEL_TIMEOUT_MS = 25000;

  if (opts.phone) {
    tasks.push(async () => {
      try {
        const r = await withTimeout(
          sendSms(opts.phone!, smsText, smsOpts),
          CHANNEL_TIMEOUT_MS,
          "sms"
        );
        const mr = asMessageResult(r);
        return finalizeAttempt({
          channel: "sms",
          ok: mr.ok,
          id: mr.id ?? null,
          error: mr.error ?? null,
          at: Date.now(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn("sms.send.failed", { e: msg });
        return finalizeAttempt({
          channel: "sms",
          ok: false,
          id: null,
          error: msg,
          at: Date.now(),
        });
      }
    });
  }

  if (opts.email) {
    tasks.push(async () => {
      try {
        const r = await withTimeout(
          sendEmailDmail(opts.email!, "وش رأيك؟ نبي نسمع منك", html),
          CHANNEL_TIMEOUT_MS,
          "email"
        );
        const mr = asMessageResult(r);
        return finalizeAttempt({
          channel: "email",
          ok: mr.ok,
          id: mr.id ?? null,
          error: mr.error ?? null,
          at: Date.now(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        warn("email.send.failed", { e: msg });
        return finalizeAttempt({
          channel: "email",
          ok: false,
          id: null,
          error: msg,
          at: Date.now(),
        });
      }
    });
  }

  if (tasks.length === 0) {
    return { ok: false, firstSuccessChannel: null, attempts: [] };
  }

  const settled = await Promise.allSettled(tasks.map((t) => t()));
  const attempts: Attempt[] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : {
      channel: "sms", ok: false, id: null, error: "TASK_FAILED", at: Date.now()
    }
  );

  const ok = attempts.some((a) => a.ok);

  let firstSuccessChannel: Channel | null = null;
  const successAttempts = attempts.filter((a) => a.ok && a.at);
  if (successAttempts.length > 0) {
    successAttempts.sort((a, b) => {
      if ((a.at! - b.at!) !== 0) return a.at! - b.at!;
      return order.indexOf(a.channel) - order.indexOf(b.channel);
    });
    firstSuccessChannel = successAttempts[0].channel;
  }

  return { ok, firstSuccessChannel, attempts };
}
