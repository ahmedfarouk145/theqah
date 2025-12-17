/**
 * Activity Tracking API Endpoints
 * ================================
 * 
 * Provides REST API for user activity analytics
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { 
  getDailyActiveUsers, 
  getMonthlyActiveUsers, 
  getFeatureUsage,
  getUserActivityTimeline,
  getStoreActivityTimeline,
  getRetentionRate
} from "@/server/activity-tracker";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, userId, storeUid, startDate, endDate, cohortStart, cohortEnd, checkDate } = req.query;

  try {
    switch (action) {
      case "dau": {
        const date = typeof startDate === "string" ? new Date(startDate) : undefined;
        const dau = await getDailyActiveUsers(date);
        return res.status(200).json({ dau, date: date?.toISOString() });
      }

      case "mau": {
        const date = typeof startDate === "string" ? new Date(startDate) : undefined;
        const mau = await getMonthlyActiveUsers(date);
        return res.status(200).json({ mau, date: date?.toISOString() });
      }

      case "feature_usage": {
        if (!startDate || !endDate) {
          return res.status(400).json({ error: "startDate and endDate required" });
        }
        const usage = await getFeatureUsage({
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string)
        });
        return res.status(200).json({ 
          usage: Object.fromEntries(usage),
          startDate,
          endDate
        });
      }

      case "user_timeline": {
        if (!userId || typeof userId !== "string") {
          return res.status(400).json({ error: "userId required" });
        }
        const timeline = await getUserActivityTimeline({ userId });
        return res.status(200).json({ userId, timeline });
      }

      case "store_timeline": {
        if (!storeUid || typeof storeUid !== "string") {
          return res.status(400).json({ error: "storeUid required" });
        }
        const timeline = await getStoreActivityTimeline({ storeUid });
        return res.status(200).json({ storeUid, timeline });
      }

      case "retention": {
        if (!cohortStart || !cohortEnd || !checkDate) {
          return res.status(400).json({ 
            error: "cohortStart, cohortEnd, and checkDate required" 
          });
        }
        const rate = await getRetentionRate({
          cohortStartDate: new Date(cohortStart as string),
          cohortEndDate: new Date(cohortEnd as string),
          checkDate: new Date(checkDate as string)
        });
        return res.status(200).json({ 
          retentionRate: rate,
          cohortStart,
          cohortEnd,
          checkDate
        });
      }

      default:
        return res.status(400).json({ 
          error: "Invalid action",
          validActions: ["dau", "mau", "feature_usage", "user_timeline", "store_timeline", "retention"]
        });
    }
  } catch (error) {
    console.error("[Activity API Error]:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}
