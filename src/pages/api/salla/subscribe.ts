// src/pages/api/salla/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { sallaAdminClient } from "@/lib/salla-admin";

type ApiResp =
  | { ok: true; uid: string; callbackUrl: string; events: string[]; salla: unknown }
  | { ok: false; error: string; details?: unknown };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiResp>) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method_not_allowed" });

  try {
    // uid ييجي من الكول-باك: "salla:<storeId>" أو من state
    const uid = (req.query.uid as string) || (req.body?.uid as string);
    if (!uid) return res.status(400).json({ ok: false, error: "missing_uid" });

    const db = dbAdmin();

    // 🔑 هات التوكن من salla_tokens/{uid}
    const tokSnap = await db.collection("salla_tokens").doc(uid).get();
    const token = tokSnap.data()?.accessToken as string | undefined;
    if (!token) return res.status(401).json({ ok: false, error: "no_token_for_uid" });

    // 🔔 عنوان الويبهوك
    const base =
      (process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "").replace(/\/+$/, "");
    if (!base) return res.status(500).json({ ok: false, error: "base_url_not_configured" });

    const callbackUrl = `${base}/api/salla/webhook`;

    // ✅ أحداث الـ Admin API (طلبات وشحنات)
    // ملحوظة: أسماء الأحداث في Admin غالبًا بصيغة الجمع shipments.*
    const events = [
      "orders.paid",
      "orders.fulfilled",
      "orders.delivered",
      "orders.status.update",
      "orders.canceled",      // تهجئة متسقة مع REST
      "orders.refunded",
      "shipments.creating",
      "shipments.created",
      "shipments.updated",
      "shipments.canceled",
    ];

    const admin = sallaAdminClient(token);

    // بعض البيئات تسمح بإرسال secret في الهيدر
    const webhookSecret = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();

    // POST /admin/v2/webhooks/subscribe
    const body = JSON.stringify({
      url: callbackUrl,
      events,
    });

    const sallaResponse = await admin<unknown>("webhooks/subscribe", {
      method: "POST",
      headers: webhookSecret ? { "x-webhook-token": webhookSecret } : undefined,
      body,
    });

    return res.status(200).json({
      ok: true,
      uid,
      callbackUrl,
      events,
      salla: sallaResponse,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ ok: false, error: "internal_error", details: msg });
  }
}
