import { dbAdmin } from "@/lib/firebaseAdmin";
import { leasePendingJobs, completeJob, computeNextBackoffMs, OutboxJob } from "@/server/queue/outbox";
import { canSendSMS, canSendEmail } from "@/server/queue/rate-limit";
import sendSms from "@/server/messaging/send-sms";
import { getOursmsDlrs } from "@/server/messaging/send-sms"; // بولر DLRs الجاهز
import { sendEmailDmail as sendEmail } from "@/server/messaging/email-dmail";

const MAX_ATTEMPTS = 5;

function workerId() {
  return `w_${Math.random().toString(36).slice(2, 8)}`;
}

/** ---------- Helpers & Types (no-any) ---------- */

type SmsResult = {
  ok: boolean;
  id?: string | null;
  error?: string | null;
};

type EmailResult = {
  ok: boolean;
  id?: string | null;
};

type UnknownObject = Record<string, unknown>;

function isObject(x: unknown): x is UnknownObject {
  return x !== null && typeof x === "object";
}

function getBool(obj: unknown, key: string, fallback = false): boolean {
  return isObject(obj) && typeof obj[key] === "boolean" ? (obj[key] as boolean) : fallback;
}

function getString(obj: unknown, key: string): string | null {
  return isObject(obj) && typeof obj[key] === "string" ? (obj[key] as string) : null;
}

function readError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "unknown_error";
  }
}

/** OurSMS DLR item (we accept multiple potential shapes) */
type DlrItem = {
  message_id?: string;
  jobId?: string;
  id?: string;
  status?: string;
  Status?: string;
  error?: string;
};

function toDlrArray(x: unknown): DlrItem[] {
  if (Array.isArray(x)) return x as DlrItem[];
  if (isObject(x)) {
    const candidates = ["items", "dlrs", "results"] as const;
    for (const key of candidates) {
      const maybe = x[key];
      if (Array.isArray(maybe)) return maybe as DlrItem[];
    }
  }
  return [];
}

/** ---------- Firestore helpers ---------- */

async function recordChannelResult(
  inviteId: string,
  channel: "sms" | "email",
  ok: boolean,
  id?: string | null,
  error?: string | null
) {
  const db = dbAdmin();
  await db
    .collection("review_invites")
    .doc(inviteId)
    .set(
      {
        sentChannels: { [channel]: { ok, id: id ?? null, error: error ?? null, at: Date.now() } },
        lastSentAt: Date.now(),
      },
      { merge: true }
    );
}

/** ---------- Core processing ---------- */

async function processJob(job: OutboxJob) {
  const now = Date.now();
  let smsOk = true,
    emailOk = true;
  let smsId: string | null = null;
  let emailId: string | null = null;
  let lastError: string | null = null;

  for (const ch of job.channels) {
    if (ch === "sms") {
      if (!job.payload.phone || !job.payload.smsText) continue;

      if (!canSendSMS(job.storeUid)) {
        await completeJob(job.id, { nextAttemptAt: now + 1000, lastError: "RATE_LIMIT_SMS" });
        return;
      }

      try {
        const r: unknown = await sendSms(job.payload.phone, job.payload.smsText, {
          defaultCountry: "SA",
          msgClass: "transactional",
          priority: 1,
          requestDlr: true,
        });

        // Derive fields without any
        const ok = getBool(r, "ok", false);
        const id = getString(r, "id");
        const err = getString(r, "error");

        smsOk = ok;
        smsId = id;
        await recordChannelResult(job.inviteId, "sms", smsOk, smsId, ok ? null : err ?? "sms_failed");
      } catch (e: unknown) {
        smsOk = false;
        lastError = readError(e);
        await recordChannelResult(job.inviteId, "sms", false, null, lastError);
      }
    }

    if (ch === "email") {
      if (!job.payload.emailTo || !job.payload.emailHtml) continue;

      if (!canSendEmail(job.storeUid)) {
        await completeJob(job.id, { nextAttemptAt: now + 1000, lastError: "RATE_LIMIT_EMAIL" });
        return;
      }

      try {
        const r: unknown = await sendEmail(
          job.payload.emailTo,
          job.payload.emailSubject || "ثقة",
          job.payload.emailHtml
        );

        // Avoid "Right operand of ?? is unreachable" by not using !! ... ?? true
        const ok = getBool(r, "ok", true); // if not provided, assume true
        emailOk = ok;
        emailId = getString(r, "id");

        await recordChannelResult(job.inviteId, "email", ok, emailId, ok ? null : "email_failed");
      } catch (e: unknown) {
        emailOk = false;
        lastError = readError(e);
        await recordChannelResult(job.inviteId, "email", false, null, lastError);
      }
    }
  }

  const allOk = job.channels.every((ch) => (ch === "sms" ? smsOk : emailOk));
  if (allOk) {
    await completeJob(job.id, { status: "ok", lastError: null });
    return;
  }

  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await completeJob(job.id, { status: "fail", attempts, dlq: true, lastError });
    return;
  }

  const backoff = computeNextBackoffMs(attempts);
  await completeJob(job.id, {
    status: "pending",
    attempts,
    lastError,
    nextAttemptAt: Date.now() + backoff,
  });
}

/** ---------- Poll DLRs from OurSMS ---------- */
async function pollOursmsDlrs(max = 200) {
  try {
    const data: unknown = await getOursmsDlrs(Math.max(1, Math.min(500, max)));
    const items = toDlrArray(data);

    if (!Array.isArray(items) || items.length === 0) return { ok: true as const, matched: 0 };

    const db = dbAdmin();
    let matched = 0;

    for (const it of items) {
      // normalize message id
      const msgIdRaw = it.message_id ?? it.jobId ?? it.id ?? "";
      const msgId = String(msgIdRaw).trim();
      if (!msgId) continue;

      const statusRaw = it.status ?? it.Status ?? "";
      const status = String(statusRaw).toUpperCase();

      const delivered =
        status.includes("DELIVERED") || status === "DLR_DELIVERED" || status === "DELIVERED";

      const snap = await db
        .collection("review_invites")
        .where("sentChannels.sms.id", "==", msgId)
        .limit(1)
        .get();
      if (snap.empty) continue;

      const doc = snap.docs[0];
      await doc.ref.set(
        {
          deliveredAt: delivered ? Date.now() : null,
          sentChannels: {
            sms: {
              id: msgId,
              ok: delivered,
              error: delivered ? null : (it.error ?? status ?? "UNKNOWN"),
              at: Date.now(),
            },
          },
        },
        { merge: true }
      );

      matched++;
    }

    return { ok: true as const, matched };
  } catch (e: unknown) {
    return { ok: false as const, error: readError(e) };
  }
}

/** ---------- Public runner ---------- */
export async function runWorkerOnce(batchSize = 50) {
  const wid = workerId();
  const jobs = await leasePendingJobs(wid, batchSize);
  for (const j of jobs) {
    await processJob(j);
  }
  // بعد المعالجة، اسحب DLRs
  await pollOursmsDlrs(200);
  return jobs.length;
}
