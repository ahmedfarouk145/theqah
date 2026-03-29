import type { NextApiRequest, NextApiResponse } from 'next';
import { LIMITS } from '@/config/constants';
import { dbAdmin } from '@/lib/firebaseAdmin';
import {
  buildMonitoringAlerts,
  buildMonitoringSummary,
  buildTopEndpoints,
  getMetricTimestampMs,
  type MonitoringMetricRecord,
} from '@/server/utils/admin-monitoring';
import type { AdminMonitoringAppResponse } from '@/types/admin-monitoring';
import { verifyAdmin } from '@/utils/verifyAdmin';

export const config = { api: { bodyParser: true } };

async function fetchMetricsSince(params: {
  db: FirebaseFirestore.Firestore;
  startTime: number;
  limit: number;
  cursorId?: string;
}) {
  const { db, startTime, limit, cursorId } = params;
  const cursorDoc = cursorId
    ? await db.collection('metrics').doc(cursorId).get()
    : null;

  const buildQuery = (threshold: number | Date) => {
    let query = db
      .collection('metrics')
      .where('timestamp', '>=', threshold)
      .orderBy('timestamp', 'desc')
      .limit(limit);

    if (cursorDoc?.exists) {
      query = query.startAfter(cursorDoc);
    }

    return query;
  };

  const [numericSnap, dateSnap] = await Promise.all([
    buildQuery(startTime).get(),
    buildQuery(new Date(startTime)).get(),
  ]);

  const mergedDocs = Array.from(
    new Map(
      [...numericSnap.docs, ...dateSnap.docs].map((doc) => [doc.id, doc]),
    ).values(),
  ).sort((left, right) => {
    const leftTimestamp = getMetricTimestampMs(
      (left.data() as MonitoringMetricRecord).timestamp,
    ) || 0;
    const rightTimestamp = getMetricTimestampMs(
      (right.data() as MonitoringMetricRecord).timestamp,
    ) || 0;
    return rightTimestamp - leftTimestamp;
  });

  const docs = mergedDocs.slice(0, limit);
  const hasMore = numericSnap.docs.length === limit || dateSnap.docs.length === limit;
  const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

  return { docs, hasMore, nextCursor };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminMonitoringAppResponse | { error: string; message?: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req);

    const db = dbAdmin();
    const now = Date.now();
    const period =
      req.query.period === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : req.query.period === '30d'
          ? 30 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;

    const startTime = now - period;
    const page = parseInt(String(req.query.page || '1'), 10);
    const limit = Math.min(
      LIMITS.METRICS_QUERY_LIMIT,
      Math.max(1, parseInt(String(req.query.limit || String(LIMITS.METRICS_QUERY_LIMIT)), 10)),
    );
    const { docs, hasMore, nextCursor } = await fetchMetricsSince({
      db,
      startTime,
      limit,
      cursorId: page > 1 && typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    const metrics = docs.map((doc) => doc.data() as MonitoringMetricRecord);

    const apiCalls = metrics.filter((metric) => metric.type === 'api_call');
    const errors = metrics.filter(
      (metric) => metric.severity === 'error' || metric.severity === 'critical',
    );
    const dbReads = metrics.filter((metric) => metric.type === 'database_read');
    const dbWrites = metrics.filter((metric) => metric.type === 'database_write');

    const summary = buildMonitoringSummary(apiCalls, errors);
    const topEndpoints = buildTopEndpoints(apiCalls).slice(0, 20);

    const totalDbReads = dbReads.reduce((sum, metric) => {
      const count = metric.metadata?.count;
      return sum + (typeof count === 'number' ? count : 1);
    }, 0);

    const totalDbWrites = dbWrites.reduce((sum, metric) => {
      const count = metric.metadata?.count;
      return sum + (typeof count === 'number' ? count : 1);
    }, 0);

    const dailyReadEstimate = (totalDbReads / period) * (24 * 60 * 60 * 1000);
    const dailyWriteEstimate = (totalDbWrites / period) * (24 * 60 * 60 * 1000);

    const durations = apiCalls
      .map((metric) => metric.duration)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .sort((left, right) => left - right);
    const percentile = (ratio: number) =>
      durations.length === 0
        ? 0
        : durations[Math.min(durations.length - 1, Math.ceil(durations.length * ratio) - 1)] || 0;

    const storeDocs = await db
      .collection('stores')
      .select('storeUid', 'provider', 'salla', 'zid', 'subscription')
      .get();
    const storesByPlan: Record<string, number> = {};
    const activeStores = storeDocs.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const isAlias = typeof data.storeUid === 'string' && data.storeUid !== doc.id;
      const salla = (data.salla || {}) as Record<string, unknown>;
      const zid = (data.zid || {}) as Record<string, unknown>;
      return !isAlias && Boolean(salla.connected ?? zid.connected);
    });
    for (const doc of activeStores) {
      const plan = (doc.data()?.subscription?.planId as string | undefined) || 'free';
      storesByPlan[plan] = (storesByPlan[plan] || 0) + 1;
    }

    const recentReviewsSnap = await db.collection('reviews').where('createdAt', '>=', startTime).get();
    const totalReviews = recentReviewsSnap.size;
    const verifiedReviews = recentReviewsSnap.docs.filter((doc) => doc.data().verified === true).length;

    const alerts = buildMonitoringAlerts({
      errorRate: summary.errorRate,
      totalErrors: summary.totalErrors,
      totalRequests: summary.totalRequests,
      topEndpoints,
      dailyReadEstimate,
      dailyWriteEstimate,
      now,
    });

    return res.status(200).json({
      ok: true,
      period: String(req.query.period || '24h'),
      timestamp: now,
      summary,
      topEndpoints,
      alerts,
      performance: {
        avgResponseTime: summary.avgResponseTime,
        p50ResponseTime: percentile(0.5),
        p95ResponseTime: summary.p95ResponseTime,
        p99ResponseTime: percentile(0.99),
        slowestEndpoint: [...topEndpoints].sort((left, right) => right.avgDuration - left.avgDuration)[0]?.endpoint || 'none',
      },
      endpoints: topEndpoints,
      stores: {
        total: activeStores.length,
        byPlan: storesByPlan,
        activeToday: metrics.filter((metric) => metric.storeUid).length,
      },
      reviews: {
        total: totalReviews,
        verified: verifiedReviews,
        verificationRate: totalReviews > 0 ? `${((verifiedReviews / totalReviews) * 100).toFixed(1)}%` : '0%',
      },
      pagination: {
        page,
        limit,
        hasMore,
        nextCursor,
        totalFetched: metrics.length,
      },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[monitor-app] error:', err);

    if (err.message.startsWith('permission-denied')) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية' });
    }

    if (err.message.startsWith('unauthenticated')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'غير مصرح' });
    }

    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
