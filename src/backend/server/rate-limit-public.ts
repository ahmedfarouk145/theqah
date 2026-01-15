/**
 * Rate Limiting Middleware for TheQah Public Endpoints
 * ====================================================
 * 
 * Purpose: Protect public API endpoints from abuse and DDoS attacks
 * Strategy: Memory-based sliding window with IP tracking
 * 
 * Features:
 * - Configurable limits per endpoint
 * - IP-based tracking with X-Forwarded-For support
 * - 429 responses with Retry-After headers
 * - Whitelist support for internal services
 * - Monitoring integration with metrics
 * - Automatic cleanup of stale entries
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

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

// ============================================================================
// In-Memory Store (Production should use Redis)
// ============================================================================

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  const keysToDelete: string[] = [];
  
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetTime) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => rateLimitStore.delete(key));
  
  if (keysToDelete.length > 0) {
    console.log(`[RateLimit] Cleaned up ${keysToDelete.length} stale entries`);
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
  
  // Cleanup stale entries periodically
  cleanupStaleEntries();
  
  // Skip rate limiting for whitelisted IPs
  if (config.skipIPs?.includes(clientIP)) {
    console.log(`[RateLimit] Skipping rate limit for whitelisted IP: ${clientIP}`);
    return false;
  }
  
  // Skip if special header is present (e.g., internal API key)
  if (config.skipHeader) {
    const headerValue = req.headers[config.skipHeader.name.toLowerCase()];
    const headerMatch = Array.isArray(headerValue) 
      ? headerValue[0] === config.skipHeader.value
      : headerValue === config.skipHeader.value;
      
    if (headerMatch) {
      console.log(`[RateLimit] Skipping rate limit for authenticated request`);
      return false;
    }
  }
  
  // Generate unique key for this IP + endpoint
  const key = `${config.identifier}:${clientIP}`;
  const entry = rateLimitStore.get(key);
  
  // No existing entry - first request in window
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
      firstRequest: now
    });
    
    // Track allowed request
    await trackRateLimitEvent({
      identifier: config.identifier,
      ip: clientIP,
      allowed: true,
      count: 1,
      limit: config.maxRequests,
      duration: Date.now() - startTime
    });
    
    return false; // Allow request
  }
  
  // Entry exists but window has expired - reset
  if (now > entry.resetTime) {
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
      firstRequest: now
    });
    
    await trackRateLimitEvent({
      identifier: config.identifier,
      ip: clientIP,
      allowed: true,
      count: 1,
      limit: config.maxRequests,
      duration: Date.now() - startTime
    });
    
    return false; // Allow request
  }
  
  // Entry exists and window is still active
  entry.count++;
  
  // Check if limit exceeded
  if (entry.count > config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000); // seconds
    
    // Set rate limit headers
    res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
    res.setHeader("X-RateLimit-Remaining", "0");
    res.setHeader("X-RateLimit-Reset", entry.resetTime.toString());
    res.setHeader("Retry-After", retryAfter.toString());
    
    // Track blocked request
    await trackRateLimitEvent({
      identifier: config.identifier,
      ip: clientIP,
      allowed: false,
      count: entry.count,
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
    
    console.log(`[RateLimit] BLOCKED ${clientIP} on ${config.identifier} (${entry.count}/${config.maxRequests})`);
    
    return true; // Request blocked
  }
  
  // Still within limit - set informational headers
  const remaining = config.maxRequests - entry.count;
  res.setHeader("X-RateLimit-Limit", config.maxRequests.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", entry.resetTime.toString());
  
  await trackRateLimitEvent({
    identifier: config.identifier,
    ip: clientIP,
    allowed: true,
    count: entry.count,
    limit: config.maxRequests,
    duration: Date.now() - startTime
  });
  
  return false; // Allow request
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
    console.error("[RateLimit] Failed to track event:", error);
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
// Utility Functions
// ============================================================================

/**
 * Get current rate limit status for an IP
 * Useful for debugging and monitoring
 */
export function getRateLimitStatus(identifier: string, ip: string): RateLimitEntry | null {
  const key = `${identifier}:${ip}`;
  return rateLimitStore.get(key) || null;
}

/**
 * Reset rate limit for an IP
 * Useful for admin operations
 */
export function resetRateLimit(identifier: string, ip: string): boolean {
  const key = `${identifier}:${ip}`;
  return rateLimitStore.delete(key);
}

/**
 * Get total number of tracked IPs
 * Useful for monitoring memory usage
 */
export function getRateLimitStats(): { totalKeys: number; storeSize: number } {
  return {
    totalKeys: rateLimitStore.size,
    storeSize: rateLimitStore.size // Approximate
  };
}
