// src/pages/api/health.ts

/**
 * Health Check Endpoint
 * 
 * Simple endpoint for uptime monitoring services to check if the API is responsive.
 * Returns 200 OK with system status and timestamp.
 * 
 * Usage:
 * - Uptime monitoring (UptimeRobot, Pingdom, etc.)
 * - Load balancer health checks
 * - Kubernetes liveness/readiness probes
 */

import type { NextApiRequest, NextApiResponse } from "next";

interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: number;
  uptime: number;
  service: string;
  version: string;
  checks?: {
    database?: "ok" | "error";
    [key: string]: string | undefined;
  };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<HealthResponse>
) {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(),
      service: "TheQah API",
      version: "1.0.0",
    });
  }

  try {
    const response: HealthResponse = {
      status: "ok",
      timestamp: Date.now(),
      uptime: process.uptime(), // Seconds since process started
      service: "TheQah API",
      version: process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0",
    };

    // Optional: Add detailed checks with ?detailed=true query param
    if (req.query.detailed === "true") {
      response.checks = {};

      // Check Firebase connection (optional)
      try {
        const { dbAdmin } = await import("@/lib/firebaseAdmin");
        await dbAdmin().collection("_health_check").limit(1).get();
        response.checks.database = "ok";
      } catch (error) {
        response.checks.database = "error";
        response.status = "degraded";
      }
    }

    // Set appropriate cache headers
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).json(response);

  } catch (error) {
    console.error("[HEALTH] Health check failed:", error);

    return res.status(503).json({
      status: "down",
      timestamp: Date.now(),
      uptime: process.uptime(),
      service: "TheQah API",
      version: "1.0.0",
    });
  }
}
