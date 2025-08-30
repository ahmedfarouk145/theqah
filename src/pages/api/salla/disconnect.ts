// src/pages/api/salla/disconnect.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

async function requireUid(req: NextApiRequest): Promise<string> {
  const uid = (req.headers["x-user-id"] as string) || "";
  if (!uid) throw new Error("unauthorized");
  return uid;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const uid = await requireUid(req);
    const db = dbAdmin(); // ✅ CALL the function
    const ref = db.collection("stores").doc(uid).collection("integrations").doc("salla");
    await ref.set(
      { connected: false, accessToken: null, refreshToken: null, updatedAt: Date.now() },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (e) {
    const code = String(e).includes("unauthorized") ? 401 : 500;
    return res.status(code).json({ ok: false, error: "disconnect-failed" });
  }
}
