# Rate Limiting Documentation

## Overview

TheQah implements rate limiting to protect public API endpoints from abuse and DDoS attacks. The system uses a sliding window algorithm with IP-based tracking.

## Architecture

**Strategy**: Sliding window with IP tracking  
**Storage**: In-memory Map (production should use Redis)  
**Window**: Configurable per endpoint (default: 15 minutes)  
**Limits**: Configurable per endpoint (default: 60-100 requests)  
**Cleanup**: Automatic stale entry removal every 5 minutes

## Configuration

### Rate Limit Presets

```typescript
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";

// Available presets:
RateLimitPresets.PUBLIC_STRICT     // 60 requests / 15 minutes
RateLimitPresets.PUBLIC_MODERATE   // 100 requests / 15 minutes
RateLimitPresets.AUTHENTICATED     // 300 requests / 15 minutes
RateLimitPresets.WRITE_STRICT      // 20 requests / 5 minutes
```

### Custom Configuration

```typescript
interface RateLimitConfig {
  maxRequests: number;      // Maximum requests in window
  windowMs: number;         // Time window in milliseconds
  identifier: string;       // Unique endpoint identifier
  message?: string;         // Custom error message
  skipIPs?: string[];       // IP whitelist
  skipHeader?: {            // Header-based bypass
    name: string;
    value: string;
  };
}
```

## Usage

### Basic Implementation

```typescript
import { rateLimitPublic, RateLimitPresets } from "@/server/rate-limit-public";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add rate limiting at the start of your handler
  const limited = await rateLimitPublic(req, res, {
    ...RateLimitPresets.PUBLIC_MODERATE,
    identifier: "my-endpoint"
  });
  
  if (limited) return; // 429 response already sent
  
  // Continue with normal handler logic...
}
```

### Custom Configuration

```typescript
const limited = await rateLimitPublic(req, res, {
  maxRequests: 50,
  windowMs: 10 * 60 * 1000, // 10 minutes
  identifier: "custom-endpoint",
  message: "Custom rate limit message",
  skipIPs: ["127.0.0.1", "::1"],
  skipHeader: {
    name: "x-api-key",
    value: process.env.INTERNAL_API_KEY || ""
  }
});
```

## Response Format

### Success Response (Within Limit)

Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1704067200000
```

### Rate Limit Exceeded (429)

Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704067200000
Retry-After: 847
```

Body:
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests, please try again later",
  "retryAfter": 847,
  "limit": 100,
  "windowMs": 900000
}
```

## IP Extraction

The rate limiter extracts client IP from multiple sources (in order of priority):

1. `X-Forwarded-For` header (Vercel, nginx)
2. `X-Real-IP` header
3. `CF-Connecting-IP` header (Cloudflare)
4. Socket remote address (fallback)

## Privacy & GDPR Compliance

All IP addresses are anonymized before being stored in metrics:

```typescript
// IPv4: 192.168.1.100 -> 192.168.1.0
// IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334 -> 2001:0db8:85a3:0000::
```

## Bypass Options

### IP Whitelist

```typescript
const limited = await rateLimitPublic(req, res, {
  ...RateLimitPresets.PUBLIC_MODERATE,
  identifier: "endpoint",
  skipIPs: ["127.0.0.1", "::1", "10.0.0.1"]
});
```

### Header-Based Bypass

For internal services or authenticated requests:

```typescript
const limited = await rateLimitPublic(req, res, {
  ...RateLimitPresets.PUBLIC_MODERATE,
  identifier: "endpoint",
  skipHeader: {
    name: "x-internal-api-key",
    value: process.env.INTERNAL_API_KEY || ""
  }
});
```

## Monitoring Integration

Rate limit events are automatically tracked in the metrics system:

```typescript
// Tracked data:
{
  type: "api_call",
  severity: "info" | "warning",
  endpoint: "endpoint-identifier",
  method: "RATE_LIMIT",
  statusCode: 200 | 429,
  duration: 5, // ms
  metadata: {
    action: "allowed" | "blocked",
    ip: "192.168.1.0", // anonymized
    count: 87,
    limit: 100,
    usage: "87/100",
    blocked: false
  }
}
```

### Query Rate Limit Metrics

```javascript
// Get blocked requests in last hour
db.collection("metrics")
  .where("method", "==", "RATE_LIMIT")
  .where("statusCode", "==", 429)
  .where("timestamp", ">=", Date.now() - 3600000)
  .get()

