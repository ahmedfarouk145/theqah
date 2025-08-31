// src/pages/api/review-token.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.status(400).json({ error: "missing_token" });

    const db = dbAdmin();
    const snap = await db.collection("review_tokens").doc(token).get();
    if (!snap.exists) return res.status(404).json({ error: "not_found" });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = snap.data() as any;
    // (اختياري) حاول تجيب اسم المتجر
    let storeName: string | undefined;
    if (t?.storeUid) {
      try {
        const s = await db.collection("stores").doc(String(t.storeUid)).get();
        storeName = (s.data()?.name as string) || undefined;
      } catch {}
    }

    return res.status(200).json({
      tokenId: token,
      orderId: t?.orderId ?? null,
      storeName: storeName ?? t?.storeName ?? null,
      customer: t?.customer ?? null,
      expired: t?.expiresAt ? Date.now() > Number(t.expiresAt) : false,
      voided: Boolean(t?.voidedAt),
    });
  }
  //eslint-disable-next-line @typescript-eslint/no-unused-vars 
  catch (e) {
    return res.status(500).json({ error: "server_error" });
  }
}
