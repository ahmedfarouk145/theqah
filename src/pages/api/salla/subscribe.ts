// src/pages/api/salla/subscribe.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";

const CRON_SECRET = process.env.CRON_SECRET || "";
const DEFAULT_API_BASE = (process.env.SALLA_API_BASE || "https://api.salla.sa").replace(/\/+$/, "");

// صيغة المفرد كما في مستندات سلة
const DESIRED_EVENTS = [
  "order.payment.updated",
  "order.status.updated",
  "order.cancelled",
  "order.refunded",
  "shipment.updated",
  "shipment.created",
  "product.updated",
  "app.installed",
  "app.uninstalled",
  "app.settings.updated",
] as const;

type Desired = typeof DESIRED_EVENTS[number];

async function sallaFetch<T>(apiBase: string, path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${apiBase}${path}`, {
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

    // اقرأ access token + apiBase المخزّنين في Firestore
    const tokSnap = await db.collection("salla_tokens").doc(uid).get();
    const accessToken = tokSnap.data()?.accessToken as string | undefined;

    const storeSnap = await db.collection("stores").doc(uid).get();
    const apiBase =
      (storeSnap.data()?.salla?.apiBase as string | undefined) ||
      (tokSnap.data()?.apiBase as string | undefined) ||
      DEFAULT_API_BASE;

    if (!accessToken) return res.status(401).json({ error: "no_access_token_for_uid" });

    const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").replace(/\/+$/,"");
    if (!base) return res.status(500).json({ error: "APP_BASE_URL not configured" });

    // مرّر التوكين كـ query + احتفظ برؤوس بديلة
    const hookToken = (process.env.SALLA_WEBHOOK_TOKEN || "").trim();
    const sinkUrl = `${base}/api/salla/webhook${hookToken ? `?t=${encodeURIComponent(hookToken)}` : ""}`;

    // 1) جلب الأحداث المتاحة
    const list = await sallaFetch<{ data: Array<{ event: string }> }>(apiBase, "/admin/v2/webhooks/events", accessToken);
    if (!list.ok) {
      return res.status(list.status || 502).json({ error: "list_events_failed", body: list.text, apiBaseUsed: apiBase });
    }
    const available = new Set((list.json?.data || []).map(e => e.event));

    const toSubscribe = DESIRED_EVENTS.filter(e => available.has(e)) as Desired[];
    const skipped = DESIRED_EVENTS.filter(e => !available.has(e));

    // 2) الاشتراك لكل حدث
    const results: Array<{ event: string; ok: boolean; status: number; id?: number; body?: unknown }> = [];
    for (const ev of toSubscribe) {
      const sub = await sallaFetch<{ data?: { id: number } }>(apiBase, "/admin/v2/webhooks/subscribe", accessToken, {
        method: "POST",
        body: JSON.stringify({
          name: `TheQah ${ev}`,
          event: ev,
          url: sinkUrl,
          version: 2,
          headers: [
            { key: "x-webhook-source", value: "theqah" },
            { key: "Authorization", value: `Bearer ${hookToken}` }, // احتياطي
            { key: "x-webhook-token", value: hookToken },           // احتياطي
          ],
        }),
      });

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
      apiBaseUsed: apiBase,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(500).json({ error: "internal", message: msg });
  }
}
