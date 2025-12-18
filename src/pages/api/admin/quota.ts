// src/pages/api/admin/quota.ts

/**
 * Admin API endpoint for Firestore quota monitoring
 * 
 * Provides quota usage statistics and alerts for administrators
 * to monitor Firestore free tier limits.
 * 
 * Endpoints:
 * - GET /api/admin/quota - Get current quota status
 * - GET /api/admin/quota?action=history&days=7 - Get historical usage
 * - GET /api/admin/quota?action=health - Check quota health
 * - POST /api/admin/quota?action=cleanup - Cleanup old data
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { verifyAdminSession } from "@/lib/auth";
import {
  getQuotaStatus,
  getHistoricalQuota,
  isQuotaHealthy,
  cleanupOldQuotaData,
} from "@/server/monitoring/quota-tracker";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verify admin authentication
    const session = await verifyAdminSession(req);
    if (!session) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized - Admin access required",
      });
    }

    const { action, days } = req.query;

    // GET requests
    if (req.method === "GET") {
      // Get historical usage
      if (action === "history") {
        const daysNum = days ? parseInt(days as string) : 7;
        const history = await getHistoricalQuota(daysNum);

        return res.status(200).json({
          success: true,
          data: {
            history,
            days: daysNum,
          },
        });
      }

      // Check quota health
      if (action === "health") {
        const health = await isQuotaHealthy();

        return res.status(200).json({
          success: true,
          data: health,
        });
      }

      // Default: Get current quota status
      const status = await getQuotaStatus();

      return res.status(200).json({
        success: true,
        data: status,
      });
    }

    // POST requests
    if (req.method === "POST") {
      // Cleanup old data
      if (action === "cleanup") {
        const result = await cleanupOldQuotaData();

        return res.status(200).json({
          success: true,
          message: `Cleaned up ${result.deleted} old quota records`,
          data: result,
        });
      }

      return res.status(400).json({
        success: false,
        error: "Invalid action",
      });
    }

    // Method not allowed
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });

  } catch (error) {
    console.error("[API] Quota endpoint error:", error);

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}
