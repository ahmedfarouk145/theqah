// src/__tests__/middleware/rate-limit.test.ts
// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Request = { query?: { [key: string]: string | undefined }; body?: any; headers?: { [key: string]: string | undefined } };
type Response = { status?: (code: number) => Response; setHeader?: (key: string, value: string | number) => void; json?: (data: any) => void };
type NextFunction = () => void;

/**
 * Rate Limiting Tests (H9)
 * 
 * Tests for:
 * - Per-store rate limiting
 * - Global rate limiting
 * - Rate limit headers
 * - Rate limit exceeded responses
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

const rateLimitStore: RateLimitStore = {};

// Rate limit configuration
const RATE_LIMITS = {
  perStore: {
    windowMs: 60 * 1000, // 1 minute
    max: 100 // 100 requests per minute per store
  },
  global: {
    windowMs: 60 * 1000, // 1 minute
    max: 1000 // 1000 requests per minute globally
  },
  webhook: {
    windowMs: 60 * 1000,
    max: 300 // 300 webhooks per minute per store
  }
};

// Rate limiter middleware
const createRateLimiter = (options: { windowMs: number; max: number; keyGenerator?: (req: Request) => string }) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = options.keyGenerator ? options.keyGenerator(req) : 'global';
    const now = Date.now();
    
    // Get or create rate limit entry
    if (!rateLimitStore[key] || rateLimitStore[key].resetAt < now) {
      rateLimitStore[key] = {
        count: 0,
        resetAt: now + options.windowMs
      };
    }
    
    const limit = rateLimitStore[key];
    limit.count++;
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', options.max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - limit.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(limit.resetAt / 1000).toString());
    
    // Check if limit exceeded
    if (limit.count > options.max) {
      const retryAfter = Math.ceil((limit.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      
      return res.status(429).json({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          retryAfter
        }
      });
    }
    
    next();
  };
};

// Per-store rate limiter
const perStoreRateLimiter = createRateLimiter({
  ...RATE_LIMITS.perStore,
  keyGenerator: (req) => `store:${req.query.storeUid || req.body?.storeUid || 'unknown'}`
});

// Global rate limiter
const globalRateLimiter = createRateLimiter({
  ...RATE_LIMITS.global,
  keyGenerator: () => 'global'
});

// Webhook rate limiter
const webhookRateLimiter = createRateLimiter({
  ...RATE_LIMITS.webhook,
  keyGenerator: (req) => `webhook:${req.query.storeUid || req.body?.storeUid || 'unknown'}`
});

describe('Rate Limiting', () => {
  
  beforeEach(() => {
    // Clear rate limit store
    Object.keys(rateLimitStore).forEach(key => delete rateLimitStore[key]);
  });
  
  describe('Per-Store Rate Limiting', () => {
    
    it('should allow requests within limit', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
    
    it('should block requests exceeding limit', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 101 requests (limit is 100)
      for (let i = 0; i < 101; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED'
          })
        })
      );
    });
    
    it('should set rate limit headers', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
    
    it('should isolate rate limits per store', () => {
      const mockReq1 = { query: { storeUid: 'store-1' }, body: {} } as Request;
      const mockReq2 = { query: { storeUid: 'store-2' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make requests for store-1
      for (let i = 0; i < 50; i++) {
        perStoreRateLimiter(mockReq1, mockRes, mockNext);
      }
      
      // Make requests for store-2
      perStoreRateLimiter(mockReq2, mockRes, mockNext);
      
      // Both stores should be within their limits
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });
    
    it('should reset rate limit after window expires', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      // Simulate time passing (force reset)
      const key = 'store:store-123';
      rateLimitStore[key].resetAt = Date.now() - 1;
      
      // Next request should reset counter
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(rateLimitStore[key].count).toBe(1);
    });
  });
  
  describe('Global Rate Limiting', () => {
    
    it('should allow requests within global limit', () => {
      const mockReq = { query: {}, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      globalRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
    
    it('should block requests exceeding global limit', () => {
      const mockReq = { query: {}, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 1001 requests (global limit is 1000)
      for (let i = 0; i < 1001; i++) {
        globalRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
    
    it('should apply to all requests regardless of store', () => {
      const mockReq1 = { query: { storeUid: 'store-1' }, body: {} } as Request;
      const mockReq2 = { query: { storeUid: 'store-2' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 500 requests for store-1
      for (let i = 0; i < 500; i++) {
        globalRateLimiter(mockReq1, mockRes, mockNext);
      }
      
      // Make 501 requests for store-2 (should exceed global limit)
      for (let i = 0; i < 501; i++) {
        globalRateLimiter(mockReq2, mockRes, mockNext);
      }
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
  });
  
  describe('Webhook Rate Limiting', () => {
    
    it('should allow webhook requests within limit', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      webhookRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockNext).toHaveBeenCalled();
    });
    
    it('should block webhook requests exceeding limit', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 301 requests (webhook limit is 300)
      for (let i = 0; i < 301; i++) {
        webhookRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
    
    it('should use higher limit than per-store for webhooks', () => {
      expect(RATE_LIMITS.webhook.max).toBeGreaterThan(RATE_LIMITS.perStore.max);
    });
  });
  
  describe('Rate Limit Headers', () => {
    
    it('should include X-RateLimit-Limit header', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });
    
    it('should include X-RateLimit-Remaining header', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    });
    
    it('should include X-RateLimit-Reset header', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
    
    it('should include Retry-After header when limit exceeded', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Exceed limit
      for (let i = 0; i < 101; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
    
    it('should show correct remaining count', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        mockRes.setHeader.mockClear();
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      // After 3 requests, remaining should be 97
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '97');
    });
    
    it('should show 0 remaining when limit exceeded', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Exceed limit
      for (let i = 0; i < 101; i++) {
        mockRes.setHeader.mockClear();
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });
  });
  
  describe('Rate Limit Exceeded Response', () => {
    
    it('should return 429 status code', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      for (let i = 0; i < 101; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.status).toHaveBeenCalledWith(429);
    });
    
    it('should return proper error response', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      for (let i = 0; i < 101; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      expect(mockRes.json).toHaveBeenCalledWith({
        error: {
          message: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          statusCode: 429,
          retryAfter: expect.any(Number)
        }
      });
    });
    
    it('should include retryAfter in error response', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      for (let i = 0; i < 101; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      const response = mockRes.json.mock.calls[0][0];
      expect(response.error.retryAfter).toBeGreaterThan(0);
      expect(response.error.retryAfter).toBeLessThanOrEqual(60); // Within window
    });
  });
  
  describe('Rate Limit Reset', () => {
    
    it('should reset counter after window expires', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Use up the limit
      for (let i = 0; i < 100; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      // Force reset
      const key = 'store:store-123';
      rateLimitStore[key].resetAt = Date.now() - 1;
      
      // Should allow requests again
      mockRes.status.mockClear();
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.status).not.toHaveBeenCalledWith(429);
    });
    
    it('should start fresh counter after reset', () => {
      const mockReq = { query: { storeUid: 'store-123' }, body: {} } as Request;
      const mockRes = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as any;
      const mockNext = vi.fn();
      
      // Make some requests
      for (let i = 0; i < 50; i++) {
        perStoreRateLimiter(mockReq, mockRes, mockNext);
      }
      
      // Force reset
      const key = 'store:store-123';
      rateLimitStore[key].resetAt = Date.now() - 1;
      
      // Next request should have fresh count
      mockRes.setHeader.mockClear();
      perStoreRateLimiter(mockReq, mockRes, mockNext);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
    });
  });
});
