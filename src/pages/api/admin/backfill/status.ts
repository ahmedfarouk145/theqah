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

    const db = dbAdmin();
    const snap = await db.collection('backfill_jobs').get();

    const counts: Record<BackfillJobStatus, number> = {
        pending: 0,
        running: 0,
        complete: 0,
        failed: 0,
    };
    const jobs: Array<Pick<
        BackfillJob,
        'jobId' | 'storeUid' | 'platform' | 'status' | 'written' | 'skipped'
        | 'errors' | 'cursor' | 'createdAt' | 'finishedAt' | 'source'
    >> = [];

    for (const doc of snap.docs) {
        const j = doc.data() as BackfillJob;
        counts[j.status] = (counts[j.status] ?? 0) + 1;
        jobs.push({
            jobId: j.jobId,
            storeUid: j.storeUid,
            platform: j.platform,
            status: j.status,
            written: j.written,
            skipped: j.skipped,
            errors: j.errors,
            cursor: j.cursor,
            createdAt: j.createdAt,
            finishedAt: j.finishedAt,
            source: j.source,
        });
    }

    jobs.sort((a, b) => b.createdAt - a.createdAt);

    return res.status(200).json({ counts, jobs });
}
