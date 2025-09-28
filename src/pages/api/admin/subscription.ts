import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { fetchAppSubscriptions } from "@/lib/sallaClient";
import { mapSallaPlanToInternal } from "@/config/plans";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 ساعات

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const storeUid = typeof req.query.storeUid === "string" ? req.query.storeUid.trim() : "";
  if (!storeUid) return res.status(400).json({ error: "missing_storeUid" });

  const db = dbAdmin();
  const ref = db.collection("stores").doc(storeUid);
  const snap = await ref.get();
  const cur = snap.data()?.subscription as { raw?: unknown; syncedAt?: number; planId?: string } | undefined;

  const fresh = cur?.syncedAt && Date.now() - cur.syncedAt < TTL_MS;
  if (!fresh && storeUid.startsWith("salla:")) {
    try {
      const raw = await fetchAppSubscriptions(storeUid);
      // استخلص plan_name / plan_type إن توفرت
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const arr = (raw as any)?.data || (Array.isArray(raw) ? raw : []);
      const first = Array.isArray(arr) ? arr[0] : undefined;
      const planName = first?.plan_name ?? first?.name ?? null;
      const planType = first?.plan_type ?? null;

      const planId = mapSallaPlanToInternal(planName, planType);

      await ref.set({ subscription: { raw, syncedAt: Date.now(), planId }, updatedAt: Date.now() }, { merge: true });
      return res.status(200).json({ ok: true, subscription: { planId, raw } });
    } catch (e) {
      await db.collection("webhook_errors").add({
        at: Date.now(), scope: "subscription_fetch", storeUid,
        error: e instanceof Error ? e.message : String(e),
      }).catch(()=>{});
      // ارجع آخر حالة مخزنة حتى لو قديمة
      return res.status(200).json({ ok: true, subscription: cur ?? null, stale: true });
    }
  }

  return res.status(200).json({ ok: true, subscription: cur ?? null, cached: true });
}
