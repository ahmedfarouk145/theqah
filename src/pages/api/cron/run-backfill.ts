// src/pages/api/cron/run-backfill.ts
//
// Cron worker for the historical-review backfill queue. Runs every
// 5 minutes (see vercel.json), claims up to JOBS_PER_TICK pending
// jobs, and dispatches each to its platform-specific service.
//
// Idempotency contract:
//   - Each backfill review doc has a deterministic ID, so re-running
//     a page is a no-op for already-written rows.
//   - Per-page cursor is checkpointed via BackfillJobService.
//   - If the function times out mid-run, the lock expires (10 min)
//     and the next tick picks the job back up from the saved cursor.

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { BackfillJobService } from '@/server/services/backfill/backfill-job.service';
import { ZidBackfillService } from '@/server/services/backfill/zid-backfill.service';
import {
    SallaBackfillService,
    fetchSallaReviewsPage,
} from '@/server/services/backfill/salla-backfill.service';
import { SallaTokenService } from '@/server/services/salla-token.service';
import { RepositoryFactory } from '@/server/repositories';
import { BACKFILL_MAX_PAGES } from '@/server/services/backfill/types';

const JOBS_PER_TICK = 3;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = dbAdmin();
    const jobService = new BackfillJobService(db);
    const reviewRepo = RepositoryFactory.getReviewRepository();
    const storeRepo = RepositoryFactory.getStoreRepository();

    const processed: Array<{ jobId: string; storeUid: string; outcome: string }> = [];

    for (let i = 0; i < JOBS_PER_TICK; i++) {
        const job = await jobService.claimNext();
        if (!job) break;

        try {
            if (job.platform === 'zid') {
                const svc = new ZidBackfillService(jobService);
                await svc.run(job);
                processed.push({ jobId: job.jobId, storeUid: job.storeUid, outcome: 'zid_ran' });
                continue;
            }

            // Salla path
            const merchantId = job.storeUid.startsWith('salla:')
                ? job.storeUid.slice('salla:'.length)
                : job.storeUid;

            const sallaTokenService = SallaTokenService.getInstance();
            const svc = new SallaBackfillService({
                fetchPage: fetchSallaReviewsPage,
                // Use the auto-refreshing token service so stores with an
                // expired access_token but a valid refresh_token still work.
                // Stores without a refresh_token will return null here and
                // the backfill service will fail the job with a clear error.
                getAccessToken: (storeUid) => sallaTokenService.getValidAccessToken(storeUid),
                getReviewByOrderAndProduct: async (orderId, productId) => {
                    const r = await reviewRepo.findByOrderAndProduct(orderId, productId);
                    return r ? { reviewId: r.reviewId } : null;
                },
                writeReview: async (id, doc) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await reviewRepo.createWithId(id, doc as any);
                },
                getStoreSubscriptionStart: async (storeUid) => {
                    const start = await storeRepo.getSubscriptionStartDate(storeUid);
                    return start ?? 0;
                },
            });

            const startPage = job.cursor?.type === 'salla' ? job.cursor.page + 1 : 1;
            let writtenSoFar = job.written;
            let skippedSoFar = job.skipped;

            const result = await svc.runOnce({
                storeUid: job.storeUid,
                merchantId,
                startPage,
                maxPages: BACKFILL_MAX_PAGES,
                onPageComplete: async (page, stats) => {
                    writtenSoFar += stats.written;
                    skippedSoFar += stats.skipped;
                    await jobService.updateProgress(job.jobId, {
                        cursor: { type: 'salla', page },
                        written: writtenSoFar,
                        skipped: skippedSoFar,
                    });
                },
            });

            if (result.reachedEnd) {
                // Stash the skip-reason histogram on the job (via errors[])
                // so /status surfaces *why* reviews were skipped instead of
                // hiding the breakdown. Keeps using the existing field — no
                // schema change.
                await jobService.updateProgress(job.jobId, {
                    appendError: {
                        message: `skipReasons=${JSON.stringify(result.skipReasons)}`,
                    },
                });
                await jobService.complete(job.jobId, {
                    written: writtenSoFar,
                    skipped: skippedSoFar,
                });
                processed.push({ jobId: job.jobId, storeUid: job.storeUid, outcome: 'salla_complete' });
            } else {
                // Hit the page cap mid-run; next tick resumes from cursor.
                await jobService.updateProgress(job.jobId, {
                    cursor: { type: 'salla', page: result.lastPage },
                });
                processed.push({ jobId: job.jobId, storeUid: job.storeUid, outcome: 'salla_paused' });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await jobService.fail(job.jobId, msg);
            processed.push({ jobId: job.jobId, storeUid: job.storeUid, outcome: `failed: ${msg}` });
        }
    }

    return res.status(200).json({ ok: true, processed });
}
