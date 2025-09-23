// src/pages/api/jobs/worker-run-once.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { runWorkerOnce } from "@/worker/outbox-worker";

// مقارنة ثابتة الزمن لتقليل فرص timing attacks
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) {
    v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return v === 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // اسمح بـ GET و POST (Vercel Cron غالبًا يستخدم GET)
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const secret = (process.env.CRON_SECRET || "").trim();
  const headerKey = String(req.headers["x-cron-secret"] || "");
  const queryKey = typeof req.query.key === "string" ? req.query.key : "";
  const provided = headerKey || queryKey;

  if (!secret || !provided || !safeEq(provided, secret)) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  // حجم الدفعة اختياري من ?n= (افتراضي 50)
  const nParam = Array.isArray(req.query.n) ? req.query.n[0] : req.query.n;
  const batchSize = Math.max(1, Math.min(200, Number(nParam ?? 50) || 50));

  try {
    const started = Date.now();
    const processed = await runWorkerOnce(batchSize);
    const tookMs = Date.now() - started;

    // لا كاش للنتيجة
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, processed, batchSize, tookMs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // لوج مفيد للتتبّع
    console.error("[worker-run-once] error:", msg);
    return res.status(500).json({ ok: false, error: msg });
  }
}
