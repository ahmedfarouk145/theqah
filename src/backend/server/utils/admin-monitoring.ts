import type {
  AdminMonitoringActivity,
  AdminMonitoringAlert,
  AdminMonitoringEndpointStats,
  AdminMonitoringHealth,
  AdminMonitoringRealtimePayload,
  AdminMonitoringSummary,
} from '@/types/admin-monitoring';

export interface MonitoringMetricRecord {
  id?: string;
  type?: string;
  severity?: string;
  endpoint?: string;
  timestamp?: number | Date | { toDate?: () => Date } | null;
  duration?: number;
  statusCode?: number;
  error?: string;
  storeUid?: string;
  method?: string;
  metadata?: {
    count?: number;
    event?: string;
  } | null;
}

export function getMetricTimestampMs(
  value: MonitoringMetricRecord['timestamp'],
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().getTime();
  }

  return undefined;
}

type AlertSeed = {
  severity: 'critical' | 'warning' | 'info';
  message: string;
};

function toAlertType(severity: AlertSeed['severity']): AdminMonitoringAlert['type'] {
  if (severity === 'critical') {
    return 'error';
  }

  return severity;
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );

  return sorted[index] ?? 0;
}

export function buildMonitoringSummary(
  apiCalls: MonitoringMetricRecord[],
  errors: MonitoringMetricRecord[],
): AdminMonitoringSummary {
  const durations = apiCalls
    .map((call) => call.duration)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const totalRequests = apiCalls.length;
  const totalErrors = errors.length;
  const avgResponseTime = durations.length
    ? Math.round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length)
    : 0;

  return {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
    avgResponseTime,
    p95ResponseTime: percentile(durations, 0.95),
  };
}

export function buildTopEndpoints(
  apiCalls: MonitoringMetricRecord[],
): AdminMonitoringEndpointStats[] {
  const grouped = new Map<
    string,
    {
      count: number;
      errors: number;
      durations: number[];
    }
  >();

  for (const call of apiCalls) {
    const endpoint = call.endpoint || 'unknown';
    const bucket = grouped.get(endpoint) || { count: 0, errors: 0, durations: [] };

    bucket.count += 1;
    if (typeof call.statusCode === 'number' && call.statusCode >= 400) {
      bucket.errors += 1;
    }
    if (typeof call.duration === 'number' && Number.isFinite(call.duration)) {
      bucket.durations.push(call.duration);
    }

    grouped.set(endpoint, bucket);
  }

  return Array.from(grouped.entries())
    .map(([endpoint, stats]) => ({
      endpoint,
      count: stats.count,
      errors: stats.errors,
      avgDuration: stats.durations.length
        ? Math.round(
            stats.durations.reduce((sum, duration) => sum + duration, 0) / stats.durations.length,
          )
        : 0,
      p95Duration: percentile(stats.durations, 0.95),
    }))
    .sort((left, right) => right.count - left.count);
}

