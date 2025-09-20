import { dbAdmin } from "@/lib/firebaseAdmin";
import crypto from "crypto";

export type Channel = "sms" | "email";

export type OutboxJob = {
  id: string;                    // jobId
  inviteId: string;
  storeUid: string;
  channels: Channel[];           // ["sms","email"]
  payload: {
    smsText?: string;
    phone?: string | null;
    emailHtml?: string;
    emailTo?: string | null;
    emailSubject?: string | null;
  };
  status: "pending" | "ok" | "fail" | "cancelled";
  attempts: number;
  nextAttemptAt: number;         // ms
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
  lockedBy?: string | null;
  lockedAt?: number | null;
  dlq?: boolean;
};

export function newId(prefix = "job"): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export async function enqueueInviteJob(args: {
  inviteId: string;
  storeUid: string;
  channels: Channel[];
  payload: OutboxJob["payload"];
}) {
  const db = dbAdmin();
  const id = newId();
  const now = Date.now();
  const job: OutboxJob = {
    id,
    inviteId: args.inviteId,
    storeUid: args.storeUid,
    channels: args.channels,
    payload: args.payload,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
    lastError: null,
    lockedBy: null,
    lockedAt: null,
    dlq: false,
  };
  await db.collection("outbox_jobs").doc(id).set(job);
  return id;
}

export async function leasePendingJobs(workerId: string, limit = 50) {
  const db = dbAdmin();
  const now = Date.now();
  const snap = await db.collection("outbox_jobs")
    .where("status", "==", "pending")
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt", "asc")
    .limit(limit)
    .get();

  const leased: OutboxJob[] = [];
  const batch = db.batch();
  snap.docs.forEach((d) => {
    const data = d.data() as OutboxJob;
    if (data.lockedBy && data.lockedAt && now - data.lockedAt < 5 * 60_000) return;
    batch.update(d.ref, { lockedBy: workerId, lockedAt: now, updatedAt: now });
    leased.push({ ...data, lockedBy: workerId, lockedAt: now });
  });
  if (leased.length) await batch.commit();
  return leased.map((j) => ({ ...j, updatedAt: now })) as OutboxJob[];
}

export async function completeJob(jobId: string, update: Partial<OutboxJob>) {
  const db = dbAdmin();
  await db.collection("outbox_jobs").doc(jobId).set(
    { ...update, updatedAt: Date.now(), lockedBy: null, lockedAt: null },
    { merge: true }
  );
}

export function computeNextBackoffMs(attempts: number) {
  // 1,2,4,8,15 دقائق
  const mins = Math.min(15, Math.pow(2, Math.max(0, attempts)));
  return mins * 60_000;
}