// Get rate limit usage by endpoint
db.collection("metrics")
  .where("method", "==", "RATE_LIMIT")
  .orderBy("timestamp", "desc")
  .limit(100)
  .get()
```

## Utility Functions

### Get Rate Limit Status

```typescript
import { getRateLimitStatus } from "@/server/rate-limit-public";

const status = getRateLimitStatus("endpoint-identifier", "192.168.1.100");
// Returns: { count: 87, limit: 100, remaining: 13, resetTime: 1704067200000 }
```

### Reset Rate Limit

```typescript
import { resetRateLimit } from "@/server/rate-limit-public";

resetRateLimit("endpoint-identifier", "192.168.1.100");
```

### Get Statistics

```typescript
import { getRateLimitStats } from "@/server/rate-limit-public";

const stats = getRateLimitStats();
// Returns: { totalKeys: 1523, endpoints: { "endpoint-1": 234, ... } }
```

## Protected Endpoints

Currently protected endpoints:

| Endpoint | Preset | Limit | Window |
|----------|--------|-------|--------|
| `/api/reviews/check-verified` | PUBLIC_MODERATE | 100 req | 15 min |
| `/api/public/reviews` | PUBLIC_MODERATE | 100 req | 15 min |

## Production Considerations

### Redis Migration

For production with multiple servers, migrate to Redis:

```typescript
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

// Replace Map operations with Redis:
// rateLimitStore.set(key, entry) -> redis.setex(key, ttl, JSON.stringify(entry))
// rateLimitStore.get(key) -> redis.get(key).then(JSON.parse)
```

### Distributed Rate Limiting

Use Redis with atomic operations:

```lua
-- Redis Lua script for atomic rate limiting
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end

if current > limit then
  return 0  -- Rate limited
else
  return 1  -- Allowed
end
```

### Monitoring Alerts

Set up alerts for rate limit abuse:

```typescript
// Alert if > 100 blocked requests in 5 minutes
// Alert if single IP has > 50% of all blocked requests
// Alert if rate limit triggers spike suddenly
```

## Testing

### Manual Testing

```bash
# Test rate limiting
for i in {1..110}; do
  curl -i http://localhost:3000/api/reviews/check-verified?storeId=test
done

# Should see 429 after 100 requests
```

### Automated Testing

```typescript
// tests/rate-limit.test.ts
import { rateLimitPublic } from "@/server/rate-limit-public";

describe("Rate Limiting", () => {
  it("should block after limit exceeded", async () => {
    // Mock req/res
    // Make 101 requests
    // Expect 100 success, 1 blocked
  });
});
```

## Troubleshooting

### Issue: Legitimate users getting rate limited

**Solution**: Increase limit or implement authenticated bypass:

```typescript
skipHeader: {
  name: "authorization",
  value: "Bearer *" // Any bearer token
}
```

### Issue: Rate limits not working

**Check**:
1. IP extraction - verify headers are correct
2. Cleanup running - check lastCleanup timestamp
3. Store persistence - verify entries are being created

### Issue: Memory usage growing

**Solution**: Reduce CLEANUP_INTERVAL or implement Redis storage

## Best Practices

1. **Start conservative**: Use stricter limits initially, then relax based on usage
2. **Monitor closely**: Watch for legitimate users hitting limits
3. **Whitelist carefully**: Don't whitelist too broadly
4. **Use presets**: Stick to predefined presets for consistency
5. **Test thoroughly**: Simulate high traffic before production
6. **Plan for scale**: Migrate to Redis when serving > 10k req/min
7. **Document exceptions**: Keep track of whitelisted IPs and reasons

## Support

For issues or questions:
- Check monitoring dashboard for rate limit metrics
- Review Firestore `metrics` collection for detailed logs
- Contact team lead for whitelist requests
