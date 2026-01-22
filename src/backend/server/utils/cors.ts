// src/backend/server/utils/cors.ts
/**
 * H8: CORS Utility for Public Endpoints
 * Ensures consistent CORS headers across all public APIs
 */

import type { NextApiRequest, NextApiResponse } from "next";

export interface CorsOptions {
    origin?: string | string[];
    methods?: string[];
    headers?: string[];
    credentials?: boolean;
    maxAge?: number;
}

const DEFAULT_OPTIONS: CorsOptions = {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    headers: ["Content-Type", "x-theqah-widget", "Authorization"],
    credentials: false,
    maxAge: 86400, // 24 hours
};

/**
 * Apply CORS headers to response
 * @returns true if this was a preflight request (caller should return)
 */
export function applyCors(
    req: NextApiRequest,
    res: NextApiResponse,
    options: CorsOptions = {}
): boolean {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Determine origin
    const requestOrigin = req.headers.origin || "*";
    let allowedOrigin = "*";

    if (opts.origin === "*") {
        allowedOrigin = "*";
    } else if (Array.isArray(opts.origin)) {
        if (opts.origin.includes(requestOrigin)) {
            allowedOrigin = requestOrigin;
        } else {
            allowedOrigin = opts.origin[0];
        }
    } else if (typeof opts.origin === "string") {
        allowedOrigin = opts.origin;
    }

    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);

    if (opts.credentials) {
        res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // Handle preflight
    if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", opts.methods?.join(", ") || "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", opts.headers?.join(", ") || "Content-Type");
        res.setHeader("Access-Control-Max-Age", String(opts.maxAge || 86400));
        res.status(200).end();
        return true; // Preflight handled
    }

    return false;
}

/**
 * CORS middleware wrapper
 */
export function withCors(
    handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>,
    options?: CorsOptions
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
    return async (req: NextApiRequest, res: NextApiResponse) => {
        const isPreflight = applyCors(req, res, options);
        if (isPreflight) return;
        return handler(req, res);
    };
}

export default applyCors;
