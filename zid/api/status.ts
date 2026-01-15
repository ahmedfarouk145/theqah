import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    try {
      await verifyStore(req);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
    }

    const { storeId } = req as AuthedRequest;
    if (!storeId) return res.status(400).json({ ok: false, error: "Missing storeId" });

    const db = dbAdmin();
    const snap = await db
      .collection("stores")
      .where("platform", "==", "zid")
      .where("ownerUid", "==", storeId)
      .limit(1)
      .get();

    if (snap.empty) return res.status(200).json({ ok: true, connected: false });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.docs[0].data() as any;
    const zid = data?.zid || {};

    return res.status(200).json({
      ok: true,
      connected: !!zid.connected,
      storeName: zid.storeName || null,
      merchantId: zid.merchantId || null,
      updatedAt: data?.updatedAt || null,
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
