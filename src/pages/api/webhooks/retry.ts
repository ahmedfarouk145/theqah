// src/pages/api/webhooks/retry.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { 
  manualRetryWebhook, 
  resolveDLQEntry,
  getRetryQueueStatus,
  getDLQStatus,
  checkRetrySystemHealth,
} from "@/server/queue/webhook-retry";
import { verifyAdminSession } from "@/server/auth-helpers";

/**
 * Webhook Retry Management API
 * 
 * Actions:
 * - GET /api/webhooks/retry?action=status - Get retry queue status
 * - GET /api/webhooks/retry?action=dlq_status - Get DLQ status
 * - GET /api/webhooks/retry?action=health - Check system health
 * - POST /api/webhooks/retry - Manually retry a webhook from DLQ
 * - POST /api/webhooks/retry?action=resolve - Resolve DLQ entry without retry
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Admin authentication required
  const session = await verifyAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const userId = session.user?.uid || 'unknown';

  if (req.method === "GET") {
    const action = req.query.action as string;

    // Get retry queue status
    if (action === "status") {
      const status = await getRetryQueueStatus();
      return res.status(200).json(status);
    }

    // Get DLQ status
    if (action === "dlq_status") {
      const status = await getDLQStatus();
      return res.status(200).json(status);
    }

    // Health check
    if (action === "health") {
      const health = await checkRetrySystemHealth();
      return res.status(200).json(health);
    }

    return res.status(400).json({ error: "Invalid action" });
  }

  if (req.method === "POST") {
    const action = req.query.action as string;

    // Resolve DLQ entry without retry
    if (action === "resolve") {
      const { dlqId, resolution, notes } = req.body;

      if (!dlqId || !resolution) {
        return res.status(400).json({ error: "Missing dlqId or resolution" });
      }

      if (!["ignored", "manual_fix"].includes(resolution)) {
        return res.status(400).json({ error: "Invalid resolution type" });
      }

      const result = await resolveDLQEntry(dlqId, userId, resolution, notes);
      
      if (result.ok) {
        return res.status(200).json({ ok: true, message: "DLQ entry resolved" });
      }

      return res.status(500).json({ ok: false, error: result.error });
    }

    // Manual retry (default action)
    const { dlqId } = req.body;

    if (!dlqId) {
      return res.status(400).json({ error: "Missing dlqId" });
    }

    const result = await manualRetryWebhook(dlqId, userId);

    if (result.ok) {
      return res.status(200).json({ ok: true, message: "Webhook retry initiated" });
    }

    return res.status(500).json({ ok: false, error: result.error });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
