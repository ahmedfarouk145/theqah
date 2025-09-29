import { dbAdmin } from "@/lib/firebaseAdmin";

function monthKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function onInviteSent(storeUid: string) {
  console.log(`[USAGE] Recording invite sent for store: ${storeUid}`);
  const db = dbAdmin();
  const key = monthKey();

  const ref = db.collection("stores").doc(storeUid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const usage = (data.usage || {}) as { monthKey?: string; invitesUsed?: number };
    if (usage.monthKey === key) {
      tx.update(ref, {
        usage: {
          monthKey: key,
          invitesUsed: (usage.invitesUsed || 0) + 1,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      });
    } else {
      tx.update(ref, {
        usage: {
          monthKey: key,
          invitesUsed: 1,
          updatedAt: Date.now(),
        },
        updatedAt: Date.now(),
      });
    }
  });
}

export async function canSendInvite(storeUid: string): Promise<{ ok: boolean; reason?: string }> {
  // مثال: تحقق من الاشتراك أو الكوتا
  // يمكنك تخصيص المنطق حسب نظامك
  // افتراضياً يسمح دائماً
  return { ok: true };
}
