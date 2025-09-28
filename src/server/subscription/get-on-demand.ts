import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchAppSubscriptions } from "@/lib/sallaClient";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات

export async function getSubscriptionFresh(storeUid: string) {
  const db = dbAdmin();
  const ref = db.collection("stores").doc(storeUid);
  const snap = await ref.get();
  const cur = snap.data()?.subscription as { raw?: unknown; syncedAt?: number; planId?: string } | undefined;

  const fresh = cur?.syncedAt && Date.now() - cur.syncedAt < TTL_MS;
  if (fresh && cur?.raw) return cur.raw;

  const raw = await fetchAppSubscriptions(storeUid);
  await ref.set({ subscription: { raw, syncedAt: Date.now() }, updatedAt: Date.now() }, { merge: true });
  return raw;
}
