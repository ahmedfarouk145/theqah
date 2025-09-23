// src/worker/outbox-worker.ts
import { dbAdmin } from "@/lib/firebaseAdmin";
import { leasePendingJobs, markOk, requeue, type OutboxJob } from "@/server/queue/outbox";
import { canSend } from "@/server/queue/rate-limit";
import { sendSms, type SendSmsOptions } from "@/server/messaging/send-sms";
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WORKER_ID = `w_${Math.random().toString(36).slice(2, 8)}`;

function nowMs() {
  return Date.now();
}

/** ---------- Typed payload instead of any ---------- */
interface SmsPayload {
  to?: string;
  phone?: string;
  text?: string;
  smsText?: string;
}
interface EmailPayload {
  emailTo?: string;
  subject?: string;
  html?: string;
  emailHtml?: string;
}
type JobPayload = SmsPayload & EmailPayload;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asJobPayload(v: unknown): JobPayload {
  const p: JobPayload = {};
  if (!isRecord(v)) return p;

  const o = v as Record<string, unknown>;
  if (typeof o.to === "string") p.to = o.to;
  if (typeof o.phone === "string") p.phone = o.phone;
  if (typeof o.text === "string") p.text = o.text;
  if (typeof o.smsText === "string") p.smsText = o.smsText;
  if (typeof o.emailTo === "string") p.emailTo = o.emailTo;
  if (typeof o.subject === "string") p.subject = o.subject;
  if (typeof o.html === "string") p.html = o.html;
  if (typeof o.emailHtml === "string") p.emailHtml = o.emailHtml;

  return p;
}
/** ----------------------------------------------- */

async function record(
  inviteId: string,
  channel: "sms" | "email",
  r: { ok: boolean; id?: string | null; error?: string | null }
) {
  const db = dbAdmin();
  const at = nowMs();
  await db.collection("review_invites").doc(inviteId).set(
    {
      [`sentChannels.${channel}`]: {
        ok: r.ok,
        id: r.id ?? null,
        error: r.error ?? null,
        at,
      },
      lastSentAt: at,
    },
    { merge: true }
  );
}

async function incUsage(storeUid: string) {
  const db = dbAdmin();
  const ref = db.collection("stores").doc(storeUid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = Number(snap.data()?.usage?.invitesUsed ?? 0) + 1;
    tx.set(ref, { usage: { invitesUsed: used } }, { merge: true });
  });
}

async function handle(job: OutboxJob) {
  const errs: string[] = [];
  let anyOk = false;

  const payload = asJobPayload(job.payload);

  for (const ch of job.channels) {
    if (!canSend(job.storeUid, ch)) {
      errs.push(`RateLimited:${ch}`);
      continue;
    }

    if (ch === "sms") {
      try {
        const to = String(payload.to ?? payload.phone ?? "");
        const text = String(payload.text ?? payload.smsText ?? "");
        if (!to || !text) throw new Error("missing_sms_fields");

        const opts: SendSmsOptions = { requestDlr: true };
        const r = await sendSms(to, text, opts);

        anyOk ||= r.ok;
        await record(job.inviteId, "sms", r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await record(job.inviteId, "sms", { ok: false, error: msg });
        errs.push(`sms:${msg}`);
      }
    }

    if (ch === "email") {
      try {
        const emailTo = String(payload.emailTo ?? "");
        const subject = String(payload.subject ?? "قيّم تجربتك معنا");
        const html = String(payload.html ?? payload.emailHtml ?? "");
        if (!emailTo || !html) throw new Error("missing_email_fields");

        const r = await sendEmail(emailTo, subject, html);
        anyOk ||= r.ok;
        await record(job.inviteId, "email", r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await record(job.inviteId, "email", { ok: false, error: msg });
        errs.push(`email:${msg}`);
      }
    }
  }

  if (anyOk) {
    try {
      await incUsage(job.storeUid);
    } catch {
      /* ignore usage increment errors */
    }
    await markOk(job.jobId);
  } else {
    await requeue(job, errs.join("; "));
  }
}

/**
 * يُنفّذ دفعة واحدة (batch) من outbox_jobs — يعيد عدد الـ jobs التي تم معالجتها
 */
async function tick(maxJobs = 20, leaseMs = 30_000): Promise<number> {
  const jobs = await leasePendingJobs(WORKER_ID, maxJobs, leaseMs);
  let processed = 0;
  for (const j of jobs) {
    try {
      await handle(j);
      processed += 1;
    } catch (e) {
      await requeue(j, e instanceof Error ? e.message : String(e));
    }
  }
  return processed;
}

// --- ESM-safe main-module check (بدون require) ---
const isMainModule = (() => {
  try {
    if (!process?.argv?.[1]) return false;
    const thisFile = path.normalize(fileURLToPath(import.meta.url));
    const invoked = path.normalize(path.resolve(process.argv[1]));
    return thisFile === invoked;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  (async function loop() {
    for (;;) {
      try {
        await tick(); // الافتراضي
      } catch {
        /* ignore loop errors */
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  })();
}

/** ✅ التصدير:
 *  - default: runWorkerOnce(maxJobs?, leaseMs?)
 *  - named  : tick
 */
export { tick };
export const runWorkerOnce = tick;
export default runWorkerOnce;
