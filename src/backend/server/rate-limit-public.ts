/**
 * Rate Limiting Middleware for TheQah Public Endpoints
 * ====================================================
 * 
 * Purpose: Protect public API endpoints from abuse and DDoS attacks
 * Strategy: Redis-based (Vercel KV/Upstash) with memory fallback
 * 
 * Features:
 * - Distributed rate limiting using Redis (works across serverless instances)
 * - Fallback to in-memory for local dev without Redis
 * - Configurable limits per endpoint
 * - IP-based tracking with X-Forwarded-For support
 * - 429 responses with Retry-After headers
 * - Whitelist support for internal services
 * - Monitoring integration with metrics
 * 
 * Usage:
 * ```typescript
 * import { rateLimitPublic } from "@/server/rate-limit-public";
 * 
 * export default async function handler(req, res) {
 *   const limited = await rateLimitPublic(req, res, {
 *     maxRequests: 100,
 *     windowMs: 15 * 60 * 1000, // 15 minutes
 *     identifier: "check-verified"
 *   });
 *   
 *   if (limited) return; // Response already sent
 *   
 *   // Continue with normal handler...
 * }
 * ```
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { metrics } from "@/server/monitoring/metrics";

// H7: Production-safe logging - only log in development
const isDev = process.env.NODE_ENV !== "production";
const devLog = (...args: unknown[]) => isDev && console.log(...args);

// ============================================================================
// Configuration
// ============================================================================

interface RateLimitConfig {
  /** Maximum requests allowed in the time window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Unique identifier for this endpoint (for monitoring) */
  identifier: string;
  /** Custom message for rate limit exceeded */
  message?: string;
  /** Skip rate limiting for these IPs (whitelist) */
  skipIPs?: string[];
  /** Skip if specific header is present (e.g., internal API key) */
  skipHeader?: { name: string; value: string };
}

// ============================================================================
// Redis Store (Vercel KV / Upstash)
// ============================================================================

// Lazy-load kv to avoid import errors if not configured
let kvClient: { incr: (key: string) => Promise<number>; expire: (key: string, seconds: number) => Promise<unknown>; get: (key: string) => Promise<number | null> } | null = null;
let kvInitialized = false;

async function getKV() {
  if (kvInitialized) return kvClient;
  kvInitialized = true;

  // Check if Vercel KV is configured
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    try {
      const { kv } = await import("@vercel/kv");
      kvClient = kv;
      devLog("[RateLimit] Using Vercel KV for distributed rate limiting");
    } catch (e) {
      devLog("[RateLimit] Vercel KV import failed, falling back to memory:", e);
    }
  } else {
    devLog("[RateLimit] KV not configured, using in-memory fallback");
  }

  return kvClient;
}

// ============================================================================
// Fallback In-Memory Store (for local dev without Redis)
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  const keysToDelete: string[] = [];

  memoryStore.forEach((entry, key) => {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  });

  keysToDelete.forEach(key => memoryStore.delete(key));

  if (keysToDelete.length > 0 && isDev) {
    devLog(`[RateLimit] Cleaned up ${keysToDelete.length} stale entries`);
  }
}

// ============================================================================
// IP Extraction
// ============================================================================

/**
 * Extract client IP address from request headers
 * Supports Vercel, Cloudflare, nginx proxies
 */
function getClientIP(req: NextApiRequest): string {
  // Check common proxy headers
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

  // Fallback to socket address
  return req.socket.remoteAddress || "unknown";
}

// ============================================================================
// Rate Limit Check
// ============================================================================

/**
 * Check if request should be rate limited
 * Uses Vercel KV/Upstash Redis for distributed rate limiting in production
 * Falls back to in-memory for local development
 * Returns true if request is rate limited (response already sent)
 * Returns false if request should proceed
 */
