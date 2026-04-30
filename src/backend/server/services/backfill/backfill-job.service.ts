/**
 * BackfillJobService — Firestore-backed job queue for historical
 * review backfills. Webhooks enqueue, the cron worker claims, runs,
 * and finalizes. Idempotent: a duplicate webhook for the same
 * (storeUid, platform) returns the existing pending/running job.
 *
 * @module server/services/backfill/backfill-job.service
 */

import type {
    BackfillJob,
    BackfillJobStatus,
    BackfillCursor,
} from './types';
import { BACKFILL_LOCK_MS } from './types';

const COLLECTION = 'backfill_jobs';

export class BackfillJobService {
    constructor(private readonly db: FirebaseFirestore.Firestore) { }

    /**
     * Enqueue a backfill job. If a pending or running (lock-valid) job
     * for the same (storeUid, platform) already exists, returns that
     * job instead of creating a duplicate. Subscription webhooks can
     * fire multiple times for one activation; this prevents fanout.
     */
    async enqueue(params: {
        storeUid: string;
        platform: 'salla' | 'zid';
        source: BackfillJob['source'];
    }): Promise<BackfillJob> {
        const existing = await this.findActiveJob(params.storeUid, params.platform);
        if (existing) return existing;

        const now = Date.now();
        const safeUid = params.storeUid.replace(/[:/\\]/g, '_');
        const jobId = `${params.platform}_${safeUid}_${now}`;
        const job: BackfillJob = {
            jobId,
            storeUid: params.storeUid,
            platform: params.platform,
            status: 'pending',
            cursor: null,
            written: 0,
            skipped: 0,
            errors: [],
            lockedUntil: 0,
            createdAt: now,
            startedAt: null,
            finishedAt: null,
            source: params.source,
        };
        await this.db.collection(COLLECTION).doc(jobId).set(job);
        return job;
    }

    /** Active = pending OR (running AND lock not expired). */
    private async findActiveJob(
        storeUid: string,
        platform: 'salla' | 'zid',
    ): Promise<BackfillJob | null> {
        const snap = await this.db.collection(COLLECTION)
            .where('storeUid', '==', storeUid)
            .where('platform', '==', platform)
            .get();

        const now = Date.now();
        for (const doc of snap.docs) {
            const data = doc.data() as BackfillJob;
            if (data.status === 'pending') return data;
            if (data.status === 'running' && data.lockedUntil > now) return data;
        }
        return null;
    }

    /**
     * Claim the next available job. "Available" = pending, OR running
     * with an expired lock (worker crashed). Returns null if none.
     *
     * NOTE: We deliberately skip `orderBy('createdAt')` to avoid a
     * Firestore composite index requirement on (status, createdAt).
     * Backfill ordering doesn't matter for correctness — every job is
     * idempotent and a strict FIFO would only be a "fairness" nicety.
     * If you want fairness later, sort the candidate set in memory.
     */
    async claimNext(): Promise<BackfillJob | null> {
        const now = Date.now();
        const snap = await this.db.collection(COLLECTION)
            .where('status', 'in', ['pending', 'running'])
            .limit(10)
            .get();

        for (const doc of snap.docs) {
            const data = doc.data() as BackfillJob;
            if (data.status === 'running' && data.lockedUntil > now) continue;

            try {
                await this.db.collection(COLLECTION).doc(doc.id).update({
                    status: 'running',
                    lockedUntil: now + BACKFILL_LOCK_MS,
                    startedAt: data.startedAt || now,
                });
                return {
                    ...data,
                    status: 'running',
                    lockedUntil: now + BACKFILL_LOCK_MS,
                    startedAt: data.startedAt || now,
                };
            } catch {
                continue;
            }
        }
        return null;
    }

    /** Mid-run progress write — extends the lock and saves cursor. */
    async updateProgress(jobId: string, patch: {
        cursor?: BackfillCursor | null;
        written?: number;
        skipped?: number;
        appendError?: { message: string; page?: number };
    }): Promise<void> {
        const now = Date.now();
        const updates: Record<string, unknown> = {
            lockedUntil: now + BACKFILL_LOCK_MS,
        };
        if (patch.cursor !== undefined) updates.cursor = patch.cursor;
        if (patch.written !== undefined) updates.written = patch.written;
        if (patch.skipped !== undefined) updates.skipped = patch.skipped;

        if (patch.appendError) {
            const ref = this.db.collection(COLLECTION).doc(jobId);
            const cur = (await ref.get()).data() as BackfillJob | undefined;
            const errors = cur?.errors ?? [];
            errors.push({ at: now, ...patch.appendError });
            updates.errors = errors;
        }

        await this.db.collection(COLLECTION).doc(jobId).update(updates);
    }

    async complete(
        jobId: string,
        finalCounts: { written: number; skipped: number },
    ): Promise<void> {
        const status: BackfillJobStatus = 'complete';
        await this.db.collection(COLLECTION).doc(jobId).update({
            status,
            written: finalCounts.written,
            skipped: finalCounts.skipped,
            finishedAt: Date.now(),
            lockedUntil: 0,
        });
    }

    async fail(jobId: string, message: string): Promise<void> {
        const ref = this.db.collection(COLLECTION).doc(jobId);
        const cur = (await ref.get()).data() as BackfillJob | undefined;
        const errors = cur?.errors ?? [];
        errors.push({ at: Date.now(), message });
        const status: BackfillJobStatus = 'failed';
        await ref.update({
            status,
            errors,
            finishedAt: Date.now(),
            lockedUntil: 0,
        });
    }
}
