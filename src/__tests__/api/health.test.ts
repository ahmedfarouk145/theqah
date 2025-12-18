// src/__tests__/api/health.test.ts
import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Health Check Tests (M15)
 * 
 * Tests for:
 * - Basic health check endpoint
 * - Database connectivity check
 * - External API availability
 * - Service status aggregation
 */

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  checks: {
    database?: CheckResult;
    firestore?: CheckResult;
    salla?: CheckResult;
  };
}

interface CheckResult {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
}

// Mock services
let mockFirestoreConnected = true;
let mockSallaApiAvailable = true;

// Health check functions
const checkFirestore = async (): Promise<CheckResult> => {
  const start = Date.now();
  
  try {
    if (!mockFirestoreConnected) {
      throw new Error('Firestore connection failed');
    }
    
    return {
      status: 'up',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

const checkSallaApi = async (): Promise<CheckResult> => {
  const start = Date.now();
  
  try {
    if (!mockSallaApiAvailable) {
      throw new Error('Salla API unavailable');
    }
    
    return {
      status: 'up',
      responseTime: Date.now() - start
    };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

const getHealthStatus = async (): Promise<HealthStatus> => {
  const checks = await Promise.all([
    checkFirestore(),
    checkSallaApi()
  ]);
  
  const [firestore, salla] = checks;
  
  // Determine overall status
  const someDown = firestore.status === 'down' || salla.status === 'down';
  
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (firestore.status === 'down' && salla.status === 'down') {
    status = 'unhealthy';
  } else if (someDown) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: Date.now(),
    uptime: process.uptime(),
    version: '1.0.0',
    checks: {
      firestore,
      salla
    }
  };
};

describe('Health Check', () => {
  
  beforeEach(() => {
    // Reset mocks
    mockFirestoreConnected = true;
    mockSallaApiAvailable = true;
  });
  
  describe('Basic Health Check', () => {
    
    it('should return healthy status when all services are up', async () => {
      const health = await getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.checks.firestore?.status).toBe('up');
      expect(health.checks.salla?.status).toBe('up');
    });
    
    it('should include timestamp', async () => {
      const health = await getHealthStatus();
      
      expect(health.timestamp).toBeGreaterThan(0);
      expect(typeof health.timestamp).toBe('number');
    });
    
    it('should include uptime', async () => {
      const health = await getHealthStatus();
      
      expect(health.uptime).toBeGreaterThanOrEqual(0);
      expect(typeof health.uptime).toBe('number');
    });
    
    it('should include version', async () => {
      const health = await getHealthStatus();
      
      expect(health.version).toBe('1.0.0');
    });
  });
  
  describe('Database Connectivity', () => {
    
    it('should check Firestore connectivity', async () => {
      const health = await getHealthStatus();
      
      expect(health.checks.firestore).toBeDefined();
      expect(health.checks.firestore?.status).toBe('up');
    });
    
    it('should detect Firestore connection failure', async () => {
      mockFirestoreConnected = false;
      
      const health = await getHealthStatus();
      
      expect(health.checks.firestore?.status).toBe('down');
      expect(health.checks.firestore?.error).toBeDefined();
    });
    
    it('should measure Firestore response time', async () => {
      const health = await getHealthStatus();
      
      expect(health.checks.firestore?.responseTime).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('External API Availability', () => {
    
    it('should check Salla API availability', async () => {
      const health = await getHealthStatus();
      
      expect(health.checks.salla).toBeDefined();
      expect(health.checks.salla?.status).toBe('up');
    });
    
    it('should detect Salla API unavailability', async () => {
      mockSallaApiAvailable = false;
      
      const health = await getHealthStatus();
      
      expect(health.checks.salla?.status).toBe('down');
      expect(health.checks.salla?.error).toBeDefined();
    });
    
    it('should measure Salla API response time', async () => {
      const health = await getHealthStatus();
      
      expect(health.checks.salla?.responseTime).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Service Status Aggregation', () => {
    
    it('should return healthy when all services are up', async () => {
      const health = await getHealthStatus();
      
      expect(health.status).toBe('healthy');
    });
    
    it('should return degraded when one service is down', async () => {
      mockSallaApiAvailable = false;
      
      const health = await getHealthStatus();
      
      expect(health.status).toBe('degraded');
    });
    
    it('should return unhealthy when all services are down', async () => {
      mockFirestoreConnected = false;
      mockSallaApiAvailable = false;
      
      const health = await getHealthStatus();
      
      expect(health.status).toBe('unhealthy');
    });
    
    it('should return degraded when Firestore is down', async () => {
      mockFirestoreConnected = false;
      
      const health = await getHealthStatus();
      
      expect(health.status).toBe('degraded');
    });
  });
  
  describe('Error Handling', () => {
    
    it('should handle Firestore errors gracefully', async () => {
      mockFirestoreConnected = false;
      
      const health = await getHealthStatus();
      
      expect(health.checks.firestore?.status).toBe('down');
      expect(health.checks.firestore?.error).toContain('Firestore');
    });
    
    it('should handle Salla API errors gracefully', async () => {
      mockSallaApiAvailable = false;
      
      const health = await getHealthStatus();
      
      expect(health.checks.salla?.status).toBe('down');
      expect(health.checks.salla?.error).toContain('Salla');
    });
    
    it('should not crash when all checks fail', async () => {
      mockFirestoreConnected = false;
      mockSallaApiAvailable = false;
      
      await expect(getHealthStatus()).resolves.toBeDefined();
    });
  });
  
  describe('Response Time Tracking', () => {
    
    it('should track response time for each check', async () => {
      const health = await getHealthStatus();
      
      expect(health.checks.firestore?.responseTime).toBeGreaterThanOrEqual(0);
      expect(health.checks.salla?.responseTime).toBeGreaterThanOrEqual(0);
    });
    
    it('should complete health check quickly', async () => {
      const start = Date.now();
      await getHealthStatus();
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });
  
  describe('Uptime Tracking', () => {
    
    it('should report process uptime', async () => {
      const health = await getHealthStatus();
      
      expect(health.uptime).toBeGreaterThanOrEqual(0);
    });
    
    it('should use process.uptime()', async () => {
      const expectedUptime = process.uptime();
      const health = await getHealthStatus();
      
      // Allow small difference due to execution time
      expect(Math.abs(health.uptime - expectedUptime)).toBeLessThan(1);
    });
  });
  
  describe('Health Check Endpoint', () => {
    
    it('should return JSON response', async () => {
      const health = await getHealthStatus();
      
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('version');
      expect(health).toHaveProperty('checks');
    });
    
    it('should include all required fields', async () => {
      const health = await getHealthStatus();
      
      expect(health.status).toBeDefined();
      expect(health.timestamp).toBeDefined();
      expect(health.uptime).toBeDefined();
      expect(health.version).toBeDefined();
      expect(health.checks).toBeDefined();
    });
    
    it('should have consistent structure', async () => {
      const health1 = await getHealthStatus();
      const health2 = await getHealthStatus();
      
      expect(Object.keys(health1).sort()).toEqual(Object.keys(health2).sort());
    });
  });
  
  describe('Health Status Values', () => {
    
    it('should only return valid status values', async () => {
      const health = await getHealthStatus();
      
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });
    
    it('should only return valid check status values', async () => {
      const health = await getHealthStatus();
      
      Object.values(health.checks).forEach(check => {
        if (check) {
          expect(['up', 'down']).toContain(check.status);
        }
      });
    });
  });
  
  describe('Edge Cases', () => {
    
    it('should handle concurrent health checks', async () => {
      const promises = Array.from({ length: 5 }, () => getHealthStatus());
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(health => {
        expect(health.status).toBeDefined();
      });
    });
    
    it('should maintain state across multiple checks', async () => {
      const health1 = await getHealthStatus();
      
      mockSallaApiAvailable = false;
      const health2 = await getHealthStatus();
      
      expect(health1.status).toBe('healthy');
      expect(health2.status).toBe('degraded');
    });
  });
});
