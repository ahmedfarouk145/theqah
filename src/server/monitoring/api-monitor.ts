// src/server/monitoring/api-monitor.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { trackApiCall } from "./metrics";

/**
 * Middleware to monitor API endpoint performance and errors
 */
export function withMonitoring(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // H3: Exclude monitoring endpoints from being monitored (prevent circular monitoring)
    const EXCLUDED_PATHS = [
      '/api/admin/monitor-app',
      '/api/admin/monitor-realtime',
      '/api/admin/monitor-sync',
      '/api/admin/cleanup-metrics'
    ];
    
    const endpoint = req.url || "unknown";
    
    // Check if this endpoint should be excluded
    if (EXCLUDED_PATHS.some(path => endpoint.startsWith(path))) {
      // Skip monitoring, just call the handler
      return handler(req, res);
    }

    const startTime = Date.now();
    const method = req.method || "GET";

    // Extract user/store context from various sources
    let userId: string | undefined;
    let storeUid: string | undefined;

    try {
      // From query params
      if (typeof req.query.storeUid === "string") {
        storeUid = req.query.storeUid;
      }
      if (typeof req.query.userId === "string") {
        userId = req.query.userId;
      }

      // From body
      if (req.body) {
        if (req.body.storeUid) storeUid = req.body.storeUid;
        if (req.body.userId) userId = req.body.userId;
      }
    } catch {
      // Silent fail on context extraction
    }

    // Capture original json and status methods
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);

    let statusCode = 200;
    let responseError: string | undefined;

    // Override res.status to capture status code
    res.status = (code: number) => {
      statusCode = code;
      return originalStatus(code);
    };

    // Override res.json to capture errors
    res.json = (body: unknown) => {
      if (body && typeof body === "object" && "error" in body) {
        responseError = String(body.error);
      }
      return originalJson(body);
    };

    try {
      await handler(req, res);
    } catch (error) {
      statusCode = 500;
      responseError = error instanceof Error ? error.message : "Unknown error";
      
      // Re-throw to let Next.js handle it
      throw error;
    } finally {
      const duration = Date.now() - startTime;

      // Track the API call
      await trackApiCall({
        endpoint,
        method,
        statusCode,
        duration,
        userId,
        storeUid,
        error: responseError
      }).catch(() => {}); // Silent fail on tracking errors
    }
  };
}
