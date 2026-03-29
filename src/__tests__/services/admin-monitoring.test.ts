import { describe, expect, it } from 'vitest';
import {
  buildMonitoringRealtimePayload,
  getMetricTimestampMs,
} from '@/backend/server/utils/admin-monitoring';

const NOW = Date.UTC(2026, 2, 28, 12, 10, 0);

describe('admin monitoring helpers', () => {
  it('normalizes metric timestamps from number, Date, and Timestamp-like values', () => {
    const dateValue = new Date(NOW - 1000);
    const timestampLike = {
      toDate: () => new Date(NOW - 2000),
    };

    expect(getMetricTimestampMs(NOW)).toBe(NOW);
    expect(getMetricTimestampMs(dateValue)).toBe(dateValue.getTime());
    expect(getMetricTimestampMs(timestampLike)).toBe(NOW - 2000);
  });

  it('builds realtime payloads from mixed timestamp types', () => {
    const payload = buildMonitoringRealtimePayload({
      now: NOW,
      metrics: [
        {
          id: 'metric-1',
          type: 'api_call',
          severity: 'info',
          endpoint: '/api/admin/stores',
          timestamp: NOW - 10_000,
          duration: 120,
          statusCode: 200,
          storeUid: 'salla:1',
        },
        {
          id: 'metric-2',
          type: 'api_call',
          severity: 'error',
          endpoint: '/api/admin/reviews',
          timestamp: new Date(NOW - 20_000),
          duration: 450,
          statusCode: 500,
          storeUid: 'salla:2',
        },
        {
          id: 'metric-3',
          type: 'database_read',
          severity: 'info',
          timestamp: {
            toDate: () => new Date(NOW - 30_000),
          },
          metadata: { count: 3 },
        },
      ],
    });

    expect(payload.stats.totalRequests).toBe(2);
    expect(payload.stats.totalErrors).toBe(1);
    expect(payload.stats.activeStores).toBe(2);
    expect(payload.recentActivity[1]?.timestamp).toBe(NOW - 20_000);
    expect(payload.recentActivity[2]?.timestamp).toBe(NOW - 30_000);
    expect(payload.health.status).toBe('critical');
  });
});