export async function rateLimitPublic(
  req: NextApiRequest,
  res: NextApiResponse,
  config: RateLimitConfig
): Promise<boolean> {
  const startTime = Date.now();
  const clientIP = getClientIP(req);
  const now = Date.now();
  const windowSec = Math.ceil(config.windowMs / 1000);

  // Skip rate limiting for whitelisted IPs
  if (config.skipIPs?.includes(clientIP)) {
    devLog(`[RateLimit] Skipping rate limit for whitelisted IP: ${clientIP}`);
    return false;
  }

  // Skip if special header is present (e.g., internal API key)
  if (config.skipHeader) {
    const headerValue = req.headers[config.skipHeader.name.toLowerCase()];
    const headerMatch = Array.isArray(headerValue)
      ? headerValue[0] === config.skipHeader.value
      : headerValue === config.skipHeader.value;

    if (headerMatch) {
      devLog(`[RateLimit] Skipping rate limit for authenticated request`);
      return false;
    }
  }

  // Generate unique key for this IP + endpoint
  const key = `ratelimit:${config.identifier}:${clientIP}`;

  let count: number;
  let resetTime: number;

  // Try to use KV (Redis), fall back to memory
  const kv = await getKV();

  if (kv) {
    // ========== Redis-based rate limiting ==========
    try {
      count = await kv.incr(key);

      // If this is the first request, set expiry
      if (count === 1) {
        await kv.expire(key, windowSec);
      }

      // Calculate reset time (approximate - based on TTL)
      resetTime = now + config.windowMs;

    } catch (e) {
      // Redis error - fall through to memory
      devLog("[RateLimit] KV error, falling back to memory:", e);
      const result = memoryRateLimit(key, config, now);
      count = result.count;
      resetTime = result.resetTime;
    }
  } else {
    // ========== In-memory fallback ==========
    cleanupStaleEntries();
    const result = memoryRateLimit(key, config, now);
    count = result.count;
    resetTime = result.resetTime;
  }

  // Check if limit exceeded
  if (count > config.maxRequests) {
    const retryAfter = Math.ceil((resetTime - now) / 1000);

    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", resetTime.toString());
    res.setHeader("Retry-After", retryAfter.toString());

    // Track blocked request
    await trackRateLimitEvent({
      identifier: config.identifier,
      ip: clientIP,
      allowed: false,
      count,
      limit: config.maxRequests,
      duration: Date.now() - startTime
    });

    // Send 429 response
    res.status(429).json({
      error: "rate_limit_exceeded",
      message: config.message || "Too many requests, please try again later",
      retryAfter,
      limit: config.maxRequests,
      windowMs: config.windowMs
    });

    devLog(`[RateLimit] BLOCKED ${clientIP} on ${config.identifier} (${count}/${config.maxRequests})`);

    return true; // Request blocked
  }

  // Still within limit - set informational headers
  const remaining = config.maxRequests - count;
  res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", resetTime.toString());

  await trackRateLimitEvent({
    identifier: config.identifier,
    ip: clientIP,
    allowed: true,
    count,
    limit: config.maxRequests,
    duration: Date.now() - startTime
  });

  return false; // Allow request
}

/**
 * In-memory rate limiting (fallback)
 */
function memoryRateLimit(key: string, config: RateLimitConfig, now: number): { count: number; resetTime: number } {
  const entry = memoryStore.get(key);

  if (!entry || now > entry.resetTime) {
    // First request or window expired
    const newEntry = { count: 1, resetTime: now + config.windowMs };
    memoryStore.set(key, newEntry);
    return newEntry;
  }

  // Increment count
  entry.count++;
  return entry;
}

// ============================================================================
// Monitoring Integration
// ============================================================================

interface RateLimitEventData {
  identifier: string;
  ip: string;
  allowed: boolean;
  count: number;
  limit: number;
  duration: number;
}

async function trackRateLimitEvent(data: RateLimitEventData): Promise<void> {
  try {
    await metrics.track({
      type: "api_call",
      severity: data.allowed ? "info" : "warning",
      endpoint: data.identifier,
      method: "RATE_LIMIT",
      statusCode: data.allowed ? 200 : 429,
      duration: data.duration,
      metadata: {
        action: data.allowed ? "allowed" : "blocked",
        ip: anonymizeIP(data.ip), // Anonymize for privacy
        count: data.count,
        limit: data.limit,
        usage: `${data.count}/${data.limit}`,
        blocked: !data.allowed
      }
    });
  } catch (error) {
    // Don't fail request if tracking fails
    if (isDev) console.error("[RateLimit] Failed to track event:", error);
  }
}

/**
 * Anonymize IP for GDPR compliance
 * Example: 192.168.1.100 -> 192.168.1.0
 */
function anonymizeIP(ip: string): string {
  if (ip === "unknown") return "unknown";

  // IPv4
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
  }

  // IPv6 - anonymize last 4 groups
  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 4) {
      return parts.slice(0, 4).join(":") + "::";
    }
  }

  return ip;
}

// ============================================================================
// Preset Configurations
// ============================================================================

/**
 * Rate limit presets for common use cases
 */
export const RateLimitPresets = {
  /** Strict limit for public APIs - 60 requests per 15 minutes */
  PUBLIC_STRICT: {
    maxRequests: 60,
    windowMs: 15 * 60 * 1000,
  },

  /** Moderate limit for public APIs - 100 requests per 15 minutes */
  PUBLIC_MODERATE: {
    maxRequests: 100,
    windowMs: 15 * 60 * 1000,
  },

  /** Generous limit for authenticated APIs - 300 requests per 15 minutes */
  AUTHENTICATED: {
    maxRequests: 300,
    windowMs: 15 * 60 * 1000,
  },

  /** Very strict for write operations - 20 requests per 5 minutes */
  WRITE_STRICT: {
    maxRequests: 20,
    windowMs: 5 * 60 * 1000,
  },
};

// ============================================================================
// Utility Functions (Memory store only - for debugging)
// ============================================================================

/**
 * Get current rate limit status for an IP (memory store only)
 * NOTE: This only works with the in-memory fallback, not Redis
 */
export function getRateLimitStatus(identifier: string, ip: string): RateLimitEntry | null {
  const key = `ratelimit:${identifier}:${ip}`;
  return memoryStore.get(key) || null;
}

/**
 * Reset rate limit for an IP (memory store only)
 * NOTE: This only works with the in-memory fallback, not Redis
 */
export function resetRateLimit(identifier: string, ip: string): boolean {
  const key = `ratelimit:${identifier}:${ip}`;
  return memoryStore.delete(key);
}

/**
 * Get stats about the memory store
 * NOTE: This only reflects the in-memory fallback, not Redis
 */
export function getRateLimitStats(): { totalKeys: number; storeSize: number } {
  return {
    totalKeys: memoryStore.size,
    storeSize: memoryStore.size
  };
}

