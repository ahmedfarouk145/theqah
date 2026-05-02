// src/pages/api/admin/backfill/probe-all.ts
//
// Cross-tabulates: every active store × what Salla reports vs what
// our DB has. Quickly answers "which stores are short and by how much".
//
// Output per store:
//   sallaTotal:    pagination.total from /admin/v2/reviews?type=rating
//   dbTotal:       count of reviews docs for storeUid
//   dbBackfill:    docs prefixed `salla_backfill_*`
//   dbRealtime:    docs prefixed `salla_<merchant>_order_*`
//   shortBy:       sallaTotal - dbTotal (negative = duplicates)

import type { NextApiRequest, NextApiResponse } from 'next';
import { dbAdmin } from '@/lib/firebaseAdmin';
import { SallaTokenService } from '@/server/services/salla-token.service';

function extractBearerToken(header: string | undefined): string {
    if (!header) return '';
    const m = header.trim().match(/^Bearer\s+(\S+)\s*$/);
    return m ? m[1] : '';
}

const SALLA_REVIEWS_API = 'https://api.salla.dev/admin/v2/reviews';

async function getSallaRatingTotal(accessToken: string): Promise<number | null> {
    const url = new URL(SALLA_REVIEWS_API);
    url.searchParams.set('page', '1');
    url.searchParams.set('per_page', '1');
    url.searchParams.set('type', 'rating');
    try {
        const r = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        });
        if (!r.ok) return null;
        const body = await r.json() as { pagination?: { total?: number } };
        return typeof body.pagination?.total === 'number' ? body.pagination.total : null;
    } catch {
        return null;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const auth = extractBearerToken(req.headers.authorization);
    if (!auth || auth !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = dbAdmin();
    const tokenService = SallaTokenService.getInstance();

    // Reuse the same merge logic as /enqueue-all to get the active store set.
    const [legacySnap, zidSnap] = await Promise.all([
        db.collection('stores').get(),
        db.collection('zid_stores').get(),
    ]);
    type StoreFields = { plan?: { active?: unknown }; salla?: { connected?: unknown }; zid?: { connected?: unknown } };
    const merged = new Map<string, StoreFields>();
    for (const doc of legacySnap.docs) merged.set(doc.id, doc.data() as StoreFields);
    for (const doc of zidSnap.docs) {
        const prev = merged.get(doc.id) || {};
        const next = doc.data() as StoreFields;
        merged.set(doc.id, {
            ...prev, ...next,
            zid: { ...(prev.zid || {}), ...(next.zid || {}) },
            salla: { ...(prev.salla || {}), ...(next.salla || {}) },
        });
    }

    const targets: Array<{ storeUid: string; platform: 'salla' | 'zid' }> = [];
    for (const [uid, data] of merged) {
        if (data.plan?.active !== true) continue;
        if (uid.startsWith('salla:') || data.salla?.connected === true) targets.push({ storeUid: uid, platform: 'salla' });
        else if (uid.startsWith('zid:') || data.zid?.connected === true) targets.push({ storeUid: uid, platform: 'zid' });
    }

    const rows: Array<Record<string, unknown>> = [];

    for (const t of targets) {
        const collection = t.platform === 'zid' ? 'zid_reviews' : 'reviews';
        const dbSnap = await db.collection(collection)
            .where('storeUid', '==', t.storeUid)
            .select('source')
            .get();
        let dbBackfill = 0;
        let dbRealtime = 0;
        for (const d of dbSnap.docs) {
            if (d.id.startsWith('salla_backfill_') || d.id.startsWith('zid_backfill_')) dbBackfill++;
            else dbRealtime++;
        }
        const dbTotal = dbSnap.size;

        let sallaTotal: number | null = null;
        let tokenOk = true;
        if (t.platform === 'salla') {
            const tok = await tokenService.getValidAccessToken(t.storeUid);
            if (!tok) tokenOk = false;
            else sallaTotal = await getSallaRatingTotal(tok);
        }

        rows.push({
            storeUid: t.storeUid,
            platform: t.platform,
            tokenOk,
            sallaTotal,
            dbTotal,
            dbBackfill,
            dbRealtime,
            shortBy: sallaTotal !== null ? sallaTotal - dbTotal : null,
        });
    }

    rows.sort((a, b) => Number(b.dbTotal ?? 0) - Number(a.dbTotal ?? 0));

    return res.status(200).json({
        count: rows.length,
        rows,
    });
}
