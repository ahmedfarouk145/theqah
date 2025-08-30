// src/pages/api/store/dashboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyStore } from "@/utils/verifyStore";

type AnalyticsData = {
  totalOrders: number;
  totalReviews: number;
  positiveRate: number; // %
  ordersChart: { month: string; count: number }[];
  reviewsChart: { month: string; positive: number; negative: number }[];
};

function toTs(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : Date.parse(v);
  }
  return 0;
}

function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function lastNMonthsKeys(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < n; i++) {
    out.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

// type guard للتخلّص من any
function hasStatus(e: unknown): e is { status: number } {
  if (typeof e !== "object" || e === null) return false;
  const v = (e as Record<string, unknown>).status;
  return typeof v === "number";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

    const { uid } = await verifyStore(req);
    const db = dbAdmin();

    const [ordersSnap, reviewsSnap] = await Promise.all([
      db.collection("orders").where("storeId", "==", uid).get(),
      db.collection("reviews").where("storeUid", "==", uid).get(),
    ]);

    const totalOrders = ordersSnap.size;
    const totalReviews = reviewsSnap.size;

    let pos = 0; // ⬅︎ شيلنا neg لأنه غير مستخدم
    const months = lastNMonthsKeys(12);
    const ordersBuckets = new Map<string, number>(months.map((m) => [m, 0]));
    const reviewsPosBuckets = new Map<string, number>(months.map((m) => [m, 0]));
    const reviewsNegBuckets = new Map<string, number>(months.map((m) => [m, 0]));

    ordersSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const ts = toTs(data.createdAt) || toTs(data.created);
      const k = monthKey(ts || Date.now());
      if (ordersBuckets.has(k)) ordersBuckets.set(k, (ordersBuckets.get(k) || 0) + 1);
    });

    reviewsSnap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const stars = typeof data.stars === "number" ? data.stars : Number(data.stars || 0);
      const ts = toTs(data.createdAt) || toTs(data.created);
      const k = monthKey(ts || Date.now());

      if (stars >= 4) pos += 1;

      if (reviewsPosBuckets.has(k)) {
        if (stars >= 4) reviewsPosBuckets.set(k, (reviewsPosBuckets.get(k) || 0) + 1);
      }
      if (reviewsNegBuckets.has(k)) {
        if (stars > 0 && stars <= 2) reviewsNegBuckets.set(k, (reviewsNegBuckets.get(k) || 0) + 1);
      }
    });

    const positiveRate = totalReviews ? Math.round((pos / totalReviews) * 100) : 0;

    const ordersChart = months.map((m) => ({ month: m, count: ordersBuckets.get(m) || 0 }));
    const reviewsChart = months.map((m) => ({
      month: m,
      positive: reviewsPosBuckets.get(m) || 0,
      negative: reviewsNegBuckets.get(m) || 0,
    }));

    const payload: AnalyticsData = { totalOrders, totalReviews, positiveRate, ordersChart, reviewsChart };
    return res.status(200).json(payload);
  } catch (e: unknown) {
    const status = hasStatus(e) ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);

    console.error("DASHBOARD_ERROR:", message); // شيلنا eslint-disable لأنه غير مطلوب
    return res.status(status).json({ error: "DASHBOARD_FAILED", message });
  }
}
