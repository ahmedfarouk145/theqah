import { dbAdmin } from "@/lib/firebaseAdmin"; // this is a function () => Firestore
import { getPlanConfig, type PlanCode } from "./plans";
import type { Firestore, Transaction, DocumentData } from "firebase-admin/firestore";

// helper to get the Firestore instance
const db: Firestore = dbAdmin();

export async function canSendInvite(storeUid: string) {
  const ref = db.collection("stores").doc(storeUid);
  const snap = await ref.get();

  if (!snap.exists) {
    return { ok: false, reason: "store_not_found" } as const;
  }

  const s = (snap.data() as DocumentData) ?? {};

  if (!s?.plan?.active) {
    return { ok: false, reason: "plan_inactive" } as const;
  }

  const cfg = getPlanConfig(String(s.plan.code || "TRIAL").toUpperCase() as PlanCode);
  const used = Number(s?.usage?.invitesUsed ?? 0);

  if (used >= cfg.monthlyInvites) {
    return { ok: false, reason: "quota_exhausted", used, limit: cfg.monthlyInvites } as const;
  }

  return { ok: true, used, limit: cfg.monthlyInvites } as const;
}

export async function incrementUsageAfterSuccess(storeUid: string) {
  const ref = db.collection("stores").doc(storeUid);

  await db.runTransaction(async (tx: Transaction) => {
    const s = await tx.get(ref);
    const cur = (s.data() as DocumentData) ?? {};
    const used = Number(cur?.usage?.invitesUsed ?? 0) + 1;

    tx.set(
      ref,
      { usage: { invitesUsed: used } },
      { merge: true }
    );
  });
}
