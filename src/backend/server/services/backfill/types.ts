/**
 * Backfill job — one row per (storeUid, attempt) in the `backfill_jobs`
 * Firestore collection. Webhooks enqueue; cron worker claims and runs.
 *
 * Cursor semantics:
 *   - Salla: { type: 'salla'; page: number }   — last fully-processed page
 *   - Zid:   { type: 'zid';   page: number }   — last fully-processed page
 *
 * Idempotency: review docs are keyed by platform-deterministic IDs
 * (already established in webhook + sync services), so re-running a
 * page is safe.
 */
export type BackfillJobStatus =
    | 'pending'
    | 'running'
    | 'complete'
    | 'failed';

export type BackfillCursor =
    | { type: 'salla'; page: number }
    | { type: 'zid'; page: number };

export interface BackfillJob {
    /** Doc ID is `${platform}_${storeUid_sanitized}_${createdAt}` */
    jobId: string;
    storeUid: string;
    platform: 'salla' | 'zid';
    status: BackfillJobStatus;
    cursor: BackfillCursor | null;
    written: number;
    skipped: number;
    errors: Array<{ at: number; message: string; page?: number }>;
    /** Worker lock — claim only if Date.now() > lockedUntil */
    lockedUntil: number;
    createdAt: number;
    startedAt: number | null;
    finishedAt: number | null;
    source: 'webhook' | 'admin-bulk' | 'manual';
}

export const BACKFILL_LOCK_MS = 10 * 60 * 1000;
export const BACKFILL_MAX_PAGES = 500;
export const BACKFILL_PAGE_SIZE = 50;
