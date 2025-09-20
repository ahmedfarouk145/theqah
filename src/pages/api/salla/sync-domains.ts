// src/pages/api/salla/sync-domains.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

function toDomainBase(domain: string | null | undefined): string | null {
  if (!domain) return null;
  try {
    const u = new URL(String(domain));
    const origin = u.origin.toLowerCase();
    const firstSeg = u.pathname.split("/").filter(Boolean)[0] || "";
    return firstSeg && firstSeg.startsWith("dev-") ? `${origin}/${firstSeg}` : origin;
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = String(req.headers["x-admin-secret"] || "");
  if (!key || key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const db = dbAdmin();
  const snap = await db.collection("stores")
    .where("platform", "==", "salla")
    .where("salla.connected", "==", true)
    .where("salla.installed", "==", true)
    .get();

  let updated = 0, skipped = 0;
  for (const d of snap.docs) {
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = d.data() as any;
    const uid = data?.uid || d.id;
    const base = toDomainBase(data?.salla?.domain || null);
    if (!base) { skipped++; continue; }
    await db.collection("domains").doc(base).set({
      storeUid: uid,
      updatedAt: Date.now()
    }, { merge: true });
    updated++;
  }

  return res.status(200).json({ ok: true, updated, skipped, total: snap.size });
}
