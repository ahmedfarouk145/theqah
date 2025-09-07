import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

    // يحتاج جلسة مستخدم (نفس /api/store/settings)
    try {
      await verifyStore(req);
    } catch (e) {
      const err = e as Error & { status?: number };
      return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
    }

    const { storeId } = req as AuthedRequest; // هذا الـ ownerUid
    if (!storeId) return res.status(400).json({ ok: false, error: "Missing storeId" });

    const db = dbAdmin();
    // نجيب أول متجر سلة لهذا المالك
    const snap = await db
      .collection("stores")
      .where("platform", "==", "salla")
      .where("ownerUid", "==", storeId)
      .limit(1)
      .get();

    if (snap.empty) return res.status(200).json({ ok: true, connected: false });

    const doc = snap.docs[0];
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = doc.data() as any;
    const salla = data?.salla || {};

    return res.status(200).json({
      ok: true,
      connected: !!salla.connected,
      storeName: salla.storeName || null,
      storeId: salla.storeId || null,
      domain: salla.domain || null,
      updatedAt: data?.updatedAt || null,
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
