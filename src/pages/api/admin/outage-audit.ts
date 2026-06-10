// src/pages/api/admin/outage-audit.ts
//
// Post-outage damage report: one call returns everything that may have been
// dropped while Firestore was unavailable (e.g. the 2026-06 billing-quota
// outage) so it can be re-driven through the existing retry machinery.
//
// Surfaces, for a given time window:
//   - webhook_errors        → Salla/Zid events whose processing threw
//   - webhook_dead_letter   → events that exhausted all retry attempts
//   - webhook_retry_queue   → events still waiting to be retried
//   - webhooks_salla        → idempotency docs stuck in statusFlag="failed"
//   - reviews               → created in the window, grouped by status
//
// Usage:
//   GET /api/admin/outage-audit?sinceHours=48
//   Authorization: Bearer <CRON_SECRET>
//
// Read-only. To re-process findings use the existing tools:
//   - POST /api/webhooks/retry (admin session) for DLQ entries
//   - GET  /api/cron/webhook-retry (CRON_SECRET) to drain the retry queue

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';

const MAX_WINDOW_HOURS = 24 * 30; // 30 days
const SAMPLE_LIMIT = 200;

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

function truncate(s: unknown, n = 300): string {
    const str = typeof s === 'string' ? s : s == null ? '' : String(s);
    return str.length > n ? str.slice(0, n) + '…' : str;
}

type SectionResult = {
    count: number;
    sample: Record<string, unknown>[];
    error?: string;
};

async function section(
    fn: () => Promise<{ count: number; sample: Record<string, unknown>[] }>
): Promise<SectionResult> {
    try {
        return await fn();
    } catch (e) {
        return { count: -1, sample: [], error: truncate(e instanceof Error ? e.message : e) };
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const auth = extractBearerToken(req.headers.authorization);
    if (!auth || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const sinceHours = Math.min(
        MAX_WINDOW_HOURS,
        Math.max(1, Number(req.query.sinceHours) || 48)
    );
    const until = Number(req.query.until) || Date.now();
    const since = Number(req.query.since) || until - sinceHours * 60 * 60 * 1000;

    const db = dbAdmin();

    const [webhookErrors, deadLetter, retryQueue, failedIdempotency, reviewsInWindow] =
        await Promise.all([
            // Events whose processing threw inside the webhook handler.
            section(async () => {
                const snap = await db
                    .collection('webhook_errors')
                    .where('at', '>=', since)
                    .where('at', '<=', until)
                    .orderBy('at', 'desc')
                    .limit(SAMPLE_LIMIT)
                    .get();
                return {
                    count: snap.size,
                    sample: snap.docs.map((d) => {
                        const v = d.data();
                        return {
                            id: d.id,
                            at: v.at,
                            atISO: v.at ? new Date(v.at).toISOString() : null,
                            event: v.event,
                            orderId: v.orderId,
                            merchantId: v.merchantId,
                            error: truncate(v.error),
                        };
                    }),
                };
            }),

            // Events that exhausted retries and need manual review.
            section(async () => {
                const snap = await db
                    .collection('webhook_dead_letter')
                    .where('failedAt', '>=', since)
                    .where('failedAt', '<=', until)
                    .orderBy('failedAt', 'desc')
                    .limit(SAMPLE_LIMIT)
                    .get();
                return {
                    count: snap.size,
                    sample: snap.docs.map((d) => {
                        const v = d.data();
                        const lastErr = Array.isArray(v.errors) && v.errors.length
                            ? v.errors[v.errors.length - 1]?.error
                            : null;
                        return {
                            id: d.id,
                            event: v.event,
                            storeUid: v.storeUid,
                            orderId: v.orderId,
                            totalAttempts: v.totalAttempts,
                            failedAtISO: v.failedAt ? new Date(v.failedAt).toISOString() : null,
                            resolution: v.resolution ?? null,
                            lastError: truncate(lastErr),
                        };
                    }),
                };
            }),

            // Events still queued for retry (the cron drains these every 5 min).
            section(async () => {
                const snap = await db
                    .collection('webhook_retry_queue')
                    .where('createdAt', '>=', since)
                    .where('createdAt', '<=', until)
                    .orderBy('createdAt', 'desc')
                    .limit(SAMPLE_LIMIT)
                    .get();
                return {
                    count: snap.size,
                    sample: snap.docs.map((d) => {
                        const v = d.data();
                        return {
                            id: d.id,
                            event: v.event,
                            storeUid: v.storeUid,
                            orderId: v.orderId,
                            attempts: v.attempts,
                            nextRetryAtISO: v.nextRetryAt ? new Date(v.nextRetryAt).toISOString() : null,
                            lastError: truncate(v.lastError),
                        };
                    }),
                };
            }),

            // Idempotency docs stuck in "failed" — equality-only query (no
            // composite index), window filter applied in memory.
            section(async () => {
                const snap = await db
                    .collection('webhooks_salla')
                    .where('statusFlag', '==', 'failed')
                    .limit(500)
                    .get();
                const rows = snap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown>))
                    .filter((v) => {
                        const t = Number(v.processingFinishedAt) || 0;
                        return t >= since && t <= until;
                    });
                return {
                    count: rows.length,
                    sample: rows.slice(0, SAMPLE_LIMIT).map((v) => ({
                        id: v.id,
                        processingFinishedAtISO: v.processingFinishedAt
                            ? new Date(Number(v.processingFinishedAt)).toISOString()
                            : null,
                        lastError: truncate(v.lastError),
                    })),
                };
            }),

            // Reviews created in the window, grouped by status — a sudden gap
            // here (vs. a normal day) is the signature of dropped review events.
            section(async () => {
                const snap = await db
                    .collection('reviews')
                    .where('createdAt', '>=', since)
                    .where('createdAt', '<=', until)
                    .orderBy('createdAt', 'desc')
                    .limit(1000)
                    .get();
                const byStatus: Record<string, number> = {};
                const stuck: Record<string, unknown>[] = [];
                for (const d of snap.docs) {
                    const v = d.data();
                    const status = String(v.status || 'unknown');
                    byStatus[status] = (byStatus[status] || 0) + 1;
                    if (status === 'pending' || status === 'pending_review') {
                        stuck.push({
                            id: d.id,
                            storeUid: v.storeUid,
                            productId: v.productId,
                            stars: v.stars,
                            status,
                            createdAtISO: v.createdAt ? new Date(v.createdAt).toISOString() : null,
                        });
                    }
                }
                return {
                    count: snap.size,
                    sample: [{ byStatus }, ...stuck.slice(0, SAMPLE_LIMIT)],
                };
            }),
        ]);

    return res.status(200).json({
        ok: true,
        window: {
            sinceISO: new Date(since).toISOString(),
            untilISO: new Date(until).toISOString(),
            hours: Math.round((until - since) / 36e5),
        },
        webhookErrors,
        deadLetter,
        retryQueue,
        failedIdempotency,
        reviewsInWindow,
        howToRepair: {
            drainRetryQueue: 'GET /api/cron/webhook-retry with Authorization: Bearer <CRON_SECRET>',
            retryDLQEntry: 'POST /api/webhooks/retry (admin session) with { dlqId }',
            backfillReviewIds: 'GET /api/cron/backfill-review-ids with Authorization: Bearer <CRON_SECRET>',
        },
    });
}
