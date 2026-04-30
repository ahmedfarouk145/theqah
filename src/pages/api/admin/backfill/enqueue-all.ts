// src/pages/api/admin/backfill/enqueue-all.ts
//
// One-time admin endpoint: enqueue a backfill job for every currently-
// subscribed store (Salla + Zid). Auth via CRON_SECRET so it can be
// triggered from a curl one-liner without an admin login flow.
//
// Idempotent: stores with an existing pending or running job get the
// existing job back instead of a duplicate (BackfillJobService.enqueue).
//
// Mirrors the field-level merge pattern used by the sitemap and the
// zid review cron — legacy `stores` first, `zid_stores` layered on top.

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { BackfillJobService } from '@/server/services/backfill/backfill-job.service';

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token || token !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'POST only' });
    }

    const db = dbAdmin();
    const jobService = new BackfillJobService(db);

    const [legacySnap, zidSnap] = await Promise.all([
        db.collection('stores').get(),
        db.collection('zid_stores').get(),
    ]);

    type StoreFields = {
        plan?: { active?: unknown };
        salla?: { connected?: unknown };
        zid?: { connected?: unknown };
    };
    const merged = new Map<string, StoreFields>();
    for (const doc of legacySnap.docs) {
        merged.set(doc.id, doc.data() as StoreFields);
    }
    for (const doc of zidSnap.docs) {
        const prev = merged.get(doc.id) || {};
        const next = doc.data() as StoreFields;
        merged.set(doc.id, {
            ...prev,
            ...next,
            zid: { ...(prev.zid || {}), ...(next.zid || {}) },
            salla: { ...(prev.salla || {}), ...(next.salla || {}) },
        });
    }

    const enqueued: Array<{ storeUid: string; platform: 'salla' | 'zid'; jobId: string }> = [];
    const skipped: Array<{ storeUid: string; reason: string }> = [];

    for (const [storeUid, data] of merged) {
        if (data.plan?.active !== true) {
            skipped.push({ storeUid, reason: 'not subscribed' });
            continue;
        }

        let platform: 'salla' | 'zid' | null = null;
        if (storeUid.startsWith('salla:') || data.salla?.connected === true) platform = 'salla';
        else if (storeUid.startsWith('zid:') || data.zid?.connected === true) platform = 'zid';

        if (!platform) {
            skipped.push({ storeUid, reason: 'no platform' });
            continue;
        }

        try {
            const job = await jobService.enqueue({
                storeUid,
                platform,
                source: 'admin-bulk',
            });
            enqueued.push({ storeUid, platform, jobId: job.jobId });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            skipped.push({ storeUid, reason: `enqueue failed: ${msg}` });
        }
    }

    return res.status(200).json({
        ok: true,
        enqueued: enqueued.length,
        skipped: skipped.length,
        details: { enqueued, skipped },
    });
}
