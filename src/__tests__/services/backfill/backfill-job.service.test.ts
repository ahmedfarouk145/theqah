import { describe, expect, it } from 'vitest';
import { BackfillJobService } from '@/backend/server/services/backfill/backfill-job.service';

/**
 * Tiny in-memory Firestore stand-in. Supports the fluent query subset
 * the service uses: collection().doc(), .set(), .update(), .get(),
 * .where().where(), .where().orderBy().limit().get().
 */
function makeMockDb() {
    const docs = new Map<string, Record<string, unknown>>();
    const keyOf = (col: string, id: string) => `${col}/${id}`;

    type QueryFilter = { field: string; op: string; value: unknown };

    const buildQuery = (col: string, filters: QueryFilter[] = []) => {
        const runQuery = () => {
            const out: Array<{ id: string; data: () => Record<string, unknown>; exists: boolean }> = [];
            for (const [k, v] of docs.entries()) {
                if (!k.startsWith(col + '/')) continue;
                let ok = true;
                for (const f of filters) {
                    const fv = (v as Record<string, unknown>)[f.field];
                    if (f.op === '==' && fv !== f.value) { ok = false; break; }
                    if (f.op === 'in' && !(Array.isArray(f.value) && (f.value as unknown[]).includes(fv))) {
                        ok = false; break;
                    }
                }
                if (ok) {
                    const id = k.slice(col.length + 1);
                    out.push({ id, data: () => v, exists: true });
                }
            }
            return { empty: out.length === 0, docs: out };
        };
        return {
            where: (field: string, op: string, value: unknown) =>
                buildQuery(col, [...filters, { field, op, value }]),
            orderBy: () => buildQuery(col, filters),
            limit: () => buildQuery(col, filters),
            get: async () => runQuery(),
        };
    };

    const collection = (col: string) => ({
        doc: (id: string) => ({
            id,
            get: async () => ({
                exists: docs.has(keyOf(col, id)),
                data: () => docs.get(keyOf(col, id)),
                id,
            }),
            set: async (data: Record<string, unknown>) => {
                docs.set(keyOf(col, id), { ...data });
            },
            update: async (patch: Record<string, unknown>) => {
                const cur = docs.get(keyOf(col, id)) || {};
                docs.set(keyOf(col, id), { ...cur, ...patch });
            },
        }),
        ...buildQuery(col),
    });

    return { collection, _docs: docs };
}

describe('BackfillJobService', () => {
    it('enqueue creates a pending job with cursor=null', async () => {
        const db = makeMockDb();
        const svc = new BackfillJobService(db as unknown as FirebaseFirestore.Firestore);

        const job = await svc.enqueue({
            storeUid: 'salla:123',
            platform: 'salla',
            source: 'webhook',
        });

        expect(job.status).toBe('pending');
        expect(job.cursor).toBeNull();
        expect(job.platform).toBe('salla');
        expect(job.storeUid).toBe('salla:123');
        expect(job.written).toBe(0);
    });

    it('enqueue is idempotent for an already-pending job', async () => {
        const db = makeMockDb();
        const svc = new BackfillJobService(db as unknown as FirebaseFirestore.Firestore);

        const first = await svc.enqueue({
            storeUid: 'salla:123',
            platform: 'salla',
            source: 'webhook',
        });
        const second = await svc.enqueue({
            storeUid: 'salla:123',
            platform: 'salla',
            source: 'webhook',
        });

        expect(second.jobId).toBe(first.jobId);
    });

    it('claimNext flips a pending job to running and sets a lock', async () => {
        const db = makeMockDb();
        const svc = new BackfillJobService(db as unknown as FirebaseFirestore.Firestore);

        await svc.enqueue({ storeUid: 'zid:1', platform: 'zid', source: 'webhook' });
        const claimed = await svc.claimNext();

        expect(claimed).not.toBeNull();
        expect(claimed!.status).toBe('running');
        expect(claimed!.lockedUntil).toBeGreaterThan(Date.now());
    });

    it('complete writes finalCounts and clears the lock', async () => {
        const db = makeMockDb();
        const svc = new BackfillJobService(db as unknown as FirebaseFirestore.Firestore);

        const job = await svc.enqueue({ storeUid: 'zid:1', platform: 'zid', source: 'webhook' });
        await svc.complete(job.jobId, { written: 42, skipped: 7 });

        const stored = db._docs.get(`backfill_jobs/${job.jobId}`) as Record<string, unknown>;
        expect(stored.status).toBe('complete');
        expect(stored.written).toBe(42);
        expect(stored.skipped).toBe(7);
        expect(stored.lockedUntil).toBe(0);
    });
});
