// src/pages/api/salla/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";
import { sallaAdminClient } from "@/lib/salla-admin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const uid = (req.query.uid as string) || (req.body?.uid as string);
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    const db = getDb();

    // ✅ اقرأ التوكن من salla_tokens/{uid} (نفس ما يحفظه callback)
    const tokSnap = await db.collection("salla_tokens").doc(uid).get();
    const access = tokSnap.data()?.accessToken as string | undefined;
    if (!access) return res.status(401).json({ error: "no_access_token_for_uid" });

    const callbackUrl =
      `${(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "")
        .replace(/\/+$/,"")}/api/salla/webhook`;

    // ✅ تأكد من أسماء الأحداث (كلها جمع shipments.*)
    const events = [
      "orders.paid",
      "orders.fulfilled",
      "orders.delivered",
      "orders.status.update",
      "orders.cancelled",
      "orders.refunded",
      "shipments.creating",
      "shipments.created",
      "shipments.updated",
      "shipments.cancelled",
      "app.uninstalled",
      "app.store.authorize",
      "app.installed",
      "app.updated",
      "app.settings.updated"
    ];

    const admin = sallaAdminClient(access);
    const resp = await admin<{ data?: unknown }>("webhooks/subscribe", {
      method: "POST",
      body: JSON.stringify({ url: callbackUrl, events }),
    });

    return res.status(200).json({ ok: true, callbackUrl, events, resp });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "internal", message: msg });
  }
}
