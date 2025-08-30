// src/pages/api/admin/alerts.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/utils/verifyAdmin";

type AlertLevel = "info" | "warn" | "error";
type AlertData = { message: string; level: AlertLevel; createdAt: number; createdBy?: string | null };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await verifyAdmin(req);

    const db = dbAdmin();

    if (req.method === "GET") {
      const snap = await db.collection("admin_alerts").orderBy("createdAt", "desc").limit(100).get();
      //eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.status(200).json({ items: snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) });
    }

    if (req.method === "POST") {
      const { message, level = "info" } = (req.body || {}) as Partial<AlertData>;
      if (!message) return res.status(400).json({ message: "message required" });
      const ref = await db.collection("admin_alerts").add({
        message: String(message).slice(0, 1000),
        level,
        createdAt: Date.now(),
        createdBy: null,
      } as AlertData);
      return res.status(200).json({ id: ref.id, ok: true });
    }

    return res.status(405).json({ message: "Method Not Allowed" });
  } catch (e) {
    const msg = (e as Error).message || '';
    if (msg.startsWith("unauthenticated")) return res.status(401).json({ message: "Unauthorized" });
    if (msg.startsWith("permission-denied")) return res.status(403).json({ message: "Forbidden" });
    return res.status(500).json({ message: "Server error" });
  }
}
