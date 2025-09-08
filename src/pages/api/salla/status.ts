// src/pages/api/salla/status.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

type StatusOk = {
  ok: true;
  connected: boolean;
  uid?: string | null;
  storeId?: string | number | null;
  storeName?: string | null;
  domain?: string | null;
};
type StatusFail = { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusOk | StatusFail>
) {
  try {
    const db = dbAdmin();
    const uid = typeof req.query.uid === "string" ? req.query.uid : undefined;
    const ownerUid = typeof req.query.ownerUid === "string" ? req.query.ownerUid : undefined;

    // 1) لو فيه uid مباشر (مثال salla:123456) نقرأه مباشرة
    if (uid) {
      const doc = await db.collection("stores").doc(uid).get();
      if (!doc.exists) return res.status(200).json({ ok: true, connected: false, uid });
      const data = doc.data() || {};
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (data as any).salla || {};
      return res.status(200).json({
        ok: true,
        connected: Boolean(s.connected),
        uid,
        storeId: s.storeId ?? null,
        storeName: s.storeName ?? null,
        domain: s.domain ?? null,
      });
    }

    // 2) وإلا نرجع للطريقة القديمة: platform + ownerUid
    if (!ownerUid) {
      return res.status(400).json({ ok: false, error: "Missing uid or ownerUid" });
    }

    const q = await db
      .collection("stores")
      .where("platform", "==", "salla")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();

    if (q.empty) return res.status(200).json({ ok: true, connected: false });

    const doc = q.docs[0];
    const data = doc.data() || {};
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (data as any).salla || {};
    return res.status(200).json({
      ok: true,
      connected: Boolean(s.connected),
      uid: doc.id,
      storeId: s.storeId ?? null,
      storeName: s.storeName ?? null,
      domain: s.domain ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
