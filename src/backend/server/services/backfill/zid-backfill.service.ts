/**
 * ZidBackfillService — drives an all-time historical Zid review pull
 * for one store. Resumes from `job.cursor.page` if set, checkpoints
 * after every page so a crash costs at most one page of work.
 *
 * The actual review fetching and dedup are delegated to
 * ZidReviewSyncService — this service only handles credential
 * resolution and job-state bookkeeping.
 *
 * @module server/services/backfill/zid-backfill.service
 */

import { ZidReviewSyncService } from '@/server/services/zid-review-sync.service';
import { ZidTokenService } from '@/server/services/zid-token.service';
import { ZidStoreRepository } from '@/server/repositories/zid-store.repository';
import { BackfillJobService } from './backfill-job.service';
import { BACKFILL_MAX_PAGES } from './types';
import type { BackfillJob } from './types';
import { log } from '@/lib/logger';

export class ZidBackfillService {
    private readonly syncService: ZidReviewSyncService;
    private readonly tokenService: ZidTokenService;
    private readonly storeRepo: ZidStoreRepository;

    constructor(
        private readonly jobService: BackfillJobService,
        deps?: {
            syncService?: ZidReviewSyncService;
            tokenService?: ZidTokenService;
            storeRepo?: ZidStoreRepository;
        },
    ) {
        this.syncService = deps?.syncService ?? new ZidReviewSyncService();
        this.tokenService = deps?.tokenService ?? ZidTokenService.getInstance();
        this.storeRepo = deps?.storeRepo ?? new ZidStoreRepository();
    }

    async run(job: BackfillJob): Promise<void> {
        const storeUid = job.storeUid;

        const store = await this.storeRepo.findById(storeUid);
        if (!store) {
            await this.jobService.fail(job.jobId, `Store ${storeUid} not found`);
            return;
        }

        const storeData = store as unknown as {
            zid?: { storeId?: string };
            subscription?: { startedAt?: number };
        };
        const zidStoreId = storeData.zid?.storeId;
        if (!zidStoreId) {
            await this.jobService.fail(job.jobId, `Store ${storeUid} has no zid.storeId`);
            return;
        }

        const tokens = await this.tokenService.getValidTokens(zidStoreId);
        if (!tokens) {
            await this.jobService.fail(job.jobId, `No valid Zid tokens for ${zidStoreId}`);
            return;
        }

        const startPage = job.cursor?.type === 'zid' ? job.cursor.page + 1 : 1;
        let totalWritten = job.written;
        let totalSkipped = job.skipped;

        try {
            const result = await this.syncService.syncReviewsForStore(
                storeUid,
                zidStoreId,
                tokens,
                {
                    unbounded: true,
                    maxPages: BACKFILL_MAX_PAGES,
                    startPage,
                    trustPlatformStatus: true,
                    subscriptionStart: storeData.subscription?.startedAt,
                    onPageComplete: async (page, pageStats) => {
                        totalWritten += pageStats.synced;
                        totalSkipped += pageStats.skipped;
                        await this.jobService.updateProgress(job.jobId, {
                            cursor: { type: 'zid', page },
                            written: totalWritten,
                            skipped: totalSkipped,
                        });
                    },
                },
            );

            // Reconcile in case onPageComplete was bypassed on an early break.
            const finalWritten = job.written + result.synced;
            const finalSkipped = job.skipped + result.skipped;

            await this.jobService.complete(job.jobId, {
                written: finalWritten,
                skipped: finalSkipped,
            });
            log(
                'info',
                `[ZID_BACKFILL] Done ${storeUid}: written=${finalWritten} skipped=${finalSkipped}`,
                { scope: 'backfill' },
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            await this.jobService.fail(job.jobId, msg);
        }
    }
}
