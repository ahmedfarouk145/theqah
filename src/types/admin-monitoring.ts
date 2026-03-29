export type MonitoringAlertType = 'error' | 'warning' | 'info';

export type MonitoringHealthStatus = 'healthy' | 'warning' | 'critical';

export interface AdminMonitoringSummary {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
}

export interface AdminMonitoringEndpointStats {
  endpoint: string;
  count: number;
  errors: number;
  avgDuration: number;
  p95Duration: number;
}

export interface AdminMonitoringAlert {
  type: MonitoringAlertType;
  message: string;
  timestamp: number;
}

export interface AdminMonitoringActivity {
  id: string;
  type: string;
  endpoint?: string;
  timestamp: number;
  severity?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  storeUid?: string;
}

export interface AdminMonitoringHealth {
  status: MonitoringHealthStatus;
  message: string;
}

export interface AdminMonitoringRealtimePayload {
  requestsPerMinute: Record<string, number>;
  recentActivity: AdminMonitoringActivity[];
  activeEndpoints: string[];
  health: AdminMonitoringHealth;
}

export interface AdminMonitoringAppResponse {
  ok: true;
  period: string;
  timestamp: number;
  summary: AdminMonitoringSummary;
  topEndpoints: AdminMonitoringEndpointStats[];
  alerts: AdminMonitoringAlert[];
  performance: {
    avgResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    slowestEndpoint: string;
  };
  endpoints: AdminMonitoringEndpointStats[];
  stores: {
    total: number;
    byPlan: Record<string, number>;
    activeToday: number;
  };
  reviews: {
    total: number;
    verified: number;
    verificationRate: string;
  };
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    totalFetched: number;
  };
}

export interface AdminMonitoringRealtimeResponse extends AdminMonitoringRealtimePayload {
  ok: true;
  timestamp: number;
  window: string;
  stats: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    activeEndpoints: number;
    activeStores: number;
    avgRequestsPerMinute: number;
  };
  activity: AdminMonitoringActivity[];
  pagination: {
    page: number;
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
    totalFetched: number;
  };
}
