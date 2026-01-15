// src/pages/api/store/dashboard.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { verifyStore } from "@/utils/verifyStore";
import { StoreService, type DashboardAnalytics } from "@/server/services/store.service";

function hasStatus(e: unknown): e is { status: number } {
  if (typeof e !== "object" || e === null) return false;
  const v = (e as Record<string, unknown>).status;
  return typeof v === "number";
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") return res.status(405).json({ message: "Method not allowed" });

    const { uid } = await verifyStore(req);

    const storeService = new StoreService();
    const analytics: DashboardAnalytics = await storeService.getDashboardAnalytics(uid);

    return res.status(200).json(analytics);
  } catch (e: unknown) {
    const status = hasStatus(e) ? e.status : 500;
    const message = e instanceof Error ? e.message : String(e);

    console.error("DASHBOARD_ERROR:", message);
    return res.status(status).json({ error: "DASHBOARD_FAILED", message });
  }
}
