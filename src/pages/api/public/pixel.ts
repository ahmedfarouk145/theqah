import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).end();

    const store = typeof req.query.store === "string" ? req.query.store : "";
    const p = typeof req.query.p === "string" ? req.query.p : "";
    const ua = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "";

    if (store) {
      const db = dbAdmin();
      await db.collection("widget_impressions").add({
        storeUid: store,
        path: p || null,
        ua,
        ip,
        at: Date.now(),
      }).catch(() => {});
    }

    // 1x1 gif
    const buf = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      "base64"
    );
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buf);
  } catch {
    return res.status(200).end(); // لا نفشل الواجهة
  }
}
