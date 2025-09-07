import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const FALLBACK_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.sa").replace(/\/+$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";

// قائمة أحداث واقعية ومفيدة
const DESIRED_EVENTS = [
  // أوامر ودفع
  "order.payment.updated",
  "order.status.updated",
  "order.cancelled",
  "order.refunded",

  // شحن
  "shipment.updated",
  "shipment.created",

  // تحديث منتج (اختياري لكنه مفيد)
  "product.updated",

  // أحداث إدارة التطبيق (قد تكون غير متاحة لحسابات معينة)
  "app.installed",
  "app.uninstalled",
  "app.settings.updated",
] as const;
type Desired = typeof DESIRED_EVENTS[number];

// Helper لاستدعاء Salla API مع توثيق Bearer
async function sallaFetch<T>(base: string, path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let json: T | null = null;
  try {
    json = text ? (JSON.parse(text) as T) : null;
  } catch {
    /* ignore */
  }
  return { ok: r.ok, status: r.status, json, text };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
    if (!CRON_SECRET || req.headers["x-cron-secret"] !== CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const uid = typeof req.query.uid === "string" ? req.query.uid : (req.body?.uid as string | undefined);
    if (!uid) return res.status(400).json({ error: "missing_uid" });

    const db = dbAdmin();

    // نقرأ التوكن و apiBase المخزن للمتجر
    const tokSnap = await db.collection("salla_tokens").doc(uid).get();
    if (!tokSnap.exists) return res.status(404).json({ error: "token_doc_not_found" });
    const tok = tokSnap.data() as {
      accessToken?: string;
      apiBase?: string;
    };
    const accessToken = tok?.accessToken;
    const apiBase = (tok?.apiBase || FALLBACK_API_BASE).replace(/\/+$/, "");
    if (!accessToken) return res.status(401).json({ error: "no_access_token_for_uid" });

    // نبني Sink URL ونمرّر التوكن كـ query علشان النداءات اللي بدون Authorization header
    const base =
      (process.env.APP_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "").replace(/\/+$/, "");
    if (!base) return res.status(500).json({ error: "APP_BASE_URL not configured" });

    const token = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
    const sinkUrl = `${base}/api/salla/webhook${token ? `?t=${encodeURIComponent(token)}` : ""}`;

    // 1) جلب قائمة الأحداث المتاحة
    const list = await sallaFetch<{ status: number; success: boolean; data: Array<{ event: string }> }>(
      apiBase,
      "/admin/v2/webhooks/events",
      accessToken
    );
    if (!list.ok) {
      return res.status(list.status || 502).json({ error: "list_events_failed", body: list.text });
    }

    const available = new Set((list.json?.data || []).map((e) => e.event));
    const toSubscribe = DESIRED_EVENTS.filter((e) => available.has(e)) as Desired[];
    const skipped = DESIRED_EVENTS.filter((e) => !available.has(e));

    // 2) الاشتراك حدثًا-بحدث لتفادي 422 بسبب تعدد الأحداث في طلب واحد
    const results: Array<{ event: string; ok: boolean; status: number; id?: number; body?: unknown }> = [];
    for (const ev of toSubscribe) {
      const sub = await sallaFetch<{ status: number; success: boolean; data?: { id: number } }>(
        apiBase,
        "/admin/v2/webhooks/subscribe",
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            name: `TheQah ${ev}`,
            event: ev,
            url: sinkUrl,
            version: 2,
            headers: [
              { key: "x-webhook-source", value: "theqah" },
              { key: "Authorization", value: `Bearer ${process.env.SALLA_WEBHOOK_TOKEN || ""}` },
              { key: "x-webhook-token", value: `${process.env.SALLA_WEBHOOK_TOKEN || ""}` },
            ],
          }),
        }
      );

      if (sub.ok) {
        results.push({ event: ev, ok: true, status: 200, id: sub.json?.data?.id });
      } else {
        results.push({ event: ev, ok: false, status: sub.status, body: sub.text });
      }
    }

    return res.status(200).json({
      ok: true,
      sinkUrl,
      subscribed: results,
      skipped,
      available: [...available],
      apiBase,
      uid,
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ error: "internal", message: e?.message || String(e) });
  }
}
