import { dbAdmin } from "@/lib/firebaseAdmin";
import { PLANS, PlanId, getCycleBoundaries } from "@/config/plans";

type UsageDoc = {
  planId: PlanId;
  invitesUsed: number;
  invitesLimit: number | null;
  cycleStart: number;
  cycleEnd: number;
  updatedAt: number;
};

export async function getCurrentPlanForStore(storeUid: string): Promise<PlanId> {
  const db = dbAdmin();
  const storeSnap = await db.collection("stores").doc(storeUid).get();
  const data = storeSnap.data() || {};
  const explicit = (data.subscription?.planId as PlanId | undefined);
  if (explicit) return explicit;

  // TODO: بإمكانك هنا تحويل raw الاشتراك من سلة إلى planId
  return "TRIAL";
}

export async function canSendInvite(storeUid: string): Promise<{ ok: boolean; reason?: string; remaining?: number }> {
  const db = dbAdmin();
  const planId = await getCurrentPlanForStore(storeUid);
  const plan = PLANS[planId];
  const { key, startMs, endMs } = getCycleBoundaries();
  const usageRef = db.collection("usage_counters").doc(`${storeUid}:${key}`);
  const usageSnap = await usageRef.get();
  const usage = usageSnap.data() as UsageDoc | undefined;

  const limit = plan.invitesPerMonth; // null = غير محدود/مخصص
  const used = usage?.invitesUsed ?? 0;

  if (limit == null) return { ok: true, remaining: Number.POSITIVE_INFINITY as unknown as number };

  const remaining = Math.max(0, limit - used);
  if (remaining <= 0) return { ok: false, reason: "quota_exhausted", remaining: 0 };
  return { ok: true, remaining };
}

export async function onInviteSent(storeUid: string): Promise<void> {
  const db = dbAdmin();
  const planId = await getCurrentPlanForStore(storeUid);
  const plan = PLANS[planId];
  const { key, startMs, endMs } = getCycleBoundaries();
  const usageRef = db.collection("usage_counters").doc(`${storeUid}:${key}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const cur = snap.data() as UsageDoc | undefined;
    const used = (cur?.invitesUsed ?? 0) + 1;
    const doc: UsageDoc = {
      planId,
      invitesUsed: used,
      invitesLimit: plan.invitesPerMonth ?? null,
      cycleStart: startMs,
      cycleEnd: endMs,
      updatedAt: Date.now(),
    };
    tx.set(usageRef, doc, { merge: true });
  });
}
