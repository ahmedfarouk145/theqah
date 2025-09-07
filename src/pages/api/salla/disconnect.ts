import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const db = dbAdmin();
    const uid = (req.query.uid as string) || (req.body?.uid as string) || ""; // مثال: salla:982747175
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    await db.collection("stores").doc(uid).set({
      uid,
      platform: "salla",
      salla: { connected: false, uninstalledAt: Date.now() },
      updatedAt: Date.now(),
    }, { merge: true });

    return res.status(200).json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: msg });
  }
}
