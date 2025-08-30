// src/pages/api/salla/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getDb } from "@/server/firebase-admin";
import { sallaAdminClient } from "@/lib/salla-admin"; // تأكد اسم الملف اللي فيه عميل admin

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  try {
    const uid = (req.query.uid as string) || (req.body?.uid as string);
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    const db = getDb();
    const snap = await db.collection("stores").doc(uid).get();
    const token = snap.data()?.salla?.tokens?.access_token as string | undefined;
    if (!token) return res.status(401).json({ error: "no_token_for_uid" });

    const callbackUrl = `${process.env.APP_BASE_URL}/api/salla/webhook`;
    const events = [
      "orders.paid",
      "orders.fulfilled",
      "orders.delivered",
      "orders.status.update",
      "orders.cancelled",
      "orders.refunded",
      "shipments.creating",
      "shipment.created",
      "shipment.updated",
      "shipment.cancelled",
      "app.store.uninstall",
    ];

    const admin = sallaAdminClient(token);
    const resp = await admin<{ data?: unknown }>("/webhooks/subscribe", {
      method: "POST",
      body: JSON.stringify({ url: callbackUrl, events }),
    });

    return res.status(200).json({ ok: true, callbackUrl, events, resp });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: "internal", message: msg });
  }
}
