// src/pages/api/usage/current.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser } from "@/server/auth/requireUser";
import { dbAdmin } from "@/lib/firebaseAdmin";
import { getPlanConfig, type PlanCode } from "@/server/billing/plans";

type UsageData = {
  invitesUsed: number;
  invitesLimit: number;
  percentage: number;
  monthKey: string;
  planCode: string;
  planName: string;
  status: "safe" | "warning" | "critical" | "exceeded";
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean; usage?: UsageData; message?: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const { uid } = await requireUser(req);
    const db = dbAdmin();
    
    const storeSnap = await db.collection("stores").doc(uid).get();
    
    if (!storeSnap.exists) {
      return res.status(404).json({ ok: false, message: "Store not found" });
    }

    const storeData = storeSnap.data();
    const planCode = (storeData?.subscription?.planId || storeData?.plan?.code || "STARTER") as PlanCode;
    const planConfig = getPlanConfig(planCode);
    
    const usage = storeData?.usage || {};
    const invitesUsed = Number(usage.invitesUsed || 0);
    const invitesLimit = planConfig.monthlyInvites;
    const percentage = invitesLimit > 0 ? Math.round((invitesUsed / invitesLimit) * 100) : 0;
    
    // تحديد الحالة
    let status: UsageData["status"] = "safe";
    if (percentage >= 100) status = "exceeded";
    else if (percentage >= 90) status = "critical";
    else if (percentage >= 70) status = "warning";
    
    // أسماء الباقات
    const planNames: Record<PlanCode, string> = {
      STARTER: "باقة الانطلاقة",
      SALES_BOOST: "باقة زيادة المبيعات",
      EXPANSION: "باقة التوسع"
    };

    return res.status(200).json({
      ok: true,
      usage: {
        invitesUsed,
        invitesLimit,
        percentage,
        monthKey: usage.monthKey || "",
        planCode,
        planName: planNames[planCode] || planCode,
        status,
      },
    });
  } catch (error) {
    console.error("[USAGE API] Error:", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
}
