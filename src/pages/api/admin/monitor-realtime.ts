import type { NextApiRequest, NextApiResponse } from 'next';
import { LIMITS } from '@/config/constants';
import { dbAdmin } from '@/lib/firebaseAdmin';
import {
  buildMonitoringRealtimePayload,
  getMetricTimestampMs,
  type MonitoringMetricRecord,
} from '@/server/utils/admin-monitoring';
import type { AdminMonitoringRealtimeResponse } from '@/types/admin-monitoring';
import { verifyAdmin } from '@/utils/verifyAdmin';

export const config = { api: { bodyParser: true } };

async function fetchRealtimeMetrics(params: {
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
  res: NextApiResponse<AdminMonitoringRealtimeResponse | { error: string; message?: string }>,
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await verifyAdmin(req);

    const db = dbAdmin();
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const limit = Math.min(
      LIMITS.METRICS_QUERY_LIMIT,
      Math.max(1, parseInt(String(req.query.limit || '500'), 10)),
    );
    const page = parseInt(String(req.query.page || '1'), 10);

    const { docs, hasMore, nextCursor } = await fetchRealtimeMetrics({
      db,
      startTime: fiveMinutesAgo,
      limit,
      cursorId: page > 1 && typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
    });
    const metrics = docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as MonitoringMetricRecord,
    );
    const payload = buildMonitoringRealtimePayload({ metrics, now });

    return res.status(200).json({
      ok: true,
      timestamp: now,
      window: '5 minutes',
      requestsPerMinute: payload.requestsPerMinute,
      recentActivity: payload.recentActivity,
      activeEndpoints: payload.activeEndpoints,
      health: payload.health,
      stats: payload.stats,
      activity: payload.activity,
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
    console.error('[monitor-realtime] error:', err);

    if (err.message.startsWith('permission-denied')) {
      return res.status(403).json({ error: 'Forbidden', message: 'ليس لديك صلاحية' });
    }

    if (err.message.startsWith('unauthenticated')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'غير مصرح' });
    }

    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
