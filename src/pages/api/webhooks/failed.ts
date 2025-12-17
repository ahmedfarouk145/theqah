// src/pages/api/webhooks/failed.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { listDLQEntries } from "@/server/queue/webhook-retry";
import { verifyAdminSession } from "@/server/auth-helpers";

/**
 * List Failed Webhooks (DLQ)
 * 
 * GET /api/webhooks/failed?limit=50&startAfter=dlq_xxx&onlyUnreviewed=true
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Admin authentication required
  const session = await verifyAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const startAfter = req.query.startAfter as string | undefined;
  const onlyUnreviewed = req.query.onlyUnreviewed === "true";

  const result = await listDLQEntries({ limit, startAfter, onlyUnreviewed });

  if (result.ok) {
    return res.status(200).json({
      ok: true,
      entries: result.entries,
      hasMore: result.hasMore,
    });
  }

  return res.status(500).json({ ok: false, error: "Failed to list DLQ entries" });
}
