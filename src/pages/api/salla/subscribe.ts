// src/pages/api/salla/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const SALLA_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.dev").replace(/\/+$/, "");
const CRON_SECRET = process.env.CRON_SECRET || "";

// ✅ قائمة رغبات “صحيحة” (صيغة المفرد كما في مستندات سلة)
const DESIRED_EVENTS = [
  // دفع/حالات طلب
  "order.payment.updated",
  "order.status.updated",
  "order.cancelled",
  "order.refunded",

  // شحن (لتتبُّع التسليم)
  "shipment.updated",
  "shipment.created",

  // تحسينات اختيارية
  "product.updated",
  // "product.quantity.low",
  // "review.added",

  // إن أردت متابعة تثبيت/إلغاء التطبيق من Partner Portal
  "app.installed",
  "app.uninstalled",
  "app.settings.updated",
] as const;

type Desired = typeof DESIRED_EVENTS[number];

async function sallaFetch<T>(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${SALLA_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let json: T | null = null;
  try { json = text ? JSON.parse(text) as T : null; } catch {}
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
    const tokSnap = await db.collection("salla_tokens").doc(uid).get();
    const accessToken = tokSnap.data()?.accessToken as string | undefined;
    if (!accessToken) return res.status(401).json({ error: "no_access_token_for_uid" });

    const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");
    if (!base) return res.status(500).json({ error: "APP_BASE_URL not configured" });

    // ✅ مرِّر التوكن كـ query للتعامل مع نداءات بلا هيدرز
    const token = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
    const sinkUrl = `${base}/api/salla/webhook${token ? `?t=${encodeURIComponent(token)}` : ""}`;

    // 1) جلب الأحداث المتاحة فعليًا
    const list = await sallaFetch<{ status: number; success: boolean; data: Array<{ event: string }> }>(
      "/admin/v2/webhooks/events", accessToken
    );
    if (!list.ok) {
      return res.status(list.status || 502).json({ error: "list_events_failed", body: list.text });
    }
    const available = new Set((list.json?.data || []).map(e => e.event));

    const toSubscribe = DESIRED_EVENTS.filter(e => available.has(e)) as Desired[];
    const skipped = DESIRED_EVENTS.filter(e => !available.has(e));

    // 2) اشترك لكل حدث على حدة لتفادي 422
    const results: Array<{ event: string; ok: boolean; status: number; id?: number; body?: unknown }> = [];
    for (const ev of toSubscribe) {
      const sub = await sallaFetch<{ status: number; success: boolean; data?: { id: number } }>(
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
              { key: "Authorization", value: `Bearer ${process.env.SALLA_WEBHOOK_TOKEN || ""}` }, // علشان يقبل التوكين في webhook.ts
              { key: "x-webhook-token", value: `${process.env.SALLA_WEBHOOK_TOKEN || ""}` },      // احتياطي
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
    });
    //eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return res.status(500).json({ error: "internal", message: e?.message || String(e) });
  }
}
