// src/pages/api/admin/backfill/status.ts
//
// Read-only inspection endpoint for the backfill queue. Returns
// counts by status plus per-job detail (most recent first). Use to
// verify a bulk enqueue made it through and to triage failed jobs.

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import type { BackfillJob, BackfillJobStatus } from '@/server/services/backfill/types';

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    // Tolerate multi-space / wrapped-paste artifacts: match "Bearer "
    // followed by any whitespace, then capture the non-whitespace token.
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token || token !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const db = dbAdmin();
        const snap = await db.collection('backfill_jobs').get();

        const counts: Record<BackfillJobStatus, number> = {
            pending: 0, running: 0, complete: 0, failed: 0,
        };
        // Per-status totals so we can see if Salla backfills actually wrote
        // anything (vs all 0s = stale tokens / wrong endpoint / no reviews).
        const totals = { written: 0, skipped: 0 };
        const failed: Array<{ storeUid: string; firstError?: string }> = [];
        const recent: Array<{ storeUid: string; status: BackfillJobStatus; written: number; skipped: number; cursor: BackfillJob['cursor']; lastError?: string }> = [];
        // Aggregated skip-reason histogram across every completed Salla job
        // — quick way to see if the whole batch is being skipped for the
        // same reason (e.g. all `no_product_id` ⇒ expanded= didn't help).
        const aggregateSkipReasons: Record<string, number> = {};

        for (const doc of snap.docs) {
            const j = doc.data() as BackfillJob;
            counts[j.status] = (counts[j.status] ?? 0) + 1;
            totals.written += j.written || 0;
            totals.skipped += j.skipped || 0;
            if (j.status === 'failed') {
                failed.push({
                    storeUid: j.storeUid,
                    firstError: j.errors?.[0]?.message?.slice(0, 200),
                });
            }
            // Pick the most recent error message (skipReasons string for
            // completed jobs, real error for failed jobs).
            const lastError = j.errors?.[j.errors.length - 1]?.message?.slice(0, 300);
            recent.push({
                storeUid: j.storeUid,
                status: j.status,
                written: j.written || 0,
                skipped: j.skipped || 0,
                cursor: j.cursor,
                lastError,
            });

            // Parse skipReasons={...} from completed jobs and aggregate.
            if (j.status === 'complete' && j.errors?.length) {
                for (const e of j.errors) {
                    const m = e.message?.match(/^skipReasons=(\{.*\})$/);
                    if (!m) continue;
                    try {
                        const reasons = JSON.parse(m[1]) as Record<string, number>;
                        for (const [k, v] of Object.entries(reasons)) {
                            aggregateSkipReasons[k] = (aggregateSkipReasons[k] ?? 0) + (v || 0);
                        }
                    } catch { /* ignore parse errors */ }
                }
            }
        }

        // Detail flag — only return the heavy `recent` list when asked.
        const detail = req.query.detail === '1';

        return res.status(200).json({
            counts,
            totals,
            aggregateSkipReasons,
            failed: failed.slice(0, 30),
            ...(detail ? { recent } : {}),
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BACKFILL_STATUS] error:', err);
        return res.status(500).json({ error: 'status_failed', message: msg });
    }
}
