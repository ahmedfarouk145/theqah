// src/pages/api/cron/webhook-retry.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { processRetryQueue } from "@/server/queue/webhook-retry";
import { metrics } from "@/server/monitoring/metrics";

/**
 * Webhook Retry Cron Job
 * 
 * Processes pending webhook retries with exponential backoff.
 * Should be called every minute via cron (Vercel Cron or external).
 * 
 * Vercel cron config in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/webhook-retry",
 *     "schedule": "* * * * *"
 *   }]
 * }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn("[WEBHOOK_RETRY_CRON] Unauthorized access attempt");
    return res.status(401).json({ error: "Unauthorized" });
  }

  console.log("[WEBHOOK_RETRY_CRON] Starting retry processing");
  const startTime = Date.now();

  try {
    const result = await processRetryQueue();
    const duration = Date.now() - startTime;

    // Track metrics
    await metrics.track({
      name: "webhook_retry_cron_execution",
      value: duration,
      labels: {
        success: result.ok ? "true" : "false",
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        movedToDLQ: result.movedToDLQ,
      },
    });

    console.log(`[WEBHOOK_RETRY_CRON] Completed in ${duration}ms`, {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      movedToDLQ: result.movedToDLQ,
      errors: result.errors.length,
    });

    return res.status(200).json({
      ok: true,
      ...result,
      duration,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("[WEBHOOK_RETRY_CRON] Error:", error);

    await metrics.track({
      name: "webhook_retry_cron_error",
      value: 1,
      labels: { error: errMsg.substring(0, 100) },
    });

    return res.status(500).json({
      ok: false,
      error: errMsg,
    });
  }
}
