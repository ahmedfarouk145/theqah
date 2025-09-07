import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore, type AuthedRequest } from "@/utils/verifyStore";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method Not Allowed" });

  try {
    await verifyStore(req);
  } catch (e) {
    const err = e as Error & { status?: number };
    return res.status(err.status ?? 401).json({ ok: false, error: err.message || "Unauthorized" });
  }

  const { storeId } = req as AuthedRequest; // هذا هو ownerUid
  if (!storeId) return res.status(400).json({ ok: false, error: "Missing storeId" });

  const db = dbAdmin();

  // نبحث عن مستند منصة سلة بهذا المالك
  // ملاحظة: قد تحتاج Index مركب (ownerUid + platform) — لو طلع خطأ، اضغط رابط الإنشاء من رسائل Firebase
  const snap = await db
    .collection("stores")
    .where("platform", "==", "salla")
    .where("ownerUid", "==", storeId)
    .limit(1)
    .get();

  if (snap.empty) {
    return res.status(200).json({
      ok: true,
      data: {
        connected: false,
        platform: "salla",
      },
    });
  }
//eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doc = snap.docs[0].data() as any;
  const salla = (doc && doc.salla) || {};
  return res.status(200).json({
    ok: true,
    data: {
      connected: !!salla.connected,
      storeName: salla.storeName || null,
      merchantId: salla.storeId ? String(salla.storeId) : null,
      updatedAt: doc.updatedAt || null,
      apiBase: salla.apiBase || null,
    },
  });
}
