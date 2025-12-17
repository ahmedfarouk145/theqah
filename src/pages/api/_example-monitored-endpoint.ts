// Example: Using monitoring in an API endpoint
// src/pages/api/example-monitored-endpoint.ts

import type { NextApiRequest, NextApiResponse } from "next";
import { withMonitoring } from "@/server/monitoring/api-monitor";
import { metrics, trackDatabase, trackError } from "@/server/monitoring/metrics";
import { dbAdmin } from "@/lib/firebaseAdmin";

export const config = { api: { bodyParser: true } };

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { storeUid } = req.query;

  if (!storeUid || typeof storeUid !== "string") {
    return res.status(400).json({ error: "storeUid is required" });
  }

  try {
    const db = dbAdmin();
    const startTime = Date.now();
    
    // Fetch some data
    const reviewsSnap = await db.collection("reviews")
      .where("storeUid", "==", storeUid)
      .limit(10)
      .get();

    // Track database operation
    await trackDatabase({
      operation: "read",
      collection: "reviews",
      count: reviewsSnap.size,
      duration: Date.now() - startTime,
      storeUid
    });

    // Track custom metric
    await metrics.track({
      type: "review_created",
      severity: "info",
      storeUid,
      metadata: { count: reviewsSnap.size }
    });

    return res.status(200).json({
      ok: true,
      reviews: reviewsSnap.docs.map(d => d.data())
    });

  } catch (error: unknown) {
    // Track error
    await trackError({
      endpoint: "/api/example-monitored-endpoint",
      error: error instanceof Error ? error.message : "Unknown error",
      storeUid: storeUid as string
    });

    return res.status(500).json({ 
      error: "Internal server error" 
    });
  }
}

// Export with monitoring wrapper
export default withMonitoring(handler);