export function buildMonitoringAlerts(params: {
  errorRate: number;
  totalErrors: number;
  totalRequests: number;
  topEndpoints: AdminMonitoringEndpointStats[];
  dailyReadEstimate: number;
  dailyWriteEstimate: number;
  now: number;
}): AdminMonitoringAlert[] {
  const alerts: AlertSeed[] = [];

  if (params.errorRate > 5) {
    alerts.push({
      severity: params.errorRate > 10 ? 'critical' : 'warning',
      message: `معدل الأخطاء مرتفع: ${params.errorRate.toFixed(1)}% (${params.totalErrors}/${params.totalRequests})`,
    });
  }

  for (const endpoint of params.topEndpoints) {
    if (endpoint.avgDuration > 2000) {
      alerts.push({
        severity: endpoint.avgDuration > 5000 ? 'warning' : 'info',
        message: `${endpoint.endpoint}: متوسط الاستجابة ${endpoint.avgDuration}ms`,
      });
    }
  }

  if (params.dailyReadEstimate > 45000) {
    alerts.push({
      severity: params.dailyReadEstimate > 50000 ? 'critical' : 'warning',
      message: `القراءات اليومية التقديرية مرتفعة: ${Math.round(params.dailyReadEstimate)} / 50000`,
    });
  }

  if (params.dailyWriteEstimate > 18000) {
    alerts.push({
      severity: params.dailyWriteEstimate > 20000 ? 'critical' : 'warning',
      message: `الكتابات اليومية التقديرية مرتفعة: ${Math.round(params.dailyWriteEstimate)} / 20000`,
    });
  }

  const severityOrder: Record<AlertSeed['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return alerts
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
    .map((alert) => ({
      type: toAlertType(alert.severity),
      message: alert.message,
      timestamp: params.now,
    }));
}

export function buildMonitoringRealtimePayload(params: {
  metrics: MonitoringMetricRecord[];
  now: number;
}): AdminMonitoringRealtimePayload & {
  stats: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    activeEndpoints: number;
    activeStores: number;
    avgRequestsPerMinute: number;
  };
  activity: AdminMonitoringActivity[];
} {
  const apiCalls = params.metrics.filter((metric) => metric.type === 'api_call');
  const errors = params.metrics.filter(
    (metric) => metric.severity === 'error' || metric.severity === 'critical',
  );
  const activeEndpoints = Array.from(
    new Set(apiCalls.map((metric) => metric.endpoint).filter((endpoint): endpoint is string => Boolean(endpoint))),
  );
  const activeStores = new Set(
    params.metrics
      .map((metric) => metric.storeUid)
      .filter((storeUid): storeUid is string => Boolean(storeUid)),
  ).size;

  const minuteBuckets: Record<string, number> = {};
  for (const call of apiCalls) {
    const timestamp = getMetricTimestampMs(call.timestamp) ?? params.now;
    const minuteKey = String(Math.floor(timestamp / 60000));
    minuteBuckets[minuteKey] = (minuteBuckets[minuteKey] || 0) + 1;
  }

  const requestsPerMinuteValues = Object.values(minuteBuckets);
  const avgRequestsPerMinute = requestsPerMinuteValues.length
    ? Math.round(
        requestsPerMinuteValues.reduce((sum, value) => sum + value, 0) /
          requestsPerMinuteValues.length,
      )
    : 0;

  const summary = buildMonitoringSummary(apiCalls, errors);
  const health = buildMonitoringHealth(summary, errors.length);
  const recentActivity = params.metrics.slice(0, 50).map((metric, index) =>
    buildMonitoringActivity(metric, index, params.now),
  );

  return {
    requestsPerMinute: minuteBuckets,
    recentActivity,
    activeEndpoints,
    health,
    stats: {
      totalRequests: summary.totalRequests,
      totalErrors: summary.totalErrors,
      errorRate: summary.errorRate,
      activeEndpoints: activeEndpoints.length,
      activeStores,
      avgRequestsPerMinute,
    },
    activity: recentActivity,
  };
}

function buildMonitoringHealth(
  summary: AdminMonitoringSummary,
  totalErrors: number,
): AdminMonitoringHealth {
  if (summary.totalRequests === 0) {
    return {
      status: 'warning',
      message: 'لا يوجد نشاط خلال آخر خمس دقائق.',
    };
  }

  if (summary.errorRate >= 10 || totalErrors >= 10) {
    return {
      status: 'critical',
      message: 'معدل الأخطاء مرتفع ويحتاج إلى تدخل فوري.',
    };
  }

  if (summary.errorRate >= 5 || totalErrors > 0) {
    return {
      status: 'warning',
      message: 'هناك أخطاء حديثة تستدعي المراجعة.',
    };
  }

  return {
    status: 'healthy',
    message: 'النظام يعمل بشكل طبيعي.',
  };
}

function buildMonitoringActivity(
  metric: MonitoringMetricRecord,
  index: number,
  fallbackTimestamp: number,
): AdminMonitoringActivity {
  return {
    id: metric.id || `${metric.type || 'metric'}-${index}`,
    type: metric.type || 'unknown',
    endpoint: metric.endpoint,
    timestamp: getMetricTimestampMs(metric.timestamp) ?? fallbackTimestamp,
    severity: metric.severity,
    method: metric.method,
    statusCode: metric.statusCode,
    duration: metric.duration,
    error: metric.error,
    storeUid: metric.storeUid,
  };
}
