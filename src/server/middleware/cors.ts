// src/server/middleware/cors.ts

/**
 * CORS Middleware
 * 
 * Configures Cross-Origin Resource Sharing for API endpoints.
 * Allows widgets and external services to access our APIs safely.
 */

import { NextApiRequest, NextApiResponse } from "next";

export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const defaultOptions: CorsOptions = {
  origin: true, // Allow all origins by default
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Request-ID",
    "X-Correlation-ID",
  ],
  exposedHeaders: ["X-Request-ID"],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Check if origin is allowed
 */
function isOriginAllowed(origin: string | undefined, allowedOrigin: string | string[] | boolean): boolean {
  if (!origin) return false;
  if (allowedOrigin === true) return true;
  if (allowedOrigin === false) return false;
  if (typeof allowedOrigin === "string") return origin === allowedOrigin;
  if (Array.isArray(allowedOrigin)) return allowedOrigin.includes(origin);
  return false;
}

/**
 * Set CORS headers on response
 */
export function setCorsHeaders(
  req: NextApiRequest,
  res: NextApiResponse,
  options: CorsOptions = {}
): void {
  const opts = { ...defaultOptions, ...options };
  const origin = req.headers.origin;

  // Set Access-Control-Allow-Origin
  if (opts.origin === true) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  } else if (typeof opts.origin === "string") {
    res.setHeader("Access-Control-Allow-Origin", opts.origin);
  } else if (Array.isArray(opts.origin) && origin) {
    if (isOriginAllowed(origin, opts.origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
  }

  // Set other CORS headers
  if (opts.credentials) {
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  if (opts.methods) {
    res.setHeader("Access-Control-Allow-Methods", opts.methods.join(", "));
  }

  if (opts.allowedHeaders) {
    res.setHeader("Access-Control-Allow-Headers", opts.allowedHeaders.join(", "));
  }

  if (opts.exposedHeaders) {
    res.setHeader("Access-Control-Expose-Headers", opts.exposedHeaders.join(", "));
  }

  if (opts.maxAge) {
    res.setHeader("Access-Control-Max-Age", opts.maxAge.toString());
  }

  // Set Vary header
  res.setHeader("Vary", "Origin");
}

/**
 * CORS middleware with preflight handling
 */
export function withCors(
  handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void,
  options: CorsOptions = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    // Set CORS headers
    setCorsHeaders(req, res, options);

    // Handle preflight request
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }

    // Call the actual handler
    return handler(req, res);
  };
}

/**
 * Preset CORS configurations
 */
export const corsPresets = {
  // Public API - Allow all origins
  public: {
    origin: true,
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"],
  } as CorsOptions,

  // Widget API - Allow widget embedding
  widget: {
    origin: true,
    credentials: false,
    methods: ["GET", "OPTIONS"],
  } as CorsOptions,

  // Admin API - Restrict to known origins
  admin: {
    origin: [
      "https://theqah.com.sa",
      "https://www.theqah.com.sa",
      "http://localhost:3000",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  } as CorsOptions,

  // Webhook API - No CORS (server-to-server)
  webhook: {
    origin: false,
    credentials: false,
  } as CorsOptions,
};
