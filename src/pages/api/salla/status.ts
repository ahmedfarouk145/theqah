import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

type StatusOk = {
  ok: true;
  connected: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
  reason?: string;
};
type StatusFail = { ok: false; error: string };

function asMsg(e: unknown) { return e instanceof Error ? e.message : String(e); }
function normalizeConnected(d: Record<string, unknown> | undefined) {
  const s = (d?.salla || {}) as Record<string, unknown>;
  const connected = Boolean(s.connected);
  //eslint-disable-next-line
  const installedAt = Number(s.installedAt ?? (d as any)?.installedAt ?? 0);
  //eslint-disable-next-line
  const uninstalledAt = Number((d as any)?.uninstalledAt ?? 0);
  return connected && (!uninstalledAt || uninstalledAt < installedAt);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<StatusOk | StatusFail>) {
  try {
    const db = dbAdmin();
    const uidParam = typeof req.query.uid === "string" ? req.query.uid : undefined;
    const ownerUid = typeof req.query.ownerUid === "string" ? req.query.ownerUid : undefined;

    if (uidParam) {
      const doc = await db.collection("stores").doc(uidParam).get();
      if (doc.exists) {
        const data = doc.data() || {};
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = (data as any).salla || {};
        return res.status(200).json({
          ok: true, connected: normalizeConnected(data), uid: doc.id,
          storeId: s.storeId ?? null, storeName: s.storeName ?? null, domain: s.domain ?? null,
          reason: "read_by_uid",
        });
      }
      const tok = await db.collection("salla_tokens").doc(uidParam).get();
      if (tok.exists) {
        const t = tok.data() || {};
        return res.status(200).json({
          ok: true, connected: true, uid: uidParam,
          //eslint-disable-next-line @typescript-eslint/no-explicit-any
          storeId: (t as any).storeId ?? null, storeName: (t as any).storeName ?? null, domain: (t as any).storeDomain ?? null,
          reason: "fallback_by_tokens",
        });
      }
      return res.status(200).json({ ok: true, connected: false, uid: uidParam, reason: "not_found" });
    }

    if (!ownerUid) return res.status(400).json({ ok: false, error: "Missing uid or ownerUid" });

    const q = await db.collection("stores")
      .where("platform", "==", "salla").where("ownerUid", "==", ownerUid).limit(1).get();

    if (!q.empty) {
      const doc = q.docs[0];
      const data = doc.data() || {};
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (data as any).salla || {};
      return res.status(200).json({
        ok: true, connected: normalizeConnected(data), uid: doc.id,
        storeId: s.storeId ?? null, storeName: s.storeName ?? null, domain: s.domain ?? null,
        reason: "query_by_ownerUid",
      });
    }
    return res.status(200).json({ ok: true, connected: false, reason: "ownerUid_query_empty" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: asMsg(e) });
  }
}
