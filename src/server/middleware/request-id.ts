// src/server/middleware/request-id.ts

/**
 * Request ID Middleware
 * 
 * Generates a unique ID for each request to enable distributed tracing
 * and easier debugging across multiple services and logs.
 * 
 * Features:
 * - Generates UUID v4 for each request
 * - Accepts existing X-Request-ID header if provided
 * - Adds request ID to response headers
 * - Integrates with logging and monitoring systems
 */

import { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";

// Extend NextApiRequest to include requestId
declare module "next" {
  interface NextApiRequest {
    requestId?: string;
  }
}

/**
 * Generate or extract request ID from headers
 */
export function getRequestId(req: NextApiRequest): string {
  // Check if request ID already exists (from proxy or previous middleware)
  const existingId =
    req.headers["x-request-id"] ||
    req.headers["x-correlation-id"] ||
    req.requestId;

  if (existingId) {
    return Array.isArray(existingId) ? existingId[0] : existingId;
  }

  // Generate new UUID v4
  return randomUUID();
}

/**
 * Request ID middleware
 * Adds unique ID to each request for tracing
 */
export function withRequestId(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Get or generate request ID
    const requestId = getRequestId(req);

    // Attach to request object
    req.requestId = requestId;

    // Add to response headers
    res.setHeader("X-Request-ID", requestId);

    // Call the actual handler
    return handler(req, res);
  };
}

/**
 * Helper to get request ID from request object
 */
export function extractRequestId(req: NextApiRequest): string {
  return req.requestId || getRequestId(req);
}

/**
 * Create logger with request ID context
 */
export function createLogger(req: NextApiRequest) {
  const requestId = extractRequestId(req);

  return {
    requestId,
    log: (...args: any[]) => console.log(`[${requestId}]`, ...args),
    error: (...args: any[]) => console.error(`[${requestId}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${requestId}]`, ...args),
    info: (...args: any[]) => console.info(`[${requestId}]`, ...args),
    debug: (...args: any[]) => console.debug(`[${requestId}]`, ...args),
  };
}
