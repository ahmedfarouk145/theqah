// src/pages/api/admin/dashboard-stats.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { verifyAdmin } from "@/utils/verifyAdmin";

const db = dbAdmin();

type DashboardStats = {
  totalStores: number;
  totalReviews: number;
  totalAlerts: number;
  publishedReviews: number;
  pendingReviews: number;
  fetchedAt: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DashboardStats | { message: string; error?: string }>
) {
  try {
    await verifyAdmin(req);

    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method not allowed" });
    }

    let totalStores = 0;
    let totalReviews = 0;
    let totalAlerts = 0;
    let publishedReviews = 0;
    let pendingReviews = 0;

    try {
      const agg = await db.collection("stores").count().get();
      totalStores = agg.data().count;
    } catch (e) {
      console.warn("Count fallback: stores", e);
    }

    try {
      const agg = await db.collection("reviews").count().get();
      totalReviews = agg.data().count;
    } catch (e) {
      console.warn("Count fallback: reviews", e);
    }

    try {
      const agg = await db.collection("review_reports").count().get();
      totalAlerts = agg.data().count;
    } catch (e) {
      console.warn("Count fallback: review_reports", e);
    }

    try {
      const pubAgg = await db.collection("reviews").where("published", "==", true).count().get();
      publishedReviews = pubAgg.data().count;
    } catch (e) {
      console.warn("Count fallback: published reviews", e);
    }

    try {
      const pendAgg = await db.collection("reviews").where("published", "==", false).count().get();
      pendingReviews = pendAgg.data().count;
    } catch (e) {
      console.warn("Count fallback: pending reviews", e);
    }

    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({
      totalStores,
      totalReviews,
      totalAlerts,
      publishedReviews,
      pendingReviews,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Admin Dashboard Error:", err);
    if (err.message?.startsWith("permission-denied")) {
      return res.status(403).json({ message: "ليس لديك صلاحية", error: "Forbidden" });
    }
    if (err.message?.startsWith("unauthenticated")) {
      return res.status(401).json({ message: "غير مصرح", error: "Unauthorized" });
    }
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
