// src/server/queue/outbox.ts
import { dbAdmin } from "@/lib/firebaseAdmin";

export type Channel = "sms" | "email";
export type OutboxJobStatus = "pending" | "leased" | "ok" | "fail" | "dead";

export interface OutboxJob {
  jobId: string;
  inviteId: string;
  storeUid: string;
  channels: Channel[];
  payload: Record<string, unknown>;
  status: OutboxJobStatus;
  attempts: number;
  lastError?: string | null;
  leasedBy?: string | null;
  leaseUntil?: number | null;      // ms epoch
  nextRunAt?: number | null;       // ms epoch
  createdAt: number;
  updatedAt: number;
}

const COLL = "outbox_jobs";

export const enqueueOutboxJob = async (
  input: Omit<OutboxJob, "status" | "attempts" | "createdAt" | "updatedAt" | "jobId">
) => {
  const db = dbAdmin();
  const id = db.collection("_ids").doc().id;
  const now = Date.now();

  const doc: OutboxJob = {
    jobId: id,
    status: "pending",
    attempts: 0,
    lastError: null,
    leasedBy: null,
    leaseUntil: null,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
    ...input,
  };

  await db.collection(COLL).doc(id).set(doc);
  return id;
};

export const computeNextBackoffMs = (attempts: number) => {
  // 2s, 4s, 8s, 16s … capped 5m + jitter
  const base = 2000;
  const max = 300000;
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(base * 2 ** Math.max(0, attempts), max) + jitter;
};

export const leasePendingJobs = async (
  workerId: string,
  limit = 20,
  leaseMs = 30000
) => {
  const db = dbAdmin();
  const now = Date.now();

  const snap = await db
    .collection(COLL)
    .where("status", "in", ["pending", "fail"])
    .where("nextRunAt", "<=", now)
    .orderBy("nextRunAt", "asc")
    .limit(limit)
    .get();

  const batch = db.batch();
  const leased: OutboxJob[] = [];

  for (const d of snap.docs) {
    const job = d.data() as OutboxJob;
    const leaseUntil = now + leaseMs;
    batch.update(d.ref, {
      status: "leased",
      leasedBy: workerId,
      leaseUntil,
      updatedAt: now,
    });
    leased.push({ ...job, status: "leased", leasedBy: workerId, leaseUntil });
  }

  if (leased.length) await batch.commit();
  return leased;
};

export const markOk = async (jobId: string) => {
  const db = dbAdmin();
  await db
    .collection(COLL)
    .doc(jobId)
    .set(
      {
        status: "ok",
        updatedAt: Date.now(),
        leasedBy: null,
        leaseUntil: null,
      },
      { merge: true }
    );
};

export const requeue = async (job: OutboxJob, err: unknown) => {
  const db = dbAdmin();
  const attempts = (job.attempts ?? 0) + 1;
  const now = Date.now();

  if (attempts >= 5) {
    // DLQ
    await db
      .collection("outbox_dlq")
      .doc(job.jobId)
      .set({ ...job, status: "dead", lastError: String(err), deadAt: now });

    await db.collection(COLL).doc(job.jobId).delete();
    return;
  }

  await db
    .collection(COLL)
    .doc(job.jobId)
    .set(
      {
        status: "fail",
        attempts,
        lastError: String(err),
        nextRunAt: now + computeNextBackoffMs(attempts),
        leasedBy: null,
        leaseUntil: null,
        updatedAt: now,
      },
      { merge: true }
    );
};
