// src/backend/server/rate-limit-kv.ts
/**
 * C1 Fix: Distributed Rate Limiting with Upstash Redis
 * Scales across serverless function invocations
 * 
 * Uses Upstash Redis for persistent rate limiting
 * that works across all serverless instances.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { Redis } from "@upstash/redis";
import { metrics } from "@/server/monitoring/metrics";

// ============================================================================
// Configuration
// ============================================================================

interface RateLimitConfig {
    /** Maximum requests allowed in the time window */
    maxRequests: number;
    /** Time window in seconds */
    windowSeconds: number;
    /** Unique identifier for this endpoint (for monitoring) */
    identifier: string;
    /** Custom message for rate limit exceeded */
    message?: string;
    /** Skip rate limiting for these IPs (whitelist) */
    skipIPs?: string[];
    /** Skip if specific header is present (e.g., internal API key) */
    skipHeader?: { name: string; value: string };
}

// Production-safe logging
const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: unknown[]) => isDev && console.log(...args);

// Check if Upstash Redis is configured
const isRedisConfigured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Initialize Redis client (lazy - only when needed)
let redisClient: Redis | null = null;
function getRedis(): Redis | null {
    if (!isRedisConfigured) return null;
    if (!redisClient) {
        redisClient = Redis.fromEnv();
    }
    return redisClient;
}

// ============================================================================
// IP Extraction
// ============================================================================

function getClientIP(req: NextApiRequest): string {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
        return ip.trim();
    }

    const realIP = req.headers["x-real-ip"];
    if (realIP && typeof realIP === "string") {
        return realIP.trim();
    }

    const cfConnectingIP = req.headers["cf-connecting-ip"];
    if (cfConnectingIP && typeof cfConnectingIP === "string") {
        return cfConnectingIP.trim();
    }

    return req.socket.remoteAddress || "unknown";
}

// ============================================================================
// In-Memory Fallback (for development or if Redis not configured)
// ============================================================================

const memoryStore = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimitMemory(
    key: string,
    maxRequests: number,
    windowSeconds: number
): Promise<{ allowed: boolean; current: number; resetAt: number }> {
    const now = Date.now();
    const entry = memoryStore.get(key);

    if (!entry || now > entry.resetAt) {
        const resetAt = now + windowSeconds * 1000;
        memoryStore.set(key, { count: 1, resetAt });
        return { allowed: true, current: 1, resetAt };
    }

    entry.count++;
    const allowed = entry.count <= maxRequests;
    return { allowed, current: entry.count, resetAt: entry.resetAt };
}

// ============================================================================
// Upstash Redis Rate Limiting
// ============================================================================

async function checkRateLimitRedis(
    key: string,
    maxRequests: number,
    windowSeconds: number
): Promise<{ allowed: boolean; current: number; resetAt: number }> {
    const redis = getRedis();
    if (!redis) {
        return checkRateLimitMemory(key, maxRequests, windowSeconds);
    }

    try {
        const countKey = `rl:${key}:count`;

        // Use INCR with TTL for atomic rate limiting
        const count = await redis.incr(countKey);

        // Set TTL on first request (when count is 1)
        if (count === 1) {
            await redis.expire(countKey, windowSeconds);
        }

        const resetAt = Date.now() + windowSeconds * 1000;
        const allowed = count <= maxRequests;

        return { allowed, current: count, resetAt };
    } catch (error) {
        // If Redis fails, fall back to memory
        console.error("[RateLimitRedis] Error:", error);
        return checkRateLimitMemory(key, maxRequests, windowSeconds);
    }
}

// ============================================================================
// Main Rate Limit Function
// ============================================================================

/**
 * Check if request should be rate limited using Upstash Redis
 * Falls back to in-memory if Redis is not configured
 * 
 * @returns true if request is rate limited (response already sent)
 * @returns false if request should proceed
 */
export async function rateLimitKV(
    req: NextApiRequest,
    res: NextApiResponse,
    config: RateLimitConfig
): Promise<boolean> {
    const clientIP = getClientIP(req);
    const key = `${config.identifier}:${clientIP}`;

    // Skip rate limiting for whitelisted IPs
    if (config.skipIPs?.includes(clientIP)) {
        devLog(`[RateLimitKV] Skipping for whitelisted IP: ${clientIP}`);
        return false;
    }

    // Skip if special header is present
    if (config.skipHeader) {
        const headerValue = req.headers[config.skipHeader.name.toLowerCase()];
        const headerMatch = Array.isArray(headerValue)
            ? headerValue[0] === config.skipHeader.value
            : headerValue === config.skipHeader.value;

        if (headerMatch) {
            devLog(`[RateLimitKV] Skipping for authenticated request`);
            return false;
        }
    }

    // Check rate limit using Redis or fallback to memory
    const result = await checkRateLimitRedis(key, config.maxRequests, config.windowSeconds);

    const remaining = Math.max(0, config.maxRequests - result.current);
    const retryAfter = Math.ceil((result.resetAt - Date.now()) / 1000);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", result.resetAt.toString());
    res.setHeader("X-RateLimit-Policy", isRedisConfigured ? "distributed" : "local");

    if (!result.allowed) {
        res.setHeader("Retry-After", retryAfter.toString());

        // Track blocked request
        try {
            await metrics.track({
                type: "api_call",
                severity: "warning",
                endpoint: config.identifier,
                method: "RATE_LIMIT",
                statusCode: 429,
                duration: 0,
                metadata: {
                    action: "blocked",
                    ip: anonymizeIP(clientIP),
                    count: result.current,
                    limit: config.maxRequests,
                    backend: isRedisConfigured ? "upstash-redis" : "memory",
                },
            });
        } catch {
            // Don't fail on metrics error
        }

        res.status(429).json({
            error: "rate_limit_exceeded",
            message: config.message || "Too many requests, please try again later",
            retryAfter,
            limit: config.maxRequests,
        });

        devLog(`[RateLimitKV] BLOCKED ${clientIP} on ${config.identifier} (${result.current}/${config.maxRequests})`);
        return true;
    }

    return false;
}

/**
 * Anonymize IP for privacy
 */
function anonymizeIP(ip: string): string {
    if (ip === "unknown") return "unknown";
    if (ip.includes(".")) {
        const parts = ip.split(".");
        if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    if (ip.includes(":")) {
        const parts = ip.split(":");
        if (parts.length >= 4) return parts.slice(0, 4).join(":") + "::";
    }
    return ip;
}

// ============================================================================
// Preset Configurations (using seconds for Redis TTL)
// ============================================================================

export const RateLimitPresetsKV = {
    /** Strict limit for public APIs - 60 requests per 15 minutes */
    PUBLIC_STRICT: {
        maxRequests: 60,
        windowSeconds: 15 * 60,
    },

    /** Moderate limit for public APIs - 100 requests per 15 minutes */
    PUBLIC_MODERATE: {
        maxRequests: 100,
        windowSeconds: 15 * 60,
    },

    /** Generous limit for authenticated APIs - 300 requests per 15 minutes */
    AUTHENTICATED: {
        maxRequests: 300,
        windowSeconds: 15 * 60,
    },

    /** Write operations - 20 requests per 5 minutes */
    WRITE_STRICT: {
        maxRequests: 20,
        windowSeconds: 5 * 60,
    },

    /** Widget requests - 200 requests per minute (for busy stores) */
    WIDGET: {
        maxRequests: 200,
        windowSeconds: 60,
    },
};

// ============================================================================
// Utility: Check if Redis is available
// ============================================================================

export function isDistributedRateLimitEnabled(): boolean {
    return isRedisConfigured;
}

export default rateLimitKV;
