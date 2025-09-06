// src/pages/api/auth/exchange-onboarding.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin, authAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    const { tokenId, password, email } = req.body || {};
    if (!tokenId) return res.status(400).json({ error: "missing_token" });

    const db = dbAdmin();
    const ref = db.collection("onboarding_tokens").doc(String(tokenId));
    const snap = await ref.get();
    if (!snap.exists) return res.status(400).json({ error: "invalid_token" });
//eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tok = snap.data() as any;
    if (tok.usedAt) return res.status(400).json({ error: "token_used" });
    if (Date.now() > Number(tok.expiresAt)) return res.status(400).json({ error: "token_expired" });

    const storeUid: string = String(tok.uid); // salla:...
    const fallbackEmail = `owner+${storeUid.replace(":", "_")}@theqah.local`;
    const userEmail: string = (typeof email === "string" && email) || tok.store?.email || fallbackEmail;

    // أنشئ/أحضر المستخدم
    let userRecord;
    try {
      userRecord = await authAdmin().getUserByEmail(userEmail);
    } catch {
      userRecord = await authAdmin().createUser({
        email: userEmail,
        emailVerified: false,
        password: password && String(password).length >= 6 ? String(password) : undefined,
        displayName: tok.store?.name || "TheQah Merchant",
      });
    }

    // حدّث الباسورد لو أُرسل
    if (password && String(password).length >= 6) {
      await authAdmin().updateUser(userRecord.uid, { password: String(password) });
    }

    // اربط حساب المستخدم بالمتجر
    await db.collection("stores").doc(storeUid).set(
      { ownerUid: userRecord.uid, updatedAt: Date.now() },
      { merge: true }
    );

    // علّم التوكين مستخدم
    await ref.update({ usedAt: Date.now() });

    // أعمل Custom Token
    const customToken = await authAdmin().createCustomToken(userRecord.uid, { theqahStoreUid: storeUid });

    return res.status(200).json({ ok: true, customToken, userEmail });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ error: "internal", message: e?.message || String(e) });
  }
}
